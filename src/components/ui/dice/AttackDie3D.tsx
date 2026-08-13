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
import { resolveAttackDiePrimitives } from './attackDiePrimitive';
import {
  getAttackDieRuntimeScene,
  lockAttackDieRenderer,
  preloadAttackDieRuntime,
  releaseAttackDieRenderer,
} from './attackDieRuntime';
import { ATTACK_DIE_VISUAL_CONFIG } from './attackDieVisualConfig';
import { resolveAttackDieRendererVisuals } from './attackDieVisualRuntime';

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
  magicalAnimation?: boolean;
  decorativeSeed?: number;
  fallback: React.ReactNode;
  onTelemetry?: (event: AttackDieTelemetry) => void;
  /** Development concept camera; omitted in production-intent usage. */
  cameraView?: 'top' | 'three-quarter';
  /** Development calibration pose override; never supplied by production. */
  calibrationPose?: QuaternionTuple;
  /** Development-only failure exercise; normal behavior is unchanged. */
  forceFailure?: 'shader' | 'invalid-result' | 'unmapped';
  /** Development-only observed provider failure from the actual load/hash path. */
  providerFailureReason?: string;
  /** Development-only parsed scene for provisional, not-yet-verified calibration. */
  sceneOverride?: ReturnType<typeof getAttackDieRuntimeScene>;
  /** Development-only inspected candidate sidecar metadata. */
  sidecarOverride?: AttackDieRuntimeSidecar;
  onRendererInfo?: (info: {
    calls: number | null;
    triangles: number | null;
    geometries: number | null;
    textures: number | null;
    programs: number | null;
    lifecycle: 'created' | 'sample' | 'lost' | 'disposed';
    contextId: number;
    observationLimitation?: string;
  }) => void;
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
  reducedMotion: boolean,
  sourceOverride?: ReturnType<typeof getAttackDieRuntimeScene>
) {
  const source = sourceOverride ?? getAttackDieRuntimeScene();
  if (!source) throw Error('runtime scene unavailable');
  if (source.name === sidecar.selectors.node && !source.parent) {
    const wrapper = source.clone(false);
    wrapper.name = 'attack-die-scene-root';
    wrapper.add(source);
    sourceOverride = wrapper;
  }
  const effectiveSource = sourceOverride ?? source;
  effectiveSource.traverse((object) => {
    object.userData.attackDieSourceName = object.name;
  });
  const scene = effectiveSource.clone(true);
  const { body, numeral } = resolveAttackDiePrimitives(
    scene,
    sidecar.selectors
  );
  const bodyMaterial = (
    Array.isArray(body.material) ? body.material[0] : body.material
  ).clone();
  const numeralMaterial = (
    Array.isArray(numeral.material) ? numeral.material[0] : numeral.material
  ).clone();
  const patched = patchAttackDieMaterials(
    [bodyMaterial, numeralMaterial],
    mode,
    reducedMotion,
    {
      bodyMaterial: sidecar.selectors.bodyPrimitive.material,
      numeralMaterial: sidecar.selectors.numeralPrimitive.material,
    }
  );
  body.material = patched.body;
  numeral.material = numeralMaterial;
  const owned = [
    bodyMaterial,
    numeralMaterial,
    ...(patched.owned ? [patched.body] : []),
  ] as Material[];
  let disposed = false;
  return {
    scene,
    updateShaderTime(time: number) {
      patched.setTime(time);
    },
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
  sceneOverride,
  magicalAnimation,
  decorativeSeed,
}: {
  sidecar: AttackDieRuntimeSidecar;
  target: QuaternionTuple;
  mode: AttackDieMaterialMode;
  reducedMotion: boolean;
  onFrame: (frame: AttackDieMotionFrame) => void;
  poseValidated: React.MutableRefObject<boolean>;
  onFailure: (reason: string) => void;
  sceneOverride?: ReturnType<typeof getAttackDieRuntimeScene>;
  magicalAnimation: boolean;
  decorativeSeed: number;
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
      const next = cloneTokenScene(sidecar, mode, reducedMotion, sceneOverride);
      setBundle(next);
      return () => next.dispose();
    } catch (error) {
      onFailure(
        `render setup failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  }, [mode, onFailure, reducedMotion, sceneOverride, sidecar]);
  useFrame(({ clock }) => {
    poseValidated.current = false;
    start.current ??= clock.elapsedTime * 1000;
    const frame = stepAttackDieMotion({
      elapsedMs: clock.elapsedTime * 1000 - start.current,
      reducedMotion,
      current: renderedQuaternion.current,
      target,
      decorativeSeed,
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
      if (magicalAnimation && !reducedMotion)
        bundle?.updateShaderTime(clock.elapsedTime);
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

let nextAttackDieContextId = 1;
function AttackDieToken({
  result,
  presentationToken,
  phase,
  materialMode,
  reducedMotion,
  magicalAnimation = true,
  decorativeSeed = presentationToken,
  fallback,
  onTelemetry,
  cameraView = 'three-quarter',
  calibrationPose,
  forceFailure,
  providerFailureReason,
  sceneOverride,
  sidecarOverride,
  onRendererInfo,
}: AttackDie3DProps) {
  const visual = ATTACK_DIE_VISUAL_CONFIG;
  const rendererVisuals = resolveAttackDieRendererVisuals(visual);
  const effectiveResult = forceFailure === 'invalid-result' ? 21 : result;
  const lock = useMemo(
    () => lockAttackDieRenderer(presentationToken, effectiveResult),
    [presentationToken, effectiveResult]
  );
  const sidecar = sidecarOverride ?? lock.sidecar;
  const mappedTarget = sidecar?.faces.find(
    (face) => face.result === effectiveResult
  )?.quaternion;
  const target = calibrationPose ?? mappedTarget;
  const forced = forceFailure !== undefined;
  const authoringEligible =
    calibrationPose !== undefined &&
    sidecarOverride !== undefined &&
    sceneOverride !== undefined;
  const eligible =
    (authoringEligible || lock.renderer === '3d') &&
    !!sidecar &&
    !!target &&
    effectiveResult >= 1 &&
    effectiveResult <= 20 &&
    !['invalid-result', 'unmapped'].includes(forceFailure ?? '');
  const [truthful, setTruthful] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const contextId = useRef<number | undefined>(undefined);
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
    if (!forced)
      void preloadAttackDieRuntime().catch((error) =>
        fail(
          `runtime load failed: ${error instanceof Error ? error.message : 'unknown'}`
        )
      );
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
      if (contextId.current !== undefined) {
        const renderer = listener.current?.renderer;
        renderer?.dispose();
        renderer?.forceContextLoss();
        onRendererInfo?.({
          calls: renderer?.info.render.calls ?? null,
          triangles: renderer?.info.render.triangles ?? null,
          geometries: renderer?.info.memory.geometries ?? null,
          textures: renderer?.info.memory.textures ?? null,
          programs: renderer?.info.programs?.length ?? null,
          lifecycle: 'disposed',
          contextId: contextId.current,
          observationLimitation: renderer
            ? 'Observed renderer.info after dispose/forceContextLoss of only the owned overlay renderer; browser context release is not synchronously queryable.'
            : 'Owned renderer was unavailable at disposal; resource release is unknown.',
        });
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
  }, [
    fail,
    forced,
    lock,
    onRendererInfo,
    onTelemetry,
    presentationToken,
    result,
  ]);
  useEffect(() => {
    if (providerFailureReason)
      fail(`provider failure: ${providerFailureReason}`);
    if (forceFailure === 'invalid-result')
      fail('invalid authoritative result: expected 1–20');
    if (forceFailure === 'unmapped')
      fail('authoritative result has no verified mapping');
  }, [fail, forceFailure, providerFailureReason]);
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
            camera={(() => {
              const c =
                cameraView === 'top'
                  ? visual.topCamera
                  : visual.threeQuarterCamera;
              return {
                fov: c.fov,
                near: c.near,
                far: c.far,
                position: c.position,
                up: c.up,
              };
            })()}
            dpr={visual.devicePixelRatio}
            onCreated={({ gl, scene, camera }) => {
              try {
                contextId.current = nextAttackDieContextId++;
                onRendererInfo?.({
                  calls: gl.info.render.calls,
                  triangles: gl.info.render.triangles,
                  geometries: gl.info.memory.geometries,
                  textures: gl.info.memory.textures,
                  programs: gl.info.programs?.length ?? 0,
                  lifecycle: 'created',
                  contextId: contextId.current,
                });
                gl.toneMapping = rendererVisuals.toneMapping;
                gl.outputColorSpace = rendererVisuals.outputColorSpace;
                gl.toneMappingExposure = visual.exposure;
                scene.environment = rendererVisuals.environment;
                camera.lookAt?.(
                  ...visual[
                    cameraView === 'top' ? 'topCamera' : 'threeQuarterCamera'
                  ].target
                );
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
                    if (active.current) {
                      setTruthful(true);
                      onRendererInfo?.({
                        calls: gl.info.render.calls,
                        triangles: gl.info.render.triangles,
                        geometries: gl.info.memory.geometries,
                        textures: gl.info.memory.textures,
                        programs: gl.info.programs?.length ?? 0,
                        lifecycle: 'sample',
                        contextId: contextId.current!,
                      });
                    }
                  },
                  onFailure: fail,
                  forceShaderFailure: forceFailure === 'shader',
                });
                const callback: EventListener = (event) => {
                  event.preventDefault();
                  onRendererInfo?.({
                    calls: gl.info.render.calls,
                    triangles: gl.info.render.triangles,
                    geometries: gl.info.memory.geometries,
                    textures: gl.info.memory.textures,
                    programs: gl.info.programs?.length ?? 0,
                    lifecycle: 'lost',
                    contextId: contextId.current!,
                  });
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
            <ambientLight intensity={visual.ambientIntensity} />
            <directionalLight
              position={visual.keyLight.position}
              intensity={visual.keyLight.intensity}
            />
            <directionalLight
              position={visual.fillLight.position}
              intensity={visual.fillLight.intensity}
            />
            <group scale={visual.dieScale}>
              <RuntimeDie
                sidecar={sidecar!}
                target={target!}
                mode={materialMode}
                reducedMotion={reducedMotion}
                poseValidated={poseValidated}
                onFailure={fail}
                sceneOverride={sceneOverride}
                magicalAnimation={magicalAnimation}
                decorativeSeed={decorativeSeed}
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
            </group>
          </Canvas>
        </RenderBoundary>
      )}
    </div>
  );
}
export function AttackDie3D(props: AttackDie3DProps) {
  return <AttackDieToken key={props.presentationToken} {...props} />;
}
