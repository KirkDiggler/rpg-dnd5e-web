import { useThree } from '@react-three/fiber';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import type { AnchoredHeldRollGroupState } from './anchoredRollGroupGestureController';
import {
  getConceptDiceRuntimePresetSnapshot,
  preloadConceptDiceRuntimePreset,
  type ConceptDiceRuntimePresetSnapshot,
} from './conceptDiceRuntimeProvider';
import type { DiceMotionPose } from './diceMotionSolver';
import type { DiceRollGroupDie } from './diceRollGroup';
import type { DiceRuntimePresetSnapshot } from './diceRuntimeProvider';
import {
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
} from './diceRuntimeProvider';
import { resolveRuntimeDiceSettlement } from './diceSettlementResolver';
import { createPhaseElapsedClock } from './phaseElapsedClock';
import type { RollGroupMemberLayout } from './rollGroupLayout';
import {
  solveRollGroupMemberMotion,
  type RollGroupFeelProfile,
  type RollGroupMotionPhase,
} from './rollGroupMotionSolver';
import type { RollGroupDieAppearance } from './RollGroupPresentation';
import { RuntimeDiceMesh, type RuntimeDiceMeshSource } from './RuntimeDiceMesh';
import type {
  RuntimeDiceSurfaceGrab,
  RuntimeDiceSurfaceHandle,
} from './runtimeDiceSurfaceGrab';
import type { TrayPlaneProjection } from './trayPlaneProjection';
import type { VisualThrowProfileV1 } from './visualThrowProfile';

export type RollGroupTrayPhase =
  | 'armed'
  | 'held'
  | 'rolling-originals'
  | 'settled-originals'
  | 'reroll-flash'
  | 'rerolling'
  | 'modifiers'
  | 'complete';

export interface ActiveRuntimeSurfaceGrab {
  readonly dieId: string;
  readonly rendererGeneration: number;
  readonly grab: RuntimeDiceSurfaceGrab;
}

export interface RuntimeMemberSurfaceHandle {
  readonly captureSurface: (input: {
    readonly clientX: number;
    readonly clientY: number;
  }) => RuntimeDiceSurfaceGrab | undefined;
  readonly projectSurface: (
    grab: RuntimeDiceSurfaceGrab
  ) => readonly [number, number] | undefined;
  readonly alignSurface: (
    grab: RuntimeDiceSurfaceGrab,
    target: readonly [number, number]
  ) => boolean;
}

type GroupSnapshot =
  | (DiceRuntimePresetSnapshot & {
      readonly assurance: 'verified-production';
    })
  | ConceptDiceRuntimePresetSnapshot;

const DEFAULT_TREATMENT = Object.freeze({
  bodyColor: '#15233b',
  numeralColor: '#f5eddc',
  roughness: 0.72,
  metalness: 0.08,
});

function snapshotFor(
  kind: DiceRollGroupDie['kind'],
  presetId: string
): GroupSnapshot {
  if (kind === 'd20')
    return {
      ...getDiceRuntimePresetSnapshot(presetId),
      assurance: 'verified-production',
    };
  return getConceptDiceRuntimePresetSnapshot(presetId);
}

function sourceFor(snapshot: GroupSnapshot): RuntimeDiceMeshSource | undefined {
  if (
    snapshot.status !== 'ready' ||
    !snapshot.preset ||
    !snapshot.scene ||
    !snapshot.binding
  )
    return undefined;
  return {
    preset: snapshot.preset,
    scene: snapshot.scene,
    binding: snapshot.binding,
  };
}

function snapshotsEqual(left: GroupSnapshot, right: GroupSnapshot) {
  return (
    left.status === right.status &&
    left.assurance === right.assurance &&
    left.preset === right.preset &&
    left.scene === right.scene &&
    left.binding === right.binding &&
    left.failureReason === right.failureReason
  );
}

