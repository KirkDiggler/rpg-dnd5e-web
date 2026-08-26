import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getConceptDiceRuntimePresetSnapshot,
  preloadConceptDiceRuntimePreset,
  type ConceptDiceRuntimePresetSnapshot,
  type DiceRuntimeAssurance,
} from './conceptDiceRuntimeProvider';
import type { DiceMotionPose } from './diceMotionSolver';
import type { DiceRollGroupDie } from './diceRollGroup';
import type { DiceRuntimePresetSnapshot } from './diceRuntimeProvider';
import {
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
} from './diceRuntimeProvider';
import { resolveRuntimeDiceSettlement } from './diceSettlementResolver';
import type { DiceMaterialTreatment } from './materialFreeCarvedMesh';
import { RuntimeDiceMesh, type RuntimeDiceMeshSource } from './RuntimeDiceMesh';

export interface RollGroupDie3DProps {
  readonly die: DiceRollGroupDie;
  readonly displayedFace: number;
  readonly presentationToken: number;
  readonly pose: DiceMotionPose;
  readonly treatment: DiceMaterialTreatment;
  readonly onReady?: (
    input: Readonly<{
      dieId: string;
      assurance: DiceRuntimeAssurance;
      runtimeSourceId: number;
      runtimeCloneId: number;
    }>
  ) => void;
  readonly onFailure?: (dieId: string, reason: string) => void;
}

type GroupSnapshot =
  | (DiceRuntimePresetSnapshot & { readonly assurance: 'verified-production' })
  | ConceptDiceRuntimePresetSnapshot;

function conceptSnapshot(presetId: string): GroupSnapshot {
  return getConceptDiceRuntimePresetSnapshot(presetId);
}

function sourceFromSnapshot(
  snapshot: GroupSnapshot
): RuntimeDiceMeshSource | undefined {
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

export function RollGroupDie3D({
  die,
  displayedFace,
  presentationToken,
  pose,
  treatment,
  onReady,
  onFailure,
}: RollGroupDie3DProps) {
  const production = die.kind === 'd20';
  const [snapshot, setSnapshot] = useState<GroupSnapshot>(() =>
    production
      ? {
          ...getDiceRuntimePresetSnapshot(die.presetId),
          assurance: 'verified-production',
        }
      : conceptSnapshot(die.presetId)
  );
  const [failed, setFailed] = useState(false);
  const failureSent = useRef(false);
  const reportFailure = useCallback(
    (reason: string) => {
      if (failureSent.current) return;
      failureSent.current = true;
      setFailed(true);
      onFailure?.(die.id, reason);
    },
    [die.id, onFailure]
  );

  useEffect(() => {
    let subscribed = true;
    const readSnapshot = () =>
      production
        ? {
            ...getDiceRuntimePresetSnapshot(die.presetId),
            assurance: 'verified-production' as const,
          }
        : conceptSnapshot(die.presetId);
    const updateSnapshot = (next: GroupSnapshot) => {
      setSnapshot((current) =>
        snapshotsEqual(current, next) ? current : next
      );
    };
    const refresh = () => {
      if (subscribed) updateSnapshot(readSnapshot());
    };
    const initial = readSnapshot();
    updateSnapshot(initial);
    if (initial.status === 'idle' || initial.status === 'loading') {
      const owner = production
        ? preloadDiceRuntimePreset(die.presetId)
        : preloadConceptDiceRuntimePreset(die.presetId);
      void owner.then(refresh, refresh);
    }
    return () => {
      subscribed = false;
    };
  }, [die.presetId, production]);

  const source = useMemo(() => sourceFromSnapshot(snapshot), [snapshot]);
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

  useEffect(() => {
    if (snapshot.status === 'failed') {
      reportFailure(snapshot.failureReason ?? 'runtime preset failed');
      return;
    }
    if (snapshot.status !== 'ready') return;
    if (production && snapshot.assurance !== 'verified-production') {
      reportFailure('verified production assurance was downgraded');
      return;
    }
    if (!production && snapshot.assurance !== 'provisional-concept') {
      reportFailure('concept runtime assurance is not provisional');
      return;
    }
    if (!source) {
      reportFailure('runtime preset ready snapshot is incomplete');
      return;
    }
    if (!settlement) {
      reportFailure('displayed face is not supported by the runtime preset');
      return;
    }
  }, [production, reportFailure, settlement, snapshot, source]);

  const handleReady = useCallback(
    (
      input: Readonly<{
        runtimeSourceId: number;
        runtimeCloneId: number;
      }>
    ) => {
      if (failureSent.current) return;
      onReady?.({
        dieId: die.id,
        assurance: snapshot.assurance,
        runtimeSourceId: input.runtimeSourceId,
        runtimeCloneId: input.runtimeCloneId,
      });
    },
    [die.id, onReady, snapshot.assurance]
  );

  const handleMeshFailure = useCallback(
    (reason: string) => reportFailure(reason),
    [reportFailure]
  );

  if (failed || !source || !settlement) return null;
  return (
    <Canvas
      key={presentationToken}
      aria-hidden="true"
      className="roll-group-die-3d__canvas"
      camera={{ fov: 35, near: 0.1, far: 100, position: [0, 0.7, 0.7] }}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[0.7, 1.7, 0.7]} intensity={2.1} />
      <RuntimeDiceMesh
        source={source}
        treatment={treatment}
        initialPose={pose}
        getPose={() => pose}
        onReady={handleReady}
        onFailure={handleMeshFailure}
        selectedGroupName={`roll-group-die-${die.id}`}
        shadowName={`roll-group-shadow-${die.id}`}
      />
    </Canvas>
  );
}
