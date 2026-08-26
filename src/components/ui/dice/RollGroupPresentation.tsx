import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  DiceRollGroupInput,
  DiceRollGroupKey,
  DiceRollRerollStep,
} from './diceRollGroup';
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
  createRollGroupPresentationState,
  reduceRollGroupPresentation,
  type RollGroupPresentationState,
} from './rollGroupPresentationState';
import { RollGroupTray3D } from './RollGroupTray3D';
import { SemanticRollGroup } from './SemanticRollGroup';
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

interface RerollBatchEntry {
  readonly dieId: string;
  readonly step: DiceRollRerollStep;
}

interface RerollBatch {
  readonly displayLabel: string;
  readonly entries: readonly RerollBatchEntry[];
  readonly dieIds: readonly string[];
}

type CallbackFence = {
  release?: (profile?: VisualThrowProfileV1) => void;
  originals?: () => void;
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

function eventIdentity(event: DiceRollGroupEvent) {
  return JSON.stringify(event);
}

function compatibleRelease(
  request: DiceRollGroupRequestedEvent,
  release: DiceRollGroupReleasedEvent
) {
  return (
    release.presentationId === request.presentationId &&
    release.release.presentationId === request.presentationId &&
    release.release.groupKey === request.group.key
  );
}

function profileSeed(presentationId: string) {
  let result = 2_166_136_261;
  for (const character of presentationId) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function releaseEventId(presentationId: string) {
  const readable = `${presentationId}:release`;
  return readable.length <= 128
    ? readable
    : `release:${profileSeed(presentationId).toString(16)}`;
}

function createRerollBatches(
  group: DiceRollGroupInput
): readonly RerollBatch[] {
  const batches: RerollBatch[] = [];
  const maxSteps = group.dice.reduce(
    (largest, die) => Math.max(largest, die.rerolls.length),
    0
  );
  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const byLabel = new Map<string, RerollBatchEntry[]>();
    for (const die of group.dice) {
      const step = die.rerolls[stepIndex];
      if (!step) continue;
      const entries = byLabel.get(step.displayLabel) ?? [];
      entries.push(Object.freeze({ dieId: die.id, step }));
      byLabel.set(step.displayLabel, entries);
    }
    for (const [displayLabel, entries] of byLabel) {
      const frozenEntries = Object.freeze(entries);
      batches.push(
        Object.freeze({
          displayLabel,
          entries: frozenEntries,
          dieIds: Object.freeze(entries.map((entry) => entry.dieId)),
        })
      );
    }
  }
  return Object.freeze(batches);
}

function displayedFaces(
  group: DiceRollGroupInput,
  batches: readonly RerollBatch[],
  state: RollGroupPresentationState
): Readonly<Record<string, number>> {
  let appliedBatchCount = 0;
  if (state.phase === 'reroll-flash') appliedBatchCount = state.rerollIndex;
  else if (state.phase === 'rerolling')
    appliedBatchCount = state.rerollIndex + 1;
  else if (state.phase === 'modifiers' || state.phase === 'complete')
    appliedBatchCount = batches.length;

  const faces: Record<string, number> = {};
  for (const die of group.dice) faces[die.id] = die.originalFace;
  for (const batch of batches.slice(0, appliedBatchCount)) {
    for (const entry of batch.entries) faces[entry.dieId] = entry.step.after;
  }
  return Object.freeze(faces);
}

function currentRerollBatch(
  batches: readonly RerollBatch[],
  state: RollGroupPresentationState
) {
  return state.phase === 'reroll-flash' || state.phase === 'rerolling'
    ? batches[state.rerollIndex]
    : undefined;
}

function statusText(
  label: string,
  state: RollGroupPresentationState,
  batch: RerollBatch | undefined,
  fallback: boolean
) {
  if (state.phase === 'armed')
    return `${label} requested · waiting for release event`;
  if (state.phase === 'rolling-originals')
    return `${label} release delivered · rolling originals`;
  if (state.phase === 'settled-originals')
    return `${label} original dice settled`;
  if (state.phase === 'reroll-flash')
    return `${label} reroll flash${batch ? ` · ${batch.displayLabel}` : ''}`;
  if (state.phase === 'rerolling')
    return `${label} rerolling${batch ? ` · ${batch.displayLabel}` : ''}`;
  if (state.phase === 'modifiers') return `${label} modifiers`;
  return fallback
    ? `${label} complete · semantic fallback`
    : `${label} roll complete`;
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
  const timerFence = useRef(0);

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
    handleOriginalsSettled,
    handleReady,
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

  useEffect(() => {
    if (!boundaryMounted || fallback) return undefined;
    let action: Parameters<typeof reduceRollGroupPresentation>[1] | undefined;
    let delay = 0;
    if (state.phase === 'settled-originals') {
      action = { type: 'reroll-flash-complete' };
    } else if (state.phase === 'reroll-flash') {
      action = { type: 'reroll-flash-complete' };
      delay = reducedMotion
        ? 0
        : ROLL_GROUP_FEEL_PROFILES[feel].flashDurationMs;
    } else if (state.phase === 'rerolling') {
      action = { type: 'reroll-settled' };
      delay = reducedMotion
        ? 0
        : ROLL_GROUP_FEEL_PROFILES[feel].rerollDurationMs;
    } else if (state.phase === 'modifiers') {
      action = { type: 'modifier-shown' };
      delay = reducedMotion
        ? 0
        : ROLL_GROUP_FEEL_PROFILES[feel].modifierDurationMs;
    }
    if (!action) return undefined;

    timerFence.current += 1;
    const timerGeneration = timerFence.current;
    const timer = window.setTimeout(() => {
      if (isCurrentGeneration() && timerFence.current === timerGeneration)
        dispatch(action);
    }, delay);
    return () => {
      timerFence.current += 1;
      window.clearTimeout(timer);
    };
  }, [
    boundaryMounted,
    fallback,
    feel,
    isCurrentGeneration,
    reducedMotion,
    state.modifierIndex,
    state.phase,
    state.rerollIndex,
  ]);

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
    if (state.phase === 'complete' && rendererReady) complete('3d');
  }, [
    boundaryMounted,
    complete,
    fallback,
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
  const visibleModifiers = request.group.modifiers.slice(
    0,
    visibleModifierCount
  );

  return (
    <section
      data-testid="roll-group-presentation"
      data-witness-role={witnessRole}
      data-renderer-generation={rendererGeneration}
      aria-label={label}
    >
      <p role="status" aria-live="polite">
        {statusText(label, semanticState, batch, fallback)}
      </p>
      {boundaryMounted ? (
        fallback ? (
          <SemanticRollGroup
            group={request.group}
            presentation={semanticState}
            presentationToken={rendererGeneration}
          />
        ) : (
          <RollGroupTray3D
            label={label}
            presentationId={request.presentationId}
            rendererGeneration={rendererGeneration}
            motionSeed={profileSeed(request.presentationId)}
            rollerRole={request.roller.role}
            witnessRole={witnessRole}
            phase={state.phase}
            group={request.group}
            feel={ROLL_GROUP_FEEL_PROFILES[feel]}
            appearances={appearances}
            displayedFaces={faces}
            rerollDieIds={batch?.dieIds}
            throwProfile={releaseProfile}
            onReleaseRequest={handleReleaseRequest}
            onOriginalsSettled={handleOriginalsSettled}
            onReady={handleReady}
            onFailure={handleFailure}
            onAttachmentDiagnostic={handleAttachmentDiagnostic}
            reducedMotion={reducedMotion}
            forceFailure={forceFailure}
          />
        )
      ) : null}
      {!fallback && visibleModifiers.length > 0 ? (
        <ul aria-label="Roll modifiers">
          {visibleModifiers.map((modifier) => (
            <li key={modifier.id}>
              <span>{modifier.displayLabel}</span>:{' '}
              {'value' in modifier ? modifier.value : modifier.text}
            </li>
          ))}
        </ul>
      ) : null}
      {semanticState.phase === 'complete' &&
      request.group.suppliedFinalTotal !== undefined ? (
        <output
          role="presentation"
          aria-label="Final total"
          data-testid="roll-group-total"
        >
          {String(request.group.suppliedFinalTotal)}
        </output>
      ) : null}
    </section>
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
