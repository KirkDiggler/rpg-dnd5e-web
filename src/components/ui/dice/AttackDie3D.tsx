import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
import { applyAttackDieCamera } from './attackDieCamera';
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
import { ownAttackDieRendererLifecycle } from './attackDieRendererLifecycle';
import {
  getAttackDieRuntimeScene,
  lockAttackDieRenderer,
  preloadAttackDieRuntime,
  releaseAttackDieRenderer,
} from './attackDieRuntime';
import { ATTACK_DIE_VISUAL_CONFIG } from './attackDieVisualConfig';
import { resolveAttackDieRendererVisuals } from './attackDieVisualRuntime';

export type AttackDieFailureCode =
  | 'provider-load'
  | 'provider-hash'
  | 'webgl-unavailable'
  | 'shader-failure'
  | 'context-loss'
  | 'invalid-result'
  | 'unmapped-result';
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
  failureCode?: AttackDieFailureCode;
}
export interface AttackDieRendererInfo {
  calls: number | null;
  triangles: number | null;
  geometries: number | null;
  textures: number | null;
  programs: number | null;
  lifecycle:
    | 'created'
    | 'sampled'
    | 'release-requested'
    | 'release-observed'
    | 'release-timeout'
    | 'unexpected-loss';
  contextId: number;
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
  forceFailure?: 'shader';
  /** Development-only observed provider failure from the actual load/hash path. */
  providerFailureReason?: string;
  /** Development-only parsed scene for provisional, not-yet-verified calibration. */
  sceneOverride?: ReturnType<typeof getAttackDieRuntimeScene>;
  /** Development-only inspected candidate sidecar metadata. */
  sidecarOverride?: AttackDieRuntimeSidecar;
  onRendererInfo?: (info: AttackDieRendererInfo) => void;
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

function AttackDieCameraController({
  cameraView,
}: {
  cameraView: 'top' | 'three-quarter';
}) {
  const camera = useThree((state) => state.camera);
  useEffect(
    () => applyAttackDieCamera(camera, cameraView, ATTACK_DIE_VISUAL_CONFIG),
    [camera, cameraView]
  );
  return null;
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
  const effectiveResult = result;
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
    effectiveResult >= 1 &&
    effectiveResult <= 20;
  const [truthful, setTruthful] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const contextId = useRef<number | undefined>(undefined);
  const listener = useRef<
    | {
        renderer: WebGLRenderer;
        lifecycle: ReturnType<typeof ownAttackDieRendererLifecycle>;
        gate: ReturnType<typeof installAttackDieRenderGate>;
      }
    | undefined
  >(undefined);
  const poseValidated = useRef(false);
  const fail = useCallback(
    (reason: string, failureCode?: AttackDieFailureCode) => {
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
        failureCode,
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
      current?.gate.dispose();
      current?.lifecycle.requestRelease();
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
      fail(
        `provider failure: ${providerFailureReason}`,
        /hash|digest/i.test(providerFailureReason)
          ? 'provider-hash'
          : 'provider-load'
      );
    if (
      !Number.isInteger(effectiveResult) ||
      effectiveResult < 1 ||
      effectiveResult > 20
    )
      fail('invalid authoritative result: expected 1–20', 'invalid-result');
    if (!target)
      fail('authoritative result has no verified mapping', 'unmapped-result');
  }, [effectiveResult, fail, providerFailureReason, target]);
  const canvasVisible = eligible && !failed && phase !== 'hidden';
  return (
    <div className="attack-die-3d">
      <div
        className={`attack-die-3d__fallback${truthful ? ' attack-die-3d__fallback--covered' : ''}`}
      >
        {fallback}
      </div>
      {canvasVisible && (
        <RenderBoundary
          onError={(reason) =>
            fail(
              reason,
              /WebGL creation/i.test(reason) ? 'webgl-unavailable' : undefined
            )
          }
        >
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
                gl.toneMapping = rendererVisuals.toneMapping;
                gl.outputColorSpace = rendererVisuals.outputColorSpace;
                gl.toneMappingExposure = visual.exposure;
                scene.environment = rendererVisuals.environment;
                const existing = listener.current;
                if (existing) {
                  existing.gate.dispose();
                  existing.lifecycle.cancel();
                }
                const gate = installAttackDieRenderGate(gl, scene, camera, {
                  isActive: () => active.current,
                  isPoseValidated: () => poseValidated.current,
                  onReady: () => {
                    if (active.current) {
                      setTruthful(true);
                      listener.current?.lifecycle.sampled();
                    }
                  },
                  onFailure: (reason) => fail(reason, 'shader-failure'),
                  forceShaderFailure: forceFailure === 'shader',
                });
                const lifecycle = ownAttackDieRendererLifecycle({
                  renderer: gl,
                  contextId: contextId.current,
                  sink: onRendererInfo,
                  onUnexpectedLoss: () => {
                    gate.fail('WebGL context lost');
                    fail('WebGL context lost', 'context-loss');
                  },
                });
                listener.current = {
                  renderer: gl,
                  lifecycle,
                  gate,
                };
              } catch (error) {
                fail(
                  `shader readiness failed: ${error instanceof Error ? error.message : 'unknown'}`
                );
              }
            }}
          >
            <AttackDieCameraController cameraView={cameraView} />
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