function phaseForSolver(
  phase: RollGroupTrayPhase,
  affectedByCurrentReroll: boolean
): RollGroupMotionPhase {
  if (phase === 'armed' || phase === 'held') return 'held';
  if (phase === 'rolling-originals') return 'rolling-originals';
  if (phase === 'rerolling')
    return affectedByCurrentReroll ? 'rerolling' : 'settled-originals';
  if (phase === 'settled-originals' || phase === 'reroll-flash')
    return 'settled-originals';
  return 'settled-final';
}

function frameMatchesTarget(
  frame: DiceMotionPose,
  worldQuaternion: readonly [number, number, number, number],
  target: readonly [number, number, number, number]
) {
  if (!frame.observeNow || !frame.exactTargetHeld) return false;
  const magnitude = Math.hypot(...worldQuaternion) * Math.hypot(...target);
  if (!Number.isFinite(magnitude) || magnitude === 0) return false;
  const dot = Math.abs(
    worldQuaternion[0] * target[0] +
      worldQuaternion[1] * target[1] +
      worldQuaternion[2] * target[2] +
      worldQuaternion[3] * target[3]
  );
  return 1 - dot / magnitude <= 0.000001;
}

function viewportFor(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export interface RollGroupRuntimeMemberProps {
  readonly die: DiceRollGroupDie;
  readonly displayedFace: number;
  readonly affectedByCurrentReroll: boolean;
  readonly rerollOccurrenceKey?: string;
  readonly index: number;
  readonly memberCount: number;
  readonly phase: RollGroupTrayPhase;
  readonly feel: RollGroupFeelProfile;
  readonly reducedMotion: boolean;
  readonly throwProfile: VisualThrowProfileV1;
  readonly heldRef: MutableRefObject<AnchoredHeldRollGroupState | undefined>;
  readonly projection: TrayPlaneProjection | undefined;
  readonly heldLayout: RollGroupMemberLayout;
  readonly restingLayout: RollGroupMemberLayout;
  readonly appearance: RollGroupDieAppearance | undefined;
  readonly reportFailure: (dieId: string, reason: string) => void;
  readonly onReady?: (
    input: Readonly<{
      dieId: string;
      runtimeSourceId: number;
      runtimeCloneId: number;
    }>
  ) => void;
  readonly onTargetFrame: (
    dieId: string,
    phase: 'rolling-originals' | 'rerolling' | 'complete'
  ) => void;
  readonly onAttachmentDiagnostic?: (
    diagnostic: Readonly<{
      presentationId: string;
      rendererGeneration: number;
      dieId: string;
      projectedAnchor: readonly [number, number];
      heldPoseApplied: boolean;
      frameSequence: number;
    }>
  ) => void;
  readonly presentationId: string;
  readonly rendererGeneration: number;
  readonly surfaceHandlesRef: MutableRefObject<
    Map<string, RuntimeMemberSurfaceHandle>
  >;
  readonly activeSurfaceGrabRef: MutableRefObject<
    ActiveRuntimeSurfaceGrab | undefined
  >;
}

export function RollGroupRuntimeMember({
  die,
  displayedFace,
  affectedByCurrentReroll,
  rerollOccurrenceKey,
  index,
  memberCount,
  phase,
  feel,
  reducedMotion,
  throwProfile,
  heldRef,
  projection,
  heldLayout,
  restingLayout,
  appearance,
  reportFailure,
  onReady,
  onTargetFrame,
  onAttachmentDiagnostic,
  presentationId,
  rendererGeneration,
  surfaceHandlesRef,
  activeSurfaceGrabRef,
}: RollGroupRuntimeMemberProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const snapshot = useStateSnapshot(die);
  const source = useMemo(() => sourceFor(snapshot), [snapshot]);
  const settlement = useMemo(
    () =>
      source &&
      snapshot.preset &&
      snapshot.preset.dieKind === die.kind &&
      snapshot.preset.presetId === die.presetId
        ? resolveRuntimeDiceSettlement({
            preset: snapshot.preset,
            expectedPresetId: die.presetId,
            authoritativeResult: displayedFace,
          })
        : undefined,
    [die.kind, die.presetId, displayedFace, snapshot.preset, source]
  );
  const failureSent = useRef(false);
  const sequence = useRef(0);
  const witnessedIdentity = useRef<string | undefined>(undefined);
  const phaseClock = useRef(createPhaseElapsedClock());
  const surfaceHandleRef = useMemo(() => {
    let current: RuntimeDiceSurfaceHandle | undefined;
    return {
      get current() {
        return current;
      },
      set current(handle: RuntimeDiceSurfaceHandle | undefined) {
        current = handle;
        if (handle)
          surfaceHandlesRef.current.set(
            die.id,
            Object.freeze({
              captureSurface: (input: {
                readonly clientX: number;
                readonly clientY: number;
              }) =>
                handle.captureSurface({
                  ...input,
                  camera,
                  viewport: viewportFor(gl.domElement),
                }),
              projectSurface: (grab: RuntimeDiceSurfaceGrab) =>
                handle.projectSurface({
                  grab,
                  camera,
                  viewport: viewportFor(gl.domElement),
                }),
              alignSurface: (
                grab: RuntimeDiceSurfaceGrab,
                target: readonly [number, number]
              ) =>
                handle.alignSurface({
                  grab,
                  camera,
                  viewport: viewportFor(gl.domElement),
                  target,
                }),
            })
          );
        else surfaceHandlesRef.current.delete(die.id);
      },
    };
  }, [camera, die.id, gl.domElement, surfaceHandlesRef]);

  const fail = useCallback(
    (reason: string) => {
      if (failureSent.current) return;
      failureSent.current = true;
      reportFailure(die.id, reason);
    },
    [die.id, reportFailure]
  );

  useEffect(() => {
    if (
      phase !== 'rolling-originals' &&
      phase !== 'rerolling' &&
      phase !== 'complete'
    )
      witnessedIdentity.current = undefined;
  }, [phase]);

  useEffect(() => {
    if (snapshot.status === 'failed') {
      fail(snapshot.failureReason ?? 'runtime preset failed');
      return;
    }
    if (snapshot.status !== 'ready') return;
    if (!source) {
      fail('runtime preset ready snapshot is incomplete');
      return;
    }
    if (!settlement) fail('authoritative result has no verified mapping');
  }, [fail, settlement, snapshot, source]);

  const solvePose = useCallback(
    (localElapsedMs: number): DiceMotionPose => {
      const solverPhase = phaseForSolver(phase, affectedByCurrentReroll);
      return solveRollGroupMemberMotion({
        profile: feel,
        phase: solverPhase,
        elapsedMs: localElapsedMs,
        reducedMotion,
        target: settlement?.target ?? [0, 0, 0, 1],
        throwProfile,
        memberIndex: index,
        memberCount,
        held: heldRef.current,
        affectedByCurrentReroll:
          solverPhase === 'rerolling' && affectedByCurrentReroll,
        heldLayout,
        restingLayout,
      });
    },
    [
      affectedByCurrentReroll,
      feel,
      heldLayout,
      heldRef,
      index,
      memberCount,
      phase,
      reducedMotion,
      restingLayout,
      settlement?.target,
      throwProfile,
    ]
  );
  const getPose = useCallback(
    (canvasElapsedMs: number) => {
      const solverPhase = phaseForSolver(phase, affectedByCurrentReroll);
      const animated =
        solverPhase === 'rolling-originals' || solverPhase === 'rerolling';
      const localElapsed = animated
        ? phaseClock.current.elapsed(
            `${phase}:${rerollOccurrenceKey ?? 'none'}:${displayedFace}:${affectedByCurrentReroll ? 1 : 0}`,
            canvasElapsedMs
          )
        : 0;
      return solvePose(localElapsed);
    },
    [
      affectedByCurrentReroll,
      displayedFace,
      phase,
      rerollOccurrenceKey,
      solvePose,
    ]
  );
  const initialPose = useMemo(() => solvePose(0), [solvePose]);

  const handleReady = useCallback(
    (input: Readonly<{ runtimeSourceId: number; runtimeCloneId: number }>) => {
      onReady?.({ dieId: die.id, ...input });
    },
    [die.id, onReady]
  );
  const handlePoseApplied = useCallback(() => {
    const activeGrab = activeSurfaceGrabRef.current;
    const held = heldRef.current;
    const handle = surfaceHandlesRef.current.get(die.id);
    if (
      !activeGrab ||
      !held ||
      !handle ||
      activeGrab.dieId !== die.id ||
      activeGrab.rendererGeneration !== rendererGeneration ||
      held.grabbedDieId !== die.id
    )
      return;
    try {
      const target = projection?.planeToScreen(held.pointerPlane);
      if (!target || !target.every(Number.isFinite)) return;
      if (!handle.alignSurface(activeGrab.grab, target)) return;
      const projectedAnchor = handle.projectSurface(activeGrab.grab);
      if (!projectedAnchor || !projectedAnchor.every(Number.isFinite)) return;
      if (onAttachmentDiagnostic) {
        sequence.current += 1;
        onAttachmentDiagnostic({
          presentationId,
          rendererGeneration,
          dieId: die.id,
          projectedAnchor,
          heldPoseApplied: true,
          frameSequence: sequence.current,
        });
      }
    } catch {
      // Diagnostics are best-effort and must never affect rendering.
    }
  }, [
    activeSurfaceGrabRef,
    die.id,
    heldRef,
    onAttachmentDiagnostic,
    presentationId,
    projection,
    rendererGeneration,
    surfaceHandlesRef,
  ]);
  const handleFrame = useCallback(
    (
      frame: DiceMotionPose,
      worldQuaternion?: readonly [number, number, number, number]
    ) => {
      if (
        (phase !== 'rolling-originals' &&
          phase !== 'rerolling' &&
          phase !== 'complete') ||
        !settlement ||
        !frameMatchesTarget(
          frame,
          worldQuaternion ?? frame.quaternion,
          settlement.target
        )
      )
        return;
      const identity = `${phase}:${rerollOccurrenceKey ?? 'none'}:${displayedFace}`;
      if (witnessedIdentity.current === identity) return;
      witnessedIdentity.current = identity;
      onTargetFrame(die.id, phase);
    },
    [
      die.id,
      displayedFace,
      onTargetFrame,
      phase,
      rerollOccurrenceKey,
      settlement,
    ]
  );

  if (!source || !settlement) return null;
  return (
    <RuntimeDiceMesh
      source={source}
      treatment={appearance?.treatment ?? DEFAULT_TREATMENT}
      initialPose={initialPose}
      getPose={getPose}
      onReady={handleReady}
      onPoseApplied={handlePoseApplied}
      onFrameDrawn={handleFrame}
      onFailure={fail}
      surfaceHandleRef={surfaceHandleRef}
      selectedGroupName={`roll-group-die-${die.id}`}
      shadowName={`roll-group-shadow-${die.id}`}
    />
  );
}

function useStateSnapshot(die: DiceRollGroupDie) {
  const [snapshot, setSnapshot] = useState<GroupSnapshot>(() =>
    snapshotFor(die.kind, die.presetId)
  );
  useEffect(() => {
    let subscribed = true;
    const updateSnapshot = (next: GroupSnapshot) => {
      setSnapshot((current) =>
        snapshotsEqual(current, next) ? current : next
      );
    };
    const refresh = () => {
      if (subscribed) updateSnapshot(snapshotFor(die.kind, die.presetId));
    };
    const initial = snapshotFor(die.kind, die.presetId);
    updateSnapshot(initial);
    if (initial.status === 'idle' || initial.status === 'loading') {
      const owner =
        die.kind === 'd20'
          ? preloadDiceRuntimePreset(die.presetId)
          : preloadConceptDiceRuntimePreset(die.presetId);
      void owner.then(refresh, refresh);
    }
    return () => {
      subscribed = false;
    };
  }, [die.kind, die.presetId]);
  return snapshot;
}
