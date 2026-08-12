import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group, Material, Mesh } from 'three';
import type { DiceTrayPhase } from './DiceTray';
import type {
  AttackDieMaterialMode,
  QuaternionTuple,
} from './attackDieContract';
import { patchAttackDieMaterials } from './attackDieMaterial';
import { angularDistanceDegrees, stepAttackDieMotion } from './attackDieMotion';
import {
  getAttackDieRuntimeScene,
  lockAttackDieRenderer,
  preloadAttackDieRuntime,
  releaseAttackDieRenderer,
} from './attackDieRuntime';
export interface AttackDieTelemetry {
  presentationToken: number;
  requestedResult: number;
  renderer: '3d' | 'svg';
  state: 'locked' | 'tumbling' | 'observed' | 'held' | 'failed' | 'disposed';
  mappedTarget?: QuaternionTuple;
  observedQuaternion?: QuaternionTuple;
  angularErrorDegrees?: number;
  exactTargetHeld: boolean;
  failureReason?: string;
}
export interface AttackDie3DProps {
  result: number;
  presentationToken: number;
  phase: DiceTrayPhase;
  materialMode: AttackDieMaterialMode;
  reducedMotion: boolean;
  fallback: React.ReactNode;
  onTelemetry?: (event: AttackDieTelemetry) => void;
}
function RuntimeDie({
  target,
  materialMode,
  reducedMotion,
  onFailure,
}: {
  target: QuaternionTuple;
  materialMode: AttackDieMaterialMode;
  reducedMotion: boolean;
  onFailure: (reason: string) => void;
}) {
  const group = useRef<Group>(null);
  const start = useRef<number | undefined>(undefined);
  const scene = useMemo(() => {
    const source = getAttackDieRuntimeScene();
    if (!source) return undefined;
    const clone = source.clone(true);
    const materials: Material[] = [];
    clone.traverse((object) => {
      const material = (object as Mesh).material;
      if (Array.isArray(material)) materials.push(...material);
      else if (material) materials.push(material);
    });
    const patched = patchAttackDieMaterials(
      [...new Set(materials)],
      materialMode,
      reducedMotion
    );
    clone.traverse((object) => {
      const mesh = object as Mesh;
      if (Array.isArray(mesh.material))
        mesh.material = mesh.material.map((item) =>
          item === patched.body ? patched.body : item
        );
      else if (
        mesh.material ===
        materials.find((item) => item.name.startsWith('D20_Lightning_Material'))
      )
        mesh.material = patched.body;
    });
    return clone;
  }, [materialMode, reducedMotion]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    start.current ??= clock.elapsedTime * 1000;
    const elapsedMs = clock.elapsedTime * 1000 - start.current;
    const current =
      group.current.quaternion.toArray() as unknown as QuaternionTuple;
    const frame = stepAttackDieMotion({
      elapsedMs,
      reducedMotion,
      current,
      target,
    });
    group.current.quaternion.fromArray(frame.quaternion);
    if (frame.failed) onFailure('motion observation missed');
  });
  if (!scene) return null;
  return (
    <group ref={group} quaternion={target}>
      <primitive object={scene} />
    </group>
  );
}
export function AttackDie3D({
  result,
  presentationToken,
  phase,
  materialMode,
  reducedMotion,
  fallback,
  onTelemetry,
}: AttackDie3DProps) {
  const lockRef = useRef(lockAttackDieRenderer(presentationToken, result));
  const [truthful, setTruthful] = useState(false);
  useEffect(() => {
    void preloadAttackDieRuntime().catch(() => undefined);
    const lock = lockRef.current;
    if (lock.renderer !== '3d' || result < 1 || result > 20) return;
    const target = lock.sidecar?.faces.find(
      (f) => f.result === result
    )?.quaternion;
    if (!target) return;
    let active = true;
    let raf = 0;
    const start = performance.now();
    let current: QuaternionTuple = reducedMotion ? target : [0, 0, 0, 1];
    setTruthful(true);
    const frame = (now: number) => {
      if (!active) return;
      const next = stepAttackDieMotion({
        elapsedMs: now - start,
        reducedMotion,
        current,
        target,
      });
      current = next.quaternion;
      if (next.failed) {
        lock.fail('motion observation missed');
        setTruthful(false);
        onTelemetry?.({
          presentationToken,
          requestedResult: result,
          renderer: 'svg',
          state: 'failed',
          exactTargetHeld: false,
          failureReason: 'motion observation missed',
        });
        return;
      }
      if (next.observeNow)
        onTelemetry?.({
          presentationToken,
          requestedResult: result,
          renderer: '3d',
          state: 'observed',
          mappedTarget: target,
          observedQuaternion: current,
          angularErrorDegrees: angularDistanceDegrees(current, target),
          exactTargetHeld: next.exactTargetHeld,
        });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      releaseAttackDieRenderer(presentationToken);
      onTelemetry?.({
        presentationToken,
        requestedResult: result,
        renderer: lock.renderer,
        state: 'disposed',
        exactTargetHeld: false,
      });
    };
  }, [onTelemetry, presentationToken, reducedMotion, result]);
  const show3d =
    truthful && lockRef.current.renderer === '3d' && phase !== 'hidden';
  return (
    <div className="attack-die-3d">
      <div
        className={
          show3d
            ? 'attack-die-3d__fallback attack-die-3d__fallback--covered'
            : 'attack-die-3d__fallback'
        }
      >
        {fallback}
      </div>
      {show3d && (
        <Canvas
          aria-hidden="true"
          className="attack-die-3d__canvas"
          onCreated={({ gl }) => {
            const lost = () => {
              lockRef.current.fail('WebGL context lost');
              setTruthful(false);
            };
            gl.domElement.addEventListener('webglcontextlost', lost, {
              once: true,
            });
          }}
        >
          <ambientLight intensity={1.2} />
          <RuntimeDie
            target={
              lockRef.current.sidecar!.faces.find(
                (face) => face.result === result
              )!.quaternion
            }
            materialMode={materialMode}
            reducedMotion={reducedMotion}
            onFailure={(reason) => {
              lockRef.current.fail(reason);
              setTruthful(false);
            }}
          />
        </Canvas>
      )}
    </div>
  );
}
