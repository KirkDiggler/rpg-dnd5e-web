import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { DiceRollGroupKey } from './diceRollGroup';
import type {
  DiceRollGroupEvent,
  DiceRollGroupReleasedEvent,
  DiceRollGroupRequestedEvent,
} from './diceRollGroupEvent';
import { projectDiceRollGroupEvents } from './diceRollGroupEvent';
import type { DiceMaterialTreatment } from './materialFreeCarvedMesh';
import {
  ROLL_GROUP_FEEL_PROFILES,
  type RollGroupFeelCandidateId,
} from './rollGroupMotionSolver';
import {
  compatibleRelease,
  createRerollBatches,
  currentRerollBatch,
  displayedFaces,
  eventIdentity,
  profileSeed,
  releaseEventId,
} from './rollGroupPresentationModel';
import {
  createRollGroupPresentationState,
  reduceRollGroupPresentation,
  type RollGroupPresentationState,
} from './rollGroupPresentationState';
import { RollGroupPresentationView } from './RollGroupPresentationView';
import { useRollGroupPhaseTimer } from './useRollGroupPhaseTimer';
import {
  createNeutralVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

export interface RollGroupDieAppearance {
  readonly dieId: string;
  readonly treatment: DiceMaterialTreatment;
}

export interface RollGroupAttachmentDiagnostic {
  readonly presentationId: string;
  readonly groupKey: DiceRollGroupKey;
  readonly witnessRole: 'roller' | 'spectator';
  readonly rendererGeneration: number;
  readonly dieId: string;
  readonly projectedAnchor: readonly [number, number];
  readonly heldPoseApplied: boolean;
  readonly frameSequence: number;
}

export interface DiceRollGroupPresentationProps {
  readonly mode: 'roll-group';
  readonly label: string;
  readonly events: readonly DiceRollGroupEvent[];
  readonly witnessRole: 'roller' | 'spectator';
  readonly feel: RollGroupFeelCandidateId;
  readonly appearances: readonly RollGroupDieAppearance[];
  readonly onReleaseRequest?: (event: DiceRollGroupReleasedEvent) => void;
  readonly onMount?: (
    mount: Readonly<{
      presentationId: string;
      groupKey: DiceRollGroupKey;
      witnessRole: 'roller' | 'spectator';
      rendererGeneration: number;
    }>
  ) => void;
  readonly onComplete?: (
    completion: Readonly<{
      presentationId: string;
      groupKey: DiceRollGroupKey;
      witnessRole: 'roller' | 'spectator';
      rendererGeneration: number;
      renderer: '3d' | 'semantic';
    }>
  ) => void;
  readonly onAttachmentDiagnostic?: (
    diagnostic: RollGroupAttachmentDiagnostic
  ) => void;
  readonly reducedMotion?: boolean;
  readonly forceFailure?: 'provider' | 'webgl' | 'solver';
  readonly onDiagnostic?: (
    diagnostic: Readonly<{
      presentationId: string;
      groupKey: DiceRollGroupKey;
      witnessRole: 'roller' | 'spectator';
      rendererGeneration: number;
      feel: RollGroupFeelCandidateId;
      releaseAccepted: boolean;
      originalsSettled: boolean;
      rerollsCompleted: number;
      modifiersCompleted: number;
      fallback: boolean;
    }>
  ) => void;
}

type CallbackFence = {
  release?: (profile?: VisualThrowProfileV1) => void;
  originals?: () => void;
  reroll?: () => void;
  finalFrame?: () => void;
  ready?: (
    input: Readonly<{
      dieId: string;
      runtimeSourceId: number;
      runtimeCloneId: number;
    }>
  ) => void;
  failure?: (dieId: string, reason: string) => void;
  attachment?: (
    diagnostic: Readonly<{
      presentationId: string;
      rendererGeneration: number;
      dieId: string;
      projectedAnchor: readonly [number, number];
      heldPoseApplied: boolean;
      frameSequence: number;
    }>
  ) => void;
};

let nextRendererGeneration = -100_000;
function allocateRendererGeneration() {
  const generation = nextRendererGeneration;
  nextRendererGeneration -= 1;
  return generation;
}

function RollGroupPresentationInstance({
  label,
  request: projectedRequest,
  release,
  witnessRole,
  feel,
  appearances,
  onReleaseRequest,
  onMount,
  onComplete,
  onAttachmentDiagnostic,
  reducedMotion = false,
  forceFailure,
  onDiagnostic,
}: Omit<DiceRollGroupPresentationProps, 'mode' | 'events'> & {
  readonly request: DiceRollGroupRequestedEvent;
  readonly release?: DiceRollGroupReleasedEvent;
}) {
  const requestRef = useRef(projectedRequest);
  const request = requestRef.current;
  const generationRef = useRef<number | undefined>(undefined);
  if (generationRef.current === undefined)
    generationRef.current = allocateRendererGeneration();
  const rendererGeneration = generationRef.current;
  const rerollBatches = useMemo(
    () => createRerollBatches(request.group),
    [request.group]
  );
  const counts = useMemo(
    () => ({
      rerollCount: rerollBatches.length,
      modifierCount: request.group.modifiers.length,
    }),
    [request.group.modifiers.length, rerollBatches.length]
  );
  const initialRelease =
    release && compatibleRelease(request, release) ? release : undefined;
  const acceptedReleaseRef = useRef(initialRelease);
  const releaseIdentityRef = useRef(
    initialRelease ? eventIdentity(initialRelease) : undefined
  );
  const releaseRequested = useRef(false);
  const [boundaryMounted, setBoundaryMounted] = useState(false);
  const [fallback, setFallback] = useState(forceFailure !== undefined);
  const [rendererReady, setRendererReady] = useState(
    request.group.dice.length === 0
  );
  const [finalFrameRendered, setFinalFrameRendered] = useState(
    request.group.dice.length === 0
  );
  const [state, dispatch] = useReducer(
    (
      current: RollGroupPresentationState,
      action: Parameters<typeof reduceRollGroupPresentation>[1]
    ) => reduceRollGroupPresentation(current, action, counts),
    undefined,
    () =>
      createRollGroupPresentationState({
        released: initialRelease !== undefined,
        hydrated: initialRelease !== undefined,
        ...counts,
      })
  );
  const active = useRef(false);
  const mountSent = useRef(false);
  const completeSent = useRef(false);
  const originalsSettled = useRef(initialRelease !== undefined);
  const readyDieIds = useRef(new Set<string>());
  const callbackFence = useRef<CallbackFence>({});

  useLayoutEffect(() => {
    active.current = true;
    if (!mountSent.current) {
      mountSent.current = true;
      onMount?.(
        Object.freeze({
          presentationId: request.presentationId,
          groupKey: request.group.key,
          witnessRole,
          rendererGeneration,
        })
      );
    }
    setBoundaryMounted(true);
    return () => {
      active.current = false;
      callbackFence.current = {};
    };
  }, [
    onMount,
    rendererGeneration,
    request.group.key,
    request.presentationId,
    witnessRole,
  ]);

  useLayoutEffect(() => {
    if (acceptedReleaseRef.current) return;
    const accepted =
      release && compatibleRelease(request, release) ? release : undefined;
    if (!accepted) return;
    const identity = eventIdentity(accepted);
    if (releaseIdentityRef.current === identity) return;
    releaseIdentityRef.current = identity;
    acceptedReleaseRef.current = accepted;
    dispatch({ type: 'release-delivered' });
  }, [release, request]);

  const isCurrentGeneration = useCallback(
    () => active.current && generationRef.current === rendererGeneration,
    [rendererGeneration]
  );

  const handleReleaseRequest = useCallback(
    (profile?: VisualThrowProfileV1) => {
      if (
        !isCurrentGeneration() ||
        callbackFence.current.release !== handleReleaseRequest ||
        releaseRequested.current ||
        witnessRole !== 'roller' ||
        request.roller.role !== 'player' ||
        !onReleaseRequest ||
        state.phase !== 'armed' ||
        acceptedReleaseRef.current
      )
        return;
      releaseRequested.current = true;
      onReleaseRequest(
        Object.freeze({
          schemaVersion: 1,
          type: 'dice-roll-group-released',
          eventId: releaseEventId(request.presentationId),
          presentationId: request.presentationId,
          release: Object.freeze({
            schemaVersion: 1,
            presentationId: request.presentationId,
            groupKey: request.group.key,
            throwProfile:
              profile ??
              createNeutralVisualThrowProfile(
                profileSeed(request.presentationId)
              ),
          }),
        })
      );
    },
    [
      isCurrentGeneration,
      onReleaseRequest,
      request.group.key,
      request.presentationId,
      request.roller.role,
      state.phase,
      witnessRole,
    ]
  );

  const handleOriginalsSettled = useCallback(() => {
    if (
      !isCurrentGeneration() ||
      callbackFence.current.originals !== handleOriginalsSettled ||
      fallback ||
      state.phase !== 'rolling-originals'
    )
      return;
    originalsSettled.current = true;
    dispatch({ type: 'originals-settled' });
  }, [fallback, isCurrentGeneration, state.phase]);

  const handleRerollSettled = useCallback(() => {
    if (
      !isCurrentGeneration() ||
      callbackFence.current.reroll !== handleRerollSettled ||
      fallback ||
      state.phase !== 'rerolling'
    )
      return;
    dispatch({ type: 'reroll-settled' });
  }, [fallback, isCurrentGeneration, state.phase]);

  const handleFinalFrameRendered = useCallback(() => {
    if (
      !isCurrentGeneration() ||
      callbackFence.current.finalFrame !== handleFinalFrameRendered ||
      fallback ||
      state.phase !== 'complete'
    )
      return;
    setFinalFrameRendered(true);
  }, [fallback, isCurrentGeneration, state.phase]);

  const handleReady = useCallback(
    (
      input: Readonly<{
        dieId: string;
        runtimeSourceId: number;
        runtimeCloneId: number;
      }>
    ) => {
      if (
        !isCurrentGeneration() ||
        callbackFence.current.ready !== handleReady ||
        !request.group.dice.some((die) => die.id === input.dieId) ||
        !Number.isSafeInteger(input.runtimeSourceId) ||
        !Number.isSafeInteger(input.runtimeCloneId)
      )
        return;
      readyDieIds.current.add(input.dieId);
      if (readyDieIds.current.size === request.group.dice.length)
        setRendererReady(true);
    },
    [isCurrentGeneration, request.group.dice]
  );

  const handleFailure = useCallback(() => {
    if (
      !isCurrentGeneration() ||
      callbackFence.current.failure !== handleFailure
    )
      return;
    setFallback(true);
  }, [isCurrentGeneration]);

  const handleAttachmentDiagnostic = useCallback(
    (
      diagnostic: Readonly<{
        presentationId: string;
        rendererGeneration: number;
        dieId: string;
        projectedAnchor: readonly [number, number];
        heldPoseApplied: boolean;
        frameSequence: number;
      }>
    ) => {
      if (
        !isCurrentGeneration() ||
        callbackFence.current.attachment !== handleAttachmentDiagnostic ||
        diagnostic.presentationId !== request.presentationId ||
        diagnostic.rendererGeneration !== rendererGeneration ||
        !request.group.dice.some((die) => die.id === diagnostic.dieId) ||
        diagnostic.projectedAnchor.length !== 2 ||
        !diagnostic.projectedAnchor.every(Number.isFinite) ||
        diagnostic.heldPoseApplied !== true ||
        !Number.isSafeInteger(diagnostic.frameSequence) ||
        diagnostic.frameSequence < 1
      )
        return;
      onAttachmentDiagnostic?.(
        Object.freeze({
          presentationId: request.presentationId,
          groupKey: request.group.key,
          witnessRole,
          rendererGeneration,
          dieId: diagnostic.dieId,
          projectedAnchor: Object.freeze([
            diagnostic.projectedAnchor[0],
            diagnostic.projectedAnchor[1],
          ] as [number, number]),
          heldPoseApplied: true,
          frameSequence: diagnostic.frameSequence,
        })
      );
    },
    [
      isCurrentGeneration,
      onAttachmentDiagnostic,
      rendererGeneration,
      request.group.dice,
      request.group.key,
      request.presentationId,
      witnessRole,
    ]
  );

  useLayoutEffect(() => {
    callbackFence.current = {
      release: handleReleaseRequest,
      originals: handleOriginalsSettled,
      reroll: handleRerollSettled,
      finalFrame: handleFinalFrameRendered,
      ready: handleReady,
      failure: handleFailure,
      attachment: handleAttachmentDiagnostic,
    };
    return () => {
      if (callbackFence.current.release === handleReleaseRequest)
        callbackFence.current = {};
    };
  }, [
    handleAttachmentDiagnostic,
    handleFailure,
    handleFinalFrameRendered,
    handleOriginalsSettled,
    handleReady,
    handleRerollSettled,
    handleReleaseRequest,
  ]);

  useLayoutEffect(() => {
    if (
      boundaryMounted &&
      isCurrentGeneration() &&
      !fallback &&
      state.phase === 'rolling-originals' &&
      request.group.dice.length === 0
    ) {
      originalsSettled.current = true;
      dispatch({ type: 'originals-settled' });
    }
  }, [
    boundaryMounted,
    fallback,
    isCurrentGeneration,
    request.group.dice.length,
    state.phase,
  ]);

  useRollGroupPhaseTimer({
    boundaryMounted,
    fallback,
    feel,
    isCurrentGeneration,
    reducedMotion,
    state,
    dispatch,
  });

  const complete = useCallback(
    (renderer: '3d' | 'semantic') => {
      if (!isCurrentGeneration() || completeSent.current) return;
      completeSent.current = true;
      onComplete?.(
        Object.freeze({
          presentationId: request.presentationId,
          groupKey: request.group.key,
          witnessRole,
          rendererGeneration,
          renderer,
        })
      );
      onDiagnostic?.(
        Object.freeze({
          presentationId: request.presentationId,
          groupKey: request.group.key,
          witnessRole,
          rendererGeneration,
          feel,
          releaseAccepted: acceptedReleaseRef.current !== undefined,
          originalsSettled: originalsSettled.current,
          rerollsCompleted:
            renderer === 'semantic' ? counts.rerollCount : state.rerollIndex,
          modifiersCompleted:
            renderer === 'semantic'
              ? counts.modifierCount
              : state.modifierIndex,
          fallback: renderer === 'semantic',
        })
      );
    },
    [
      counts.modifierCount,
      counts.rerollCount,
      feel,
      isCurrentGeneration,
      onComplete,
      onDiagnostic,
      rendererGeneration,
      request.group.key,
      request.presentationId,
      state.modifierIndex,
      state.rerollIndex,
      witnessRole,
    ]
  );

  useLayoutEffect(() => {
    if (!boundaryMounted || !isCurrentGeneration()) return;
    if (fallback) {
      if (acceptedReleaseRef.current) complete('semantic');
      return;
    }
    if (state.phase === 'complete' && rendererReady && finalFrameRendered)
      complete('3d');
  }, [
    boundaryMounted,
    complete,
    fallback,
    finalFrameRendered,
    isCurrentGeneration,
    rendererReady,
    state.phase,
  ]);

  const semanticState = fallback
    ? createRollGroupPresentationState({
        released: acceptedReleaseRef.current !== undefined,
        hydrated: true,
        ...counts,
      })
    : state;
  const batch = currentRerollBatch(rerollBatches, state);
  const faces = displayedFaces(request.group, rerollBatches, state);
  const releaseProfile = acceptedReleaseRef.current?.release.throwProfile;
  const visibleModifierCount =
    semanticState.phase === 'complete'
      ? request.group.modifiers.length
      : semanticState.phase === 'modifiers'
        ? semanticState.modifierIndex
        : 0;
  return (
    <RollGroupPresentationView
      label={label}
      request={request}
      witnessRole={witnessRole}
      rendererGeneration={rendererGeneration}
      boundaryMounted={boundaryMounted}
      fallback={fallback}
      state={state}
      semanticState={semanticState}
      batch={batch}
      faces={faces}
      releaseProfile={releaseProfile}
      feel={ROLL_GROUP_FEEL_PROFILES[feel]}
      appearances={appearances}
      visibleModifierCount={visibleModifierCount}
      releaseAuthority={
        witnessRole === 'roller' &&
        request.roller.role === 'player' &&
        onReleaseRequest !== undefined
      }
      onReleaseRequest={handleReleaseRequest}
      onOriginalsSettled={handleOriginalsSettled}
      onRerollSettled={handleRerollSettled}
      onFinalFrameRendered={handleFinalFrameRendered}
      onReady={handleReady}
      onFailure={handleFailure}
      onAttachmentDiagnostic={handleAttachmentDiagnostic}
      reducedMotion={reducedMotion}
      forceFailure={forceFailure}
      motionSeed={profileSeed(request.presentationId)}
    />
  );
}

export function RollGroupPresentation({
  events,
  witnessRole,
  ...props
}: DiceRollGroupPresentationProps) {
  const projection = projectDiceRollGroupEvents(events);
  if (!projection.request) return null;
  return (
    <RollGroupPresentationInstance
      {...props}
      key={`${projection.request.presentationId}:${witnessRole}`}
      request={projection.request}
      release={projection.release}
      witnessRole={witnessRole}
    />
  );
}
