import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Group, Material, Mesh, WebGLRenderer } from 'three';
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
  onReady,
  onFrame,
  shaderDiagnostic,
  onFailure,
}: {
  sidecar: AttackDieRuntimeSidecar;
  target: QuaternionTuple;
  mode: AttackDieMaterialMode;
  reducedMotion: boolean;
  onReady: () => void;
  onFrame: (frame: AttackDieMotionFrame) => void;
  shaderDiagnostic: React.MutableRefObject<string | undefined>;
  onFailure: (reason: string) => void;
}) {
  const group = useRef<Group>(null);
  const start = useRef<number | undefined>(undefined);
  const ready = useRef(false);
  const { gl, scene: renderScene, camera } = useThree();
  const initial: QuaternionTuple = reducedMotion
    ? target
    : [0.31, -0.47, 0.19, 0.805];
  const renderedQuaternion = useRef<QuaternionTuple>(initial);
  const elapsedFrames = useRef(0);
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
    start.current ??= clock.elapsedTime * 1000;
    const frame = stepAttackDieMotion({
      elapsedMs: clock.elapsedTime * 1000 - start.current,
      reducedMotion,
      current: renderedQuaternion.current,
      target,
    });
    renderedQuaternion.current = frame.quaternion;
    group.current?.quaternion?.fromArray(frame.quaternion);
    onFrame(frame);
    if (frame.failed) {
      onFailure('motion observation missed');
      return;
    }
    if (!ready.current) {
      try {
        gl.compile(renderScene, camera);
        if (shaderDiagnostic.current) {
          onFailure(shaderDiagnostic.current);
          return;
        }
        if (elapsedFrames.current++ > 0) {
          ready.current = true;
          onReady();
        }
      } catch (error) {
        onFailure(
          `shader readiness failed: ${error instanceof Error ? error.message : 'unknown'}`
        );
      }
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
        previousShaderError: WebGLRenderer['debug']['onShaderError'];
        previousCheckShaderErrors: boolean;
      }
    | undefined
  >(undefined);
  const shaderDiagnostic = useRef<string | undefined>(undefined);
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
        current.renderer.debug.onShaderError = current.previousShaderError;
        current.renderer.debug.checkShaderErrors =
          current.previousCheckShaderErrors;
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
                  existing.renderer.debug.onShaderError =
                    existing.previousShaderError;
                  existing.renderer.debug.checkShaderErrors =
                    existing.previousCheckShaderErrors;
                }
                const previousShaderError = gl.debug.onShaderError;
                const previousCheckShaderErrors = gl.debug.checkShaderErrors;
                gl.debug.checkShaderErrors = true;
                gl.debug.onShaderError = () => {
                  shaderDiagnostic.current = 'shader diagnostic/link failure';
                  fail(shaderDiagnostic.current);
                };
                gl.compile(scene, camera);
                const callback: EventListener = (event) => {
                  event.preventDefault();
                  fail('WebGL context lost');
                };
                gl.domElement.addEventListener('webglcontextlost', callback);
                listener.current = {
                  renderer: gl,
                  callback,
                  previousShaderError,
                  previousCheckShaderErrors,
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
              onReady={() => {
                if (active.current) setTruthful(true);
              }}
              shaderDiagnostic={shaderDiagnostic}
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
