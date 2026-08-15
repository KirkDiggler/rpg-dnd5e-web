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
import {
  patchAttackDieMaterials,
  type DiceMaterialTreatment,
} from './attackDieMaterial';
import {
  angularDistanceDegrees,
  attackDiePoseForPhase,
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
import type { AttackDieDecorativeRelease } from './dicePresentationRelease';
import type {
  DiceRuntimePreset,
  DiceSettlementEntryV2,
} from './diceRuntimeManifest';
import {
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
  type DiceRuntimePresetSnapshot,
  type RuntimeMeshBinding,
} from './diceRuntimeProvider';
import { observeUpwardResult } from './diceSettlementObservation';
import {
  ORIGINAL_RUNTIME_CAMERA_DISTANCE_SCALE,
  prepareMaterialFreeCarvedScene,
  runtimeDiceNormalization,
} from './materialFreeCarvedMesh';

export type AttackDieFailureCode =
  | 'provider-load'
  | 'provider-hash'
  | 'webgl-unavailable'
  | 'shader-failure'
  | 'context-loss'
  | 'invalid-result'
  | 'unmapped-result'
  | 'settlement-observation';
export interface AttackDieTelemetry {
  presentationToken: number;
  requestedResult: number;
  renderer: '3d' | 'svg';
  state: 'locked' | 'tumbling' | 'observed' | 'held' | 'failed' | 'disposed';
  mappedTarget?: QuaternionTuple;
  observedQuaternion?: QuaternionTuple;
  observedUpwardResult?: number;
  observedUpDot?: number;
  observedUpMargin?: number;
  angularErrorDegrees?: number;
  exactTargetHeld: boolean;
  failureReason?: string;
  failureCode?: AttackDieFailureCode;
  /** Runtime diagnostic identity: equal for witnesses consuming one source. */
  runtimeSourceId?: number;
  /** Runtime diagnostic identity: distinct for each owned witness clone. */
  runtimeCloneId?: number;
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
export type AttackDieProvider =
  | {
      readonly kind: 'dice-runtime-preset';
      readonly presetId: string;
    }
  | { readonly kind: 'lightning-development' };

export interface AttackDie3DProps {
  result: number;
  presentationToken: number;
  phase: DiceTrayPhase;
  materialMode: AttackDieMaterialMode;
  reducedMotion: boolean;
  magicalAnimation?: boolean;
  decorativeSeed?: number;
  decorativeRelease?: AttackDieDecorativeRelease;
  fallback: React.ReactNode;
  provider?: AttackDieProvider;
  onTelemetry?: (event: AttackDieTelemetry) => void;
  /** Development concept camera; omitted in production-intent usage. */
  cameraView?: 'top' | 'three-quarter';
  /** Development calibration pose override; never supplied by production. */
  calibrationPose?: QuaternionTuple;
  /** Development-only failure exercise; normal behavior is unchanged. */
  forceFailure?: 'shader' | 'unmapped';
  /** Development-only observed provider failure from the actual load/hash path. */
  providerFailureReason?: string;
  /** Development-only parsed scene for provisional, not-yet-verified calibration. */
  sceneOverride?: ReturnType<typeof getAttackDieRuntimeScene>;
  /** Development-only inspected candidate sidecar metadata. */
  sidecarOverride?: AttackDieRuntimeSidecar;
  onRendererInfo?: (info: AttackDieRendererInfo) => void;
}

import { installAttackDieRenderGate } from './attackDieRenderGate';

const ORIGINAL_RUNTIME_TREATMENT: DiceMaterialTreatment = Object.freeze({
  bodyColor: '#15233b',
  numeralColor: '#f5eddc',
  roughness: 0.72,
  metalness: 0.08,
});

const runtimeObjectIdentities = new WeakMap<object, number>();
let nextRuntimeObjectIdentity = 1;
function runtimeObjectIdentity(value: object) {
  const existing = runtimeObjectIdentities.get(value);
  if (existing !== undefined) return existing;
  const identity = nextRuntimeObjectIdentity++;
  runtimeObjectIdentities.set(value, identity);
  return identity;
}

function canCreateWebGLContext() {
  if (typeof document === 'undefined') return true;
  try {
    const probe = document.createElement('canvas');
    const context =
      probe.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ??
      probe.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const runtimeCameraVisual = Object.freeze({
  ...ATTACK_DIE_VISUAL_CONFIG,
  topCamera: Object.freeze({
    ...ATTACK_DIE_VISUAL_CONFIG.topCamera,
    position: ATTACK_DIE_VISUAL_CONFIG.topCamera.position.map(
      (value) => value * ORIGINAL_RUNTIME_CAMERA_DISTANCE_SCALE
    ) as [number, number, number],
  }),
  threeQuarterCamera: Object.freeze({
    ...ATTACK_DIE_VISUAL_CONFIG.threeQuarterCamera,
    position: ATTACK_DIE_VISUAL_CONFIG.threeQuarterCamera.position.map(
      (value) => value * ORIGINAL_RUNTIME_CAMERA_DISTANCE_SCALE
    ) as [number, number, number],
  }),
});

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

interface RuntimePresetSceneSource {
  readonly preset: DiceRuntimePreset;
  readonly scene: NonNullable<DiceRuntimePresetSnapshot['scene']>;
  readonly binding: RuntimeMeshBinding;
}

function cloneTokenScene(
  sidecar: AttackDieRuntimeSidecar | undefined,
  mode: AttackDieMaterialMode,
  reducedMotion: boolean,
  sourceOverride?: ReturnType<typeof getAttackDieRuntimeScene>,
  runtimeSource?: RuntimePresetSceneSource
) {
  if (runtimeSource) {
    const prepared = prepareMaterialFreeCarvedScene(
      runtimeSource.scene,
      runtimeSource.preset,
      runtimeSource.binding,
      ORIGINAL_RUNTIME_TREATMENT
    );
    return {
      scene: prepared.scene,
      normalization: runtimeDiceNormalization(runtimeSource.preset),
      runtimeSourceId: runtimeObjectIdentity(runtimeSource.scene),
      runtimeCloneId: runtimeObjectIdentity(prepared.scene),
      updateShaderTime: () => undefined,
      dispose: prepared.dispose,
    };
  }

  if (!sidecar) throw Error('Lightning runtime sidecar unavailable');
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
    normalization: undefined,
    runtimeSourceId: undefined,
    runtimeCloneId: undefined,
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
  runtimeSource,
  target,
  mode,
  reducedMotion,
  onFrame,
  poseValidated,
  onFailure,
  sceneOverride,
  magicalAnimation,
  phase,
  release,
}: {
  sidecar?: AttackDieRuntimeSidecar;
  runtimeSource?: RuntimePresetSceneSource;
  target: QuaternionTuple;
  mode: AttackDieMaterialMode;
  reducedMotion: boolean;
  onFrame: (
    frame: AttackDieMotionFrame,
    worldQuaternion: QuaternionTuple,
    runtimeIdentities?: {
      runtimeSourceId: number;
      runtimeCloneId: number;
    }
  ) => void;
  poseValidated: React.MutableRefObject<boolean>;
  onFailure: (reason: string) => void;
  sceneOverride?: ReturnType<typeof getAttackDieRuntimeScene>;
  magicalAnimation: boolean;
  phase: DiceTrayPhase;
  release?: AttackDieDecorativeRelease;
}) {
  const group = useRef<Group>(null);
  const rollStartedAt = useRef<number | undefined>(undefined);
  const previousPhase = useRef<DiceTrayPhase>(phase);
  const observationSent = useRef(false);

  const neutral: QuaternionTuple = [0.31, -0.47, 0.19, 0.805];
  const initial = attackDiePoseForPhase({
    phase,
    elapsedMs: 0,
    reducedMotion,
    current: neutral,
    target,
    release,
  }).quaternion;
  const renderedQuaternion = useRef<QuaternionTuple>(initial);
  const [bundle, setBundle] = useState<ReturnType<typeof cloneTokenScene>>();
  useEffect(() => {
    try {
      const next = cloneTokenScene(
        sidecar,
        mode,
        reducedMotion,
        sceneOverride,
        runtimeSource
      );
      setBundle(next);
      return () => next.dispose();
    } catch (error) {
      onFailure(
        `render setup failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  }, [mode, onFailure, reducedMotion, runtimeSource, sceneOverride, sidecar]);
  useFrame(({ clock }) => {
    poseValidated.current = false;
    const now = clock.elapsedTime * 1000;
    if (phase === 'rolling') {
      if (
        previousPhase.current !== 'rolling' ||
        rollStartedAt.current === undefined
      ) {
        rollStartedAt.current = now;
        observationSent.current = false;
      }
    } else {
      rollStartedAt.current = undefined;
    }
    previousPhase.current = phase;
    const elapsedMs =
      phase === 'rolling' ? now - (rollStartedAt.current ?? now) : 0;
    const frame = attackDiePoseForPhase({
      phase,
      elapsedMs,
      reducedMotion,
      current: renderedQuaternion.current,
      target,
      release,
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
      selectedGroup.position.set(...frame.translation);
      poseValidated.current = true;
      if (magicalAnimation && !reducedMotion)
        bundle?.updateShaderTime(clock.elapsedTime);
      const observeNow =
        (frame.observeNow || (phase === 'settled' && frame.exactTargetHeld)) &&
        !observationSent.current;
      if (!observeNow) return;
      observationSent.current = true;
      const finalWorldQuaternion = selectedGroup.getWorldQuaternion(
        new Quaternion()
      );
      const worldQuaternion: QuaternionTuple = [
        finalWorldQuaternion.x,
        finalWorldQuaternion.y,
        finalWorldQuaternion.z,
        finalWorldQuaternion.w,
      ];
      onFrame(
        observeNow === frame.observeNow ? frame : { ...frame, observeNow },
        worldQuaternion,
        bundle?.runtimeSourceId !== undefined &&
          bundle.runtimeCloneId !== undefined
          ? {
              runtimeSourceId: bundle.runtimeSourceId,
              runtimeCloneId: bundle.runtimeCloneId,
            }
          : undefined
      );
    } catch (error) {
      onFailure(
        `motion pose application failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  });
  if (!bundle) return null;
  return (
    <group ref={group} quaternion={initial}>
      {bundle.normalization ? (
        <group
          name="attack-die-runtime-normalization"
          scale={bundle.normalization.scale}
        >
          <group
            name="attack-die-runtime-recenter"
            position={bundle.normalization.position}
          >
            <primitive object={bundle.scene} />
          </group>
        </group>
      ) : (
        <primitive object={bundle.scene} />
      )}
    </group>
  );
}

function AttackDieCameraController({
  cameraView,
  runtimePreset,
}: {
  cameraView: 'top' | 'three-quarter';
  runtimePreset: boolean;
}) {
  const camera = useThree((state) => state.camera);
  useEffect(
    () =>
      applyAttackDieCamera(
        camera,
        cameraView,
        runtimePreset
          ? (runtimeCameraVisual as unknown as typeof ATTACK_DIE_VISUAL_CONFIG)
          : ATTACK_DIE_VISUAL_CONFIG
      ),
    [camera, cameraView, runtimePreset]
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
  decorativeRelease,
  fallback,
  provider,
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
  const runtimeProvider =
    provider?.kind === 'dice-runtime-preset' ? provider : undefined;
  const rendererVisuals = resolveAttackDieRendererVisuals(visual);
  const release = useMemo<AttackDieDecorativeRelease>(
    () =>
      decorativeRelease ?? {
        variation: decorativeSeed,
        vector: [0, 0],
        shake: 0,
      },
    [decorativeRelease, decorativeSeed]
  );
  const effectiveResult = result;
  const legacyLock = useMemo(
    () =>
      runtimeProvider
        ? undefined
        : lockAttackDieRenderer(presentationToken, effectiveResult),
    [effectiveResult, presentationToken, runtimeProvider]
  );
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<
    DiceRuntimePresetSnapshot | undefined
  >(() =>
    runtimeProvider
      ? getDiceRuntimePresetSnapshot(runtimeProvider.presetId)
      : undefined
  );
  const sidecar = runtimeProvider
    ? undefined
    : (sidecarOverride ?? legacyLock?.sidecar);
  const runtimeSource = useMemo<RuntimePresetSceneSource | undefined>(() => {
    if (
      runtimeSnapshot?.status !== 'ready' ||
      !runtimeSnapshot.preset ||
      !runtimeSnapshot.scene ||
      !runtimeSnapshot.binding
    )
      return undefined;
    return {
      preset: runtimeSnapshot.preset,
      scene: runtimeSnapshot.scene,
      binding: runtimeSnapshot.binding,
    };
  }, [
    runtimeSnapshot?.binding,
    runtimeSnapshot?.preset,
    runtimeSnapshot?.scene,
    runtimeSnapshot?.status,
  ]);
  const settlementEntries:
    | Readonly<Record<string, DiceSettlementEntryV2>>
    | undefined = runtimeProvider
    ? runtimeSnapshot?.preset?.faceSettlementMap.entries
    : undefined;
  const mappedTarget: QuaternionTuple | undefined = runtimeProvider
    ? settlementEntries?.[String(effectiveResult)]?.quaternion
    : sidecar?.faces.find((face) => face.result === effectiveResult)
        ?.quaternion;
  const target = runtimeProvider
    ? mappedTarget
    : (calibrationPose ?? mappedTarget);
  const forced = forceFailure !== undefined;
  const authoringEligible =
    !runtimeProvider &&
    calibrationPose !== undefined &&
    sidecarOverride !== undefined &&
    sceneOverride !== undefined;
  const eligible = runtimeProvider
    ? runtimeSnapshot?.status === 'ready' &&
      runtimeSource !== undefined &&
      target !== undefined &&
      Number.isInteger(effectiveResult) &&
      effectiveResult >= 1 &&
      effectiveResult <= 20
    : (authoringEligible || legacyLock?.renderer === '3d') &&
      !!sidecar &&
      !!target &&
      Number.isInteger(effectiveResult) &&
      effectiveResult >= 1 &&
      effectiveResult <= 20;
  const webglAvailable = useMemo(
    () => !eligible || canCreateWebGLContext(),
    [eligible]
  );
  const [truthful, setTruthful] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const failureSent = useRef(false);
  const renderer = useRef<'3d' | 'svg'>('svg');
  renderer.current = eligible && !failed ? '3d' : 'svg';
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
  const releaseRenderer = useCallback(() => {
    const current = listener.current;
    if (!current) return;
    listener.current = undefined;
    current.gate.dispose();
    current.lifecycle.requestRelease();
  }, []);
  const fail = useCallback(
    (reason: string, failureCode?: AttackDieFailureCode) => {
      if (!active.current || failureSent.current) return;
      failureSent.current = true;
      legacyLock?.fail(reason);
      renderer.current = 'svg';
      releaseRenderer();
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
    [legacyLock, onTelemetry, presentationToken, releaseRenderer, result]
  );
  const handleSceneFailure = useCallback(
    (reason: string) =>
      fail(reason, runtimeProvider ? 'provider-load' : undefined),
    [fail, runtimeProvider]
  );

  useEffect(() => {
    if (!runtimeProvider || forced) return;
    let subscribed = true;
    const refresh = () => {
      if (subscribed)
        setRuntimeSnapshot(
          getDiceRuntimePresetSnapshot(runtimeProvider.presetId)
        );
    };
    const initial = getDiceRuntimePresetSnapshot(runtimeProvider.presetId);
    setRuntimeSnapshot(initial);
    if (initial.status === 'idle' || initial.status === 'loading')
      void preloadDiceRuntimePreset(runtimeProvider.presetId).then(
        refresh,
        refresh
      );
    return () => {
      subscribed = false;
    };
  }, [forced, runtimeProvider]);

  useEffect(() => {
    active.current = true;
    if (!runtimeProvider && !forced && !authoringEligible)
      void preloadAttackDieRuntime().catch((error) =>
        fail(
          `runtime load failed: ${error instanceof Error ? error.message : 'unknown'}`
        )
      );
    return () => {
      active.current = false;
      releaseRenderer();
      if (!runtimeProvider) releaseAttackDieRenderer(presentationToken);
      onTelemetry?.({
        presentationToken,
        requestedResult: result,
        renderer: renderer.current,
        state: 'disposed',
        exactTargetHeld: false,
      });
    };
  }, [
    authoringEligible,
    fail,
    forced,
    onRendererInfo,
    onTelemetry,
    presentationToken,
    releaseRenderer,
    result,
    runtimeProvider,
  ]);

  useEffect(() => {
    if (eligible && !webglAvailable) {
      fail('WebGL creation failed', 'webgl-unavailable');
      return;
    }
    if (forceFailure === 'unmapped') {
      fail(
        'synthetic authoritative result mapping exercise',
        'unmapped-result'
      );
      return;
    }
    if (providerFailureReason) {
      fail(
        `provider failure: ${providerFailureReason}`,
        /hash|digest/i.test(providerFailureReason)
          ? 'provider-hash'
          : 'provider-load'
      );
      return;
    }
    if (
      !Number.isInteger(effectiveResult) ||
      effectiveResult < 1 ||
      effectiveResult > 20
    ) {
      fail('invalid authoritative result: expected 1–20', 'invalid-result');
      return;
    }
    if (runtimeProvider) {
      if (runtimeSnapshot?.status === 'failed') {
        const reason = runtimeSnapshot.failureReason ?? 'runtime preset failed';
        fail(
          `runtime preset failed: ${reason}`,
          /hash|digest/i.test(reason) ? 'provider-hash' : 'provider-load'
        );
        return;
      }
      if (runtimeSnapshot?.status === 'ready') {
        if (!runtimeSource) {
          fail('runtime preset ready snapshot is incomplete', 'provider-load');
          return;
        }
        if (!target)
          fail(
            'authoritative result has no verified mapping',
            'unmapped-result'
          );
        return;
      }
      if (phase === 'rolling' || phase === 'settled' || phase === 'exiting')
        fail('runtime preset was not ready at release', 'provider-load');
      return;
    }
    if (!target)
      fail('authoritative result has no verified mapping', 'unmapped-result');
  }, [
    effectiveResult,
    eligible,
    fail,
    phase,
    forceFailure,
    providerFailureReason,
    runtimeProvider,
    runtimeSnapshot?.failureReason,
    runtimeSnapshot?.status,
    runtimeSource,
    target,
    webglAvailable,
  ]);
  const canvasVisible =
    eligible && webglAvailable && !failed && phase !== 'hidden';
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
              const cameraVisual = runtimeProvider
                ? runtimeCameraVisual
                : visual;
              const c =
                cameraView === 'top'
                  ? cameraVisual.topCamera
                  : cameraVisual.threeQuarterCamera;
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
                  onUnexpectedLoss: () =>
                    fail('WebGL context lost', 'context-loss'),
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
            <AttackDieCameraController
              cameraView={cameraView}
              runtimePreset={runtimeProvider !== undefined}
            />
            <ambientLight intensity={visual.ambientIntensity} />
            <directionalLight
              position={visual.keyLight.position}
              intensity={visual.keyLight.intensity}
            />
            <directionalLight
              position={visual.fillLight.position}
              intensity={visual.fillLight.intensity}
            />
            <group scale={runtimeProvider ? 1 : visual.dieScale}>
              <RuntimeDie
                sidecar={sidecar}
                runtimeSource={runtimeSource}
                target={target!}
                mode={materialMode}
                reducedMotion={reducedMotion}
                poseValidated={poseValidated}
                onFailure={handleSceneFailure}
                sceneOverride={sceneOverride}
                magicalAnimation={magicalAnimation}
                phase={phase}
                release={release}
                onFrame={(frame, worldQuaternion, runtimeIdentities) => {
                  if (!active.current || !frame.observeNow) return;
                  if (!settlementEntries) {
                    fail(
                      'settlement observation witnesses unavailable',
                      'settlement-observation'
                    );
                    return;
                  }
                  const angularErrorDegrees = angularDistanceDegrees(
                    worldQuaternion,
                    target!
                  );
                  let observation;
                  try {
                    observation = observeUpwardResult(
                      settlementEntries,
                      worldQuaternion
                    );
                  } catch {
                    fail(
                      'settlement observation was invalid or ambiguous',
                      'settlement-observation'
                    );
                    return;
                  }
                  if (
                    !frame.exactTargetHeld ||
                    angularErrorDegrees > 0.25 ||
                    observation.result !== result ||
                    observation.upDot <= 0.999999 ||
                    observation.margin <= 0.2
                  ) {
                    fail(
                      'settlement observation did not match the authoritative result',
                      'settlement-observation'
                    );
                    return;
                  }
                  onTelemetry?.({
                    presentationToken,
                    requestedResult: result,
                    renderer: '3d',
                    state: 'observed',
                    mappedTarget: target,
                    observedQuaternion: worldQuaternion,
                    observedUpwardResult: observation.result,
                    observedUpDot: observation.upDot,
                    observedUpMargin: observation.margin,
                    angularErrorDegrees,
                    exactTargetHeld: true,
                    ...runtimeIdentities,
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
