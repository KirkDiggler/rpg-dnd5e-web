import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Quaternion, Vector3 } from 'three';
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
import type { DiceTrayInteractionHitRegion } from './DiceTrayInteractionSurface';
import { DiceTrayInteractionSurface } from './DiceTrayInteractionSurface';
import {
  layoutHeldRollGroup,
  layoutRestingRollGroup,
  type RollGroupMemberLayout,
} from './rollGroupLayout';
import {
  ROLL_GROUP_FEEL_PROFILES,
  solveRollGroupMemberMotion,
  type RollGroupFeelProfile,
  type RollGroupMotionPhase,
} from './rollGroupMotionSolver';
import type { RollGroupDieAppearance } from './RollGroupPresentation';
import type { RuntimeDiceMeshSource } from './RuntimeDiceMesh';
import { RuntimeDiceMesh } from './RuntimeDiceMesh';
import type { TrayPlaneProjection } from './trayPlaneProjection';
import { TrayPlaneProjectionBridge } from './TrayPlaneProjectionBridge';
import {
  createNeutralVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

export interface RollGroupTray3DProps {
  readonly label: string;
  readonly presentationId: string;
  readonly rendererGeneration: number;
  readonly motionSeed: number;
  readonly rollerRole: 'player' | 'monster';
  readonly witnessRole: 'roller' | 'spectator';
  readonly phase:
    | 'armed'
    | 'held'
    | 'rolling-originals'
    | 'settled-originals'
    | 'reroll-flash'
    | 'rerolling'
    | 'modifiers'
    | 'complete';
  readonly group: {
    readonly key: 'attack' | 'damage';
    readonly dice: readonly DiceRollGroupDie[];
  };
  readonly feel: RollGroupFeelProfile;
  readonly appearances: readonly RollGroupDieAppearance[];
  readonly displayedFaces?: Readonly<Record<string, number>>;
  readonly rerollDieIds?: readonly string[];
  readonly throwProfile?: VisualThrowProfileV1;
  readonly onReleaseRequest?: (profile?: VisualThrowProfileV1) => void;
  readonly onOriginalsSettled?: () => void;
  readonly onReady?: (
    input: Readonly<{
      dieId: string;
      runtimeSourceId: number;
      runtimeCloneId: number;
    }>
  ) => void;
  readonly onFailure?: (dieId: string, reason: string) => void;
  readonly onAttachmentDiagnostic?: (
    diagnostic: Readonly<{
      readonly presentationId: string;
      readonly rendererGeneration: number;
      readonly dieId: string;
      readonly projectedAnchor: readonly [number, number];
      readonly heldPoseApplied: boolean;
      readonly frameSequence: number;
    }>
  ) => void;
  readonly reducedMotion?: boolean;
  readonly forceFailure?: 'provider' | 'webgl' | 'solver';
}

type GroupSnapshot =
  | (DiceRuntimePresetSnapshot & {
      readonly assurance: 'verified-production';
    })
  | ConceptDiceRuntimePresetSnapshot;

type GroupPhase = RollGroupTray3DProps['phase'];

const DEFAULT_TREATMENT = Object.freeze({
  bodyColor: '#15233b',
  numeralColor: '#f5eddc',
  roughness: 0.72,
  metalness: 0.08,
});
const NEUTRAL_PROFILE = createNeutralVisualThrowProfile(0);

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
  phase: GroupPhase,
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

function isFinitePoint(point: readonly number[]): point is [number, number] {
  return point.length === 2 && point.every(Number.isFinite);
}

function RuntimeAttachmentReporter({
  frame,
  die,
  held,
  camera,
  domElement,
  onAttachmentDiagnostic,
  sequence,
  presentationId,
  rendererGeneration,
}: {
  readonly frame: DiceMotionPose;
  readonly die: DiceRollGroupDie;
  readonly held: AnchoredHeldRollGroupState | undefined;
  readonly camera: import('three').Camera;
  readonly domElement: HTMLElement;
  readonly onAttachmentDiagnostic?: RollGroupTray3DProps['onAttachmentDiagnostic'];
  readonly sequence: React.MutableRefObject<number>;
  readonly presentationId: string;
  readonly rendererGeneration: number;
}) {
  if (!held || held.grabbedDieId !== die.id || !onAttachmentDiagnostic)
    return null;
  try {
    const localAnchor = new Vector3(held.anchor[0], 0, held.anchor[1]);
    localAnchor.applyQuaternion(new Quaternion(...frame.quaternion));
    localAnchor.add(new Vector3(...frame.translation));
    localAnchor.project(camera);
    const rect = domElement.getBoundingClientRect();
    const projectedAnchor: [number, number] = [
      rect.left + ((localAnchor.x + 1) / 2) * rect.width,
      rect.top + ((1 - localAnchor.y) / 2) * rect.height,
    ];
    if (!isFinitePoint(projectedAnchor)) return null;
    sequence.current += 1;
    onAttachmentDiagnostic({
      presentationId,
      rendererGeneration,
      dieId: die.id,
      projectedAnchor,
      heldPoseApplied: true,
      frameSequence: sequence.current,
    });
  } catch {
    // Diagnostics are best-effort and must never affect rendering.
  }
  return null;
}

function RuntimeGroupMember({
  die,
  displayedFace,
  affectedByCurrentReroll,
  index,
  memberCount,
  phase,
  feel,
  reducedMotion,
  throwProfile,
  heldRef,
  heldLayout,
  restingLayout,
  appearance,
  reportFailure,
  onReady,
  onOriginalsSettled,
  onAttachmentDiagnostic,
  presentationId,
  rendererGeneration,
}: {
  readonly die: DiceRollGroupDie;
  readonly displayedFace: number;
  readonly affectedByCurrentReroll: boolean;
  readonly index: number;
  readonly memberCount: number;
  readonly phase: GroupPhase;
  readonly feel: RollGroupFeelProfile;
  readonly reducedMotion: boolean;
  readonly throwProfile: VisualThrowProfileV1;
  readonly heldRef: React.MutableRefObject<
    AnchoredHeldRollGroupState | undefined
  >;
  readonly heldLayout: RollGroupMemberLayout;
  readonly restingLayout: RollGroupMemberLayout;
  readonly appearance: RollGroupDieAppearance | undefined;
  readonly reportFailure: (dieId: string, reason: string) => void;
  readonly onReady?: RollGroupTray3DProps['onReady'];
  readonly onOriginalsSettled?: (dieId: string) => void;
  readonly onAttachmentDiagnostic?: RollGroupTray3DProps['onAttachmentDiagnostic'];
  readonly presentationId: string;
  readonly rendererGeneration: number;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const [snapshot, setSnapshot] = useState<GroupSnapshot>(() =>
    snapshotFor(die.kind, die.presetId)
  );
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
  const settled = useRef(false);
  const rollStartedAt = useRef<number | undefined>(undefined);
  const previousPhase = useRef<GroupPhase>(phase);

  const fail = useCallback(
    (reason: string) => {
      if (failureSent.current) return;
      failureSent.current = true;
      reportFailure(die.id, reason);
    },
    [die.id, reportFailure]
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
    if (!settlement) {
      fail('authoritative result has no verified mapping');
      return;
    }
  }, [fail, settlement, snapshot, source]);

  const getPose = useCallback(
    (elapsedMs: number): DiceMotionPose => {
      const held = heldRef.current;
      const solverPhase = phaseForSolver(phase, affectedByCurrentReroll);
      if (
        phase !== previousPhase.current ||
        (phase === 'rolling-originals' && rollStartedAt.current === undefined)
      ) {
        if (phase === 'rolling-originals' || phase === 'rerolling')
          rollStartedAt.current = elapsedMs;
        else rollStartedAt.current = undefined;
        previousPhase.current = phase;
        if (phase !== 'rolling-originals') settled.current = false;
      }
      const localElapsed =
        solverPhase === 'rolling-originals' || solverPhase === 'rerolling'
          ? Math.max(0, elapsedMs - (rollStartedAt.current ?? elapsedMs))
          : 0;
      return solveRollGroupMemberMotion({
        profile: feel,
        phase: solverPhase,
        elapsedMs: localElapsed,
        reducedMotion,
        target: settlement?.target ?? [0, 0, 0, 1],
        throwProfile,
        memberIndex: index,
        memberCount,
        held,
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
      reducedMotion,
      restingLayout,
      settlement?.target,
      phase,
      throwProfile,
    ]
  );

  const initialPose = useMemo(() => getPose(0), [getPose]);
  const handlePoseApplied = useCallback(
    (frame: DiceMotionPose) => {
      RuntimeAttachmentReporter({
        frame,
        die,
        held: heldRef.current,
        camera,
        domElement: gl.domElement,
        onAttachmentDiagnostic,
        sequence,
        presentationId,
        rendererGeneration,
      });
    },
    [
      camera,
      die,
      gl.domElement,
      heldRef,
      onAttachmentDiagnostic,
      presentationId,
      rendererGeneration,
    ]
  );
  const handleReady = useCallback(
    (input: Readonly<{ runtimeSourceId: number; runtimeCloneId: number }>) => {
      onReady?.({ dieId: die.id, ...input });
    },
    [die.id, onReady]
  );
  const handleFrame = useCallback(
    (frame: DiceMotionPose) => {
      if (phase !== 'rolling-originals' || !frame.observeNow || settled.current)
        return;
      settled.current = true;
      onOriginalsSettled?.(die.id);
    },
    [die.id, onOriginalsSettled, phase]
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
      onFrame={handleFrame}
      onFailure={fail}
      selectedGroupName={`roll-group-die-${die.id}`}
      shadowName={`roll-group-shadow-${die.id}`}
    />
  );
}

function targetStyle(layout: RollGroupMemberLayout) {
  return {
    left: `${50 + layout.center[0] * 50}%`,
    top: `${50 - layout.center[1] * 50}%`,
    width: `${Math.max(8, layout.radius * 100)}%`,
    aspectRatio: '1',
    transform: 'translate(-50%, -50%)',
  } as const;
}

export function RollGroupTray3D({
  label,
  presentationId,
  rendererGeneration,
  motionSeed,
  rollerRole,
  witnessRole,
  phase,
  group,
  feel,
  appearances,
  displayedFaces,
  rerollDieIds = [],
  throwProfile = NEUTRAL_PROFILE,
  onReleaseRequest,
  onOriginalsSettled,
  onReady,
  onFailure,
  onAttachmentDiagnostic,
  reducedMotion = false,
  forceFailure,
}: RollGroupTray3DProps) {
  const heldRef = useRef<AnchoredHeldRollGroupState | undefined>(undefined);
  const projectionRef = useRef<TrayPlaneProjection | undefined>(undefined);
  const [projection, setProjection] = useState<TrayPlaneProjection>();
  const reportedFailure = useRef(false);
  const originalsSettledIds = useRef(new Set<string>());
  const originalsReported = useRef(false);
  const targetRefs = useRef(
    new Map<string, HTMLButtonElement | HTMLDivElement>()
  );
  const heldLayout = useMemo(
    () => layoutHeldRollGroup(group.dice),
    [group.dice]
  );
  const restingLayout = useMemo(
    () => layoutRestingRollGroup(group.dice, motionSeed),
    [group.dice, motionSeed]
  );
  const layoutById = useMemo(
    () =>
      new Map(restingLayout.map((layout) => [layout.dieId, layout] as const)),
    [restingLayout]
  );
  const heldLayoutById = useMemo(
    () => new Map(heldLayout.map((layout) => [layout.dieId, layout] as const)),
    [heldLayout]
  );
  const usesHeldLayout = phase === 'armed' || phase === 'held';
  const interactionLayoutById = usesHeldLayout ? heldLayoutById : layoutById;
  const interactionLayout = usesHeldLayout ? heldLayout : restingLayout;
  const rerollDieIdSet = useMemo(() => new Set(rerollDieIds), [rerollDieIds]);
  const diceIdentity = group.dice.map((die) => die.id).join('|');
  const canInteract =
    phase === 'armed' &&
    rollerRole === 'player' &&
    witnessRole === 'roller' &&
    onReleaseRequest !== undefined;

  const reportFailure = useCallback(
    (dieId: string, reason: string) => {
      if (reportedFailure.current) return;
      reportedFailure.current = true;
      onFailure?.(dieId, reason);
    },
    [onFailure]
  );

  useEffect(() => {
    if (forceFailure)
      reportFailure(group.dice[0]?.id ?? 'group', `${forceFailure} failure`);
  }, [forceFailure, group.dice, reportFailure]);

  useEffect(() => {
    originalsSettledIds.current = new Set();
    originalsReported.current = false;
  }, [diceIdentity, phase, presentationId, rendererGeneration]);

  const handleMemberOriginalSettled = useCallback(
    (dieId: string) => {
      if (
        phase !== 'rolling-originals' ||
        originalsReported.current ||
        !group.dice.some((die) => die.id === dieId)
      )
        return;
      originalsSettledIds.current.add(dieId);
      if (originalsSettledIds.current.size !== group.dice.length) return;
      originalsReported.current = true;
      onOriginalsSettled?.();
    },
    [group.dice, onOriginalsSettled, phase]
  );

  const getHitRegions =
    useCallback((): readonly DiceTrayInteractionHitRegion[] => {
      return group.dice.flatMap((die, index) => {
        const target = targetRefs.current.get(die.id);
        const layout = interactionLayoutById.get(die.id);
        if (!target || !layout) return [];
        try {
          const rect = target.getBoundingClientRect();
          return [
            {
              dieId: die.id,
              bounds: {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              },
              memberAnchor: layout.center,
              stableIndex: index,
            },
          ];
        } catch {
          return [];
        }
      });
    }, [group.dice, interactionLayoutById]);

  const heldChange = useCallback((held: unknown) => {
    heldRef.current =
      held &&
      typeof held === 'object' &&
      'grabbedDieId' in held &&
      typeof held.grabbedDieId === 'string'
        ? (held as AnchoredHeldRollGroupState)
        : undefined;
  }, []);
  const requestNeutralRelease = useCallback(() => {
    onReleaseRequest?.(createNeutralVisualThrowProfile(motionSeed));
  }, [motionSeed, onReleaseRequest]);

  return (
    <section
      aria-label={label}
      data-testid="roll-group-tray-3d"
      data-phase={phase}
      data-witness-role={witnessRole}
      className="dice-tray-3d-shell dice-tray-3d-shell--compact roll-group-tray-3d"
    >
      <DiceTrayInteractionSurface
        mode="tray-plane"
        canInteract={canInteract}
        motionSeed={motionSeed}
        projection={projection}
        getHitRegions={getHitRegions}
        onHeldChange={heldChange}
        onReleaseRequest={onReleaseRequest}
        className="dice-tray-3d-renderer roll-group-tray-3d__surface"
        testId="roll-group-tray-surface"
      >
        <Canvas
          aria-hidden="true"
          className="roll-group-tray-3d__canvas"
          camera={{
            fov: 35,
            near: 0.1,
            far: 100,
            position: [0, 3, 0],
            up: [0, 0, -1],
          }}
        >
          <ambientLight intensity={1.4} />
          <directionalLight position={[0.7, 1.7, 0.7]} intensity={2.1} />
          <TrayPlaneProjectionBridge
            origin={[0, 0, 0]}
            xAxis={[1, 0, 0]}
            yAxis={[0, 0, 1]}
            width={2}
            height={2}
            projectionRef={projectionRef}
            onProjection={setProjection}
          />
          {group.dice.map((die, index) => (
            <RuntimeGroupMember
              key={die.id}
              die={die}
              displayedFace={
                displayedFaces?.[die.id] ??
                (phase === 'modifiers' || phase === 'complete'
                  ? die.finalFace
                  : die.originalFace)
              }
              affectedByCurrentReroll={rerollDieIdSet.has(die.id)}
              index={index}
              memberCount={group.dice.length}
              phase={phase}
              feel={feel}
              reducedMotion={reducedMotion}
              throwProfile={throwProfile}
              heldRef={heldRef}
              heldLayout={heldLayoutById.get(die.id) ?? heldLayout[0]}
              restingLayout={layoutById.get(die.id) ?? restingLayout[0]}
              appearance={appearances.find(
                (appearance) => appearance.dieId === die.id
              )}
              reportFailure={reportFailure}
              onReady={onReady}
              onOriginalsSettled={handleMemberOriginalSettled}
              onAttachmentDiagnostic={onAttachmentDiagnostic}
              presentationId={presentationId}
              rendererGeneration={rendererGeneration}
            />
          ))}
        </Canvas>
        <div className="roll-group-tray-3d__targets" aria-hidden={!canInteract}>
          {group.dice.map((die) => {
            const layout =
              interactionLayoutById.get(die.id) ?? interactionLayout[0];
            const common = {
              ref: (element: HTMLButtonElement | HTMLDivElement | null) => {
                if (element) targetRefs.current.set(die.id, element);
                else targetRefs.current.delete(die.id);
              },
              style: targetStyle(layout),
              'data-roll-group-die-id': die.id,
              'data-renderer-generation': rendererGeneration,
              'data-witness-role': witnessRole,
            } as const;
            return canInteract ? (
              <button
                key={die.id}
                type="button"
                aria-label={`Grab ${die.kind}`}
                {...common}
              />
            ) : (
              <div key={die.id} {...common} />
            );
          })}
        </div>
        {canInteract ? (
          <button
            type="button"
            aria-label="Roll dice"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={requestNeutralRelease}
          >
            Roll dice
          </button>
        ) : null}
      </DiceTrayInteractionSurface>
    </section>
  );
}

export { ROLL_GROUP_FEEL_PROFILES };
