import { Canvas, useFrame } from '@react-three/fiber';
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Quaternion,
  type Group,
  type Material,
  type Mesh,
  type WebGLRenderer,
} from 'three';
import type { DiceTrayPhase } from './DiceTray';
import type {
  AttackDieMaterialMode,
  AttackDieRuntimeSidecar,
  QuaternionTuple,
} from './attackDieContract';
import { patchAttackDieMaterials } from './attackDieMaterial';
import {
  angularDistanceDegrees,
  stepAttackDieMotion,
  type AttackDieMotionFrame,
} from './attackDieMotion';
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

import { installAttackDieRenderGate } from './attackDieRenderGate';

class RenderBoundary extends Component<
  { onError: (reason: string) => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(`render failure: ${error.message}`);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function cloneTokenScene(
  sidecar: AttackDieRuntimeSidecar,
  mode: AttackDieMaterialMode,
  reducedMotion: boolean
) {
  const source = getAttackDieRuntimeScene();
  if (!source) throw Error('runtime scene unavailable');
  const scene = source.clone(true);
  const node = scene.getObjectByName(sidecar.selectors.node);
  if (!node) throw Error('attack die node selector failed');
  const mesh = node.getObjectByName(sidecar.selectors.mesh) as Mesh | undefined;
  if (!mesh?.isMesh) throw Error('attack die mesh selector failed');
  const slots = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (slots.length !== sidecar.selectors.materialSlots)
    throw Error('attack die material slot count failed');
  const tokenSlots = slots.map((material) => material.clone());
  const patched = patchAttackDieMaterials(
    tokenSlots,
    mode,
    reducedMotion,
    sidecar.selectors
  );
  mesh.material = tokenSlots.map((material) =>
    material === patched.originalBody ? patched.body : material
  );
  const owned = [
    ...tokenSlots,
    ...(patched.owned ? [patched.body] : []),
  ] as Material[];
  let disposed = false;
  return {
    scene,
    dispose() {
      if (disposed) return;
      disposed = true;
      owned.forEach((material) => material.dispose());
    },
  };
}

function RuntimeDie({
  sidecar,
  target,
  mode,
  reducedMotion,
  onFrame,
  poseValidated,
  onFailure,
}: {
  sidecar: AttackDieRuntimeSidecar;
  target: QuaternionTuple;
  mode: AttackDieMaterialMode;
  reducedMotion: boolean;
  onFrame: (frame: AttackDieMotionFrame) => void;
  poseValidated: React.MutableRefObject<boolean>;
  onFailure: (reason: string) => void;
}) {
  const group = useRef<Group>(null);
  const start = useRef<number | undefined>(undefined);

  const initial: QuaternionTuple = reducedMotion
    ? target
    : [0.31, -0.47, 0.19, 0.805];
  const renderedQuaternion = useRef<QuaternionTuple>(initial);
  const [bundle, setBundle] = useState<ReturnType<typeof cloneTokenScene>>();
  useEffect(() => {
    try {
      const next = cloneTokenScene(sidecar, mode, reducedMotion);
      setBundle(next);
      return () => next.dispose();
    } catch (error) {
      onFailure(
        `render setup failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  }, [mode, onFailure, reducedMotion, sidecar]);
  useFrame(({ clock }) => {
    poseValidated.current = false;
    start.current ??= clock.elapsedTime * 1000;
    const frame = stepAttackDieMotion({
      elapsedMs: clock.elapsedTime * 1000 - start.current,
      reducedMotion,
      current: renderedQuaternion.current,
      target,
    });
    renderedQuaternion.current = frame.quaternion;
    if (frame.failed) {
      poseValidated.current = false;
      onFailure('motion observation missed');
      return;
    }
    const selectedGroup = group.current;
    if (!selectedGroup?.quaternion) {
      poseValidated.current = false;
      return;
    }
    try {
      selectedGroup.quaternion.copy(new Quaternion(...frame.quaternion));
      poseValidated.current = true;
      onFrame(frame);
    } catch (error) {
      onFailure(
        `motion pose application failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  });
  if (!bundle) return null;
  return (
    <group ref={group} quaternion={initial}>
      <primitive object={bundle.scene} />
    </group>
  );
}

function AttackDieToken({
  result,
  presentationToken,
  phase,
  materialMode,
  reducedMotion,
  fallback,
  onTelemetry,
}: AttackDie3DProps) {
  const lock = useMemo(
    () => lockAttackDieRenderer(presentationToken, result),
    [presentationToken, result]
  );
  const target = lock.sidecar?.faces.find(
    (face) => face.result === result
  )?.quaternion;
  const eligible =
    lock.renderer === '3d' && !!target && result >= 1 && result <= 20;
  const [truthful, setTruthful] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const listener = useRef<
    | {
        renderer: WebGLRenderer;
        callback: EventListener;
        gate: ReturnType<typeof installAttackDieRenderGate>;
      }
    | undefined
  >(undefined);
  const poseValidated = useRef(false);
  const fail = useCallback(
    (reason: string) => {
      if (!active.current) return;
      lock.fail(reason);
      setTruthful(false);
      setFailed(true);
      onTelemetry?.({
        presentationToken,
        requestedResult: result,
        renderer: 'svg',
        state: 'failed',
        exactTargetHeld: false,
        failureReason: reason,
      });
    },
    [lock, onTelemetry, presentationToken, result]
  );
  useEffect(() => {
    active.current = true;
    void preloadAttackDieRuntime().catch(() => undefined);
    return () => {
      active.current = false;
      const current = listener.current;
      if (current) {
        current.renderer.domElement.removeEventListener(
          'webglcontextlost',
          current.callback
        );
        current.gate.dispose();
      }
      releaseAttackDieRenderer(presentationToken);
      onTelemetry?.({
        presentationToken,
        requestedResult: result,
        renderer: lock.renderer,
        state: 'disposed',
        exactTargetHeld: false,
      });
    };
  }, [lock, onTelemetry, presentationToken, result]);
  const canvasVisible = eligible && !failed && phase !== 'hidden';
  return (
    <div className="attack-die-3d">
      <div
        className={`attack-die-3d__fallback${truthful ? ' attack-die-3d__fallback--covered' : ''}`}
      >
        {fallback}
      </div>
      {canvasVisible && (
        <RenderBoundary onError={fail}>
          <Canvas
            aria-hidden="true"
            className="attack-die-3d__canvas"
            style={{ visibility: truthful ? 'visible' : 'hidden' }}
            onCreated={({ gl, scene, camera }) => {
              try {
                const existing = listener.current;
                if (existing) {
                  existing.renderer.domElement.removeEventListener(
                    'webglcontextlost',
                    existing.callback
                  );
                  existing.gate.dispose();
                }
                const gate = installAttackDieRenderGate(gl, scene, camera, {
                  isActive: () => active.current,
                  isPoseValidated: () => poseValidated.current,
                  onReady: () => {
                    if (active.current) setTruthful(true);
                  },
                  onFailure: fail,
                });
                const callback: EventListener = (event) => {
                  event.preventDefault();
                  gate.fail('WebGL context lost');
                };
                gl.domElement.addEventListener('webglcontextlost', callback);
                listener.current = {
                  renderer: gl,
                  callback,
                  gate,
                };
              } catch (error) {
                fail(
                  `shader readiness failed: ${error instanceof Error ? error.message : 'unknown'}`
                );
              }
            }}
          >
            <ambientLight intensity={1.2} />
            <RuntimeDie
              sidecar={lock.sidecar!}
              target={target!}
              mode={materialMode}
              reducedMotion={reducedMotion}
              poseValidated={poseValidated}
              onFailure={fail}
              onFrame={(frame) => {
                if (!active.current || !frame.observeNow) return;
                onTelemetry?.({
                  presentationToken,
                  requestedResult: result,
                  renderer: '3d',
                  state: 'observed',
                  mappedTarget: target,
                  observedQuaternion: frame.quaternion,
                  angularErrorDegrees: angularDistanceDegrees(
                    frame.quaternion,
                    target!
                  ),
                  exactTargetHeld: frame.exactTargetHeld,
                });
              }}
            />
          </Canvas>
        </RenderBoundary>
      )}
    </div>
  );
}
export function AttackDie3D(props: AttackDie3DProps) {
  return <AttackDieToken key={props.presentationToken} {...props} />;
}
