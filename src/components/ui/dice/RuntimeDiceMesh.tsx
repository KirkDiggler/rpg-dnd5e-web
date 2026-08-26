import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Quaternion,
  type Group,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import type {
  AttackDieMaterialMode,
  AttackDieRuntimeSidecar,
} from './attackDieContract';
import { patchAttackDieMaterials } from './attackDieMaterial';
import { resolveAttackDiePrimitives } from './attackDiePrimitive';
import { getAttackDieRuntimeScene } from './attackDieRuntime';
import type { DiceMotionPose } from './diceMotionSolver';
import type { DiceRuntimePreset } from './diceRuntimeManifest';
import type { RuntimeMeshBinding } from './diceRuntimeProvider';
import {
  prepareMaterialFreeCarvedScene,
  runtimeDiceNormalization,
  type DiceMaterialTreatment,
} from './materialFreeCarvedMesh';
import {
  createRuntimeDiceSurfaceHandle,
  type RuntimeDiceSurfaceHandle,
} from './runtimeDiceSurfaceGrab';

export interface RuntimeDiceMeshSource {
  readonly preset: DiceRuntimePreset;
  readonly scene: NonNullable<ReturnType<typeof getAttackDieRuntimeScene>>;
  readonly binding: RuntimeMeshBinding;
}

interface RuntimeDiceMeshBundle {
  readonly scene: NonNullable<ReturnType<typeof getAttackDieRuntimeScene>>;
  readonly normalization?: ReturnType<typeof runtimeDiceNormalization>;
  readonly runtimeSourceId?: number;
  readonly runtimeCloneId?: number;
  readonly updateShaderTime: (time: number) => void;
  readonly dispose: () => void;
}

type RuntimeDiceFrameCallback = (
  frame: DiceMotionPose,
  worldQuaternion: readonly [number, number, number, number],
  runtimeIdentities?: {
    runtimeSourceId: number;
    runtimeCloneId: number;
  }
) => void;

interface PendingDrawnFrame {
  readonly rendererFrameAtApplication: number;
  readonly frame: DiceMotionPose;
  readonly worldQuaternion: readonly [number, number, number, number];
  readonly runtimeIdentities?: {
    runtimeSourceId: number;
    runtimeCloneId: number;
  };
  readonly callback: RuntimeDiceFrameCallback;
}

export interface RuntimeDiceMeshProps {
  readonly source?: RuntimeDiceMeshSource;
  readonly sidecar?: AttackDieRuntimeSidecar;
  readonly mode?: AttackDieMaterialMode;
  readonly reducedMotion?: boolean;
  readonly sceneOverride?: ReturnType<typeof getAttackDieRuntimeScene>;
  readonly treatment?: DiceMaterialTreatment;
  readonly initialPose: DiceMotionPose;
  readonly getPose: (elapsedMs: number) => DiceMotionPose;
  readonly poseValidated?: React.MutableRefObject<boolean>;
  readonly onReady?: (
    input: Readonly<{
      runtimeSourceId: number;
      runtimeCloneId: number;
    }>
  ) => void;
  readonly onPoseApplied?: (frame: DiceMotionPose, elapsedMs: number) => void;
  readonly onFrame?: RuntimeDiceFrameCallback;
  readonly onFrameDrawn?: RuntimeDiceFrameCallback;
  readonly onFailure: (reason: string) => void;
  readonly surfaceHandleRef?: {
    current: RuntimeDiceSurfaceHandle | undefined;
  };
  readonly magicalAnimation?: boolean;
  readonly selectedGroupName?: string;
  readonly shadowName?: string;
}

const DEFAULT_TREATMENT: DiceMaterialTreatment = Object.freeze({
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

function cloneLegacyTokenScene(
  sidecar: AttackDieRuntimeSidecar,
  mode: AttackDieMaterialMode,
  reducedMotion: boolean,
  sourceOverride?: ReturnType<typeof getAttackDieRuntimeScene>
): RuntimeDiceMeshBundle {
  const source = sourceOverride ?? getAttackDieRuntimeScene();
  if (!source) throw Error('runtime scene unavailable');
  let effectiveSource = source;
  if (source.name === sidecar.selectors.node && !source.parent) {
    const wrapper = source.clone(false);
    wrapper.name = 'attack-die-scene-root';
    wrapper.add(source);
    effectiveSource = wrapper;
  }
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

function prepareRuntimeScene(
  source: RuntimeDiceMeshSource,
  treatment: DiceMaterialTreatment
): RuntimeDiceMeshBundle {
  const prepared = prepareMaterialFreeCarvedScene(
    source.scene,
    source.preset,
    source.binding,
    treatment
  );
  return {
    scene: prepared.scene,
    normalization: runtimeDiceNormalization(source.preset),
    runtimeSourceId: runtimeObjectIdentity(source.scene),
    runtimeCloneId: runtimeObjectIdentity(prepared.scene),
    updateShaderTime: () => undefined,
    dispose: prepared.dispose,
  };
}

export function RuntimeDiceMesh({
  source,
  sidecar,
  mode = 'raw',
  reducedMotion = false,
  sceneOverride,
  treatment = DEFAULT_TREATMENT,
  initialPose,
  getPose,
  poseValidated,
  onReady,
  onPoseApplied,
  onFrame,
  onFrameDrawn,
  onFailure,
  surfaceHandleRef,
  magicalAnimation = false,
  selectedGroupName = 'attack-die-selected-group',
  shadowName = 'attack-die-shadow',
}: RuntimeDiceMeshProps) {
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const shadowMaterial = useRef<MeshBasicMaterial>(null);
  const [bundle, setBundle] = useState<RuntimeDiceMeshBundle>();
  const internalValidationRef = useRef(false);
  const validationRef = poseValidated ?? internalValidationRef;
  const pendingDrawnFrame = useRef<PendingDrawnFrame | undefined>(undefined);

  useEffect(() => {
    try {
      const next = source
        ? prepareRuntimeScene(source, treatment)
        : sidecar
          ? cloneLegacyTokenScene(sidecar, mode, reducedMotion, sceneOverride)
          : (() => {
              throw Error('runtime scene source unavailable');
            })();
      setBundle(next);
      if (
        next.runtimeSourceId !== undefined &&
        next.runtimeCloneId !== undefined
      )
        onReady?.({
          runtimeSourceId: next.runtimeSourceId,
          runtimeCloneId: next.runtimeCloneId,
        });
      return () => next.dispose();
    } catch (error) {
      onFailure(
        `render setup failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  }, [
    mode,
    onFailure,
    onReady,
    reducedMotion,
    sceneOverride,
    sidecar,
    source,
    treatment,
  ]);

  useLayoutEffect(() => {
    const selectedGroup = group.current;
    if (!surfaceHandleRef || !bundle || !selectedGroup) return undefined;
    const handle = createRuntimeDiceSurfaceHandle(
      selectedGroup,
      bundle.runtimeCloneId
    );
    surfaceHandleRef.current = handle;
    return () => {
      if (surfaceHandleRef.current === handle)
        surfaceHandleRef.current = undefined;
    };
  }, [bundle, surfaceHandleRef]);

  useFrame(({ clock, gl }) => {
    const pending = pendingDrawnFrame.current;
    if (pending && pending.callback !== onFrameDrawn) {
      pendingDrawnFrame.current = undefined;
    } else if (
      pending &&
      gl.info.render.frame > pending.rendererFrameAtApplication
    ) {
      pendingDrawnFrame.current = undefined;
      pending.callback(
        pending.frame,
        pending.worldQuaternion,
        pending.runtimeIdentities
      );
    }

    validationRef.current = false;
    const elapsedMs = clock.elapsedTime * 1000;
    let frame: DiceMotionPose;
    try {
      frame = getPose(elapsedMs);
      if (frame.failed) {
        onFailure('motion observation missed');
        return;
      }
      const selectedGroup = group.current;
      const shadowGroup = shadow.current;
      const ownedShadowMaterial = shadowMaterial.current;
      if (!selectedGroup || !shadowGroup || !ownedShadowMaterial) return;

      selectedGroup.quaternion.set(...frame.quaternion);
      selectedGroup.position.set(...frame.translation);
      shadowGroup.position.set(...frame.shadow.translation);
      shadowGroup.scale.setScalar(frame.shadow.scale);
      ownedShadowMaterial.opacity = frame.shadow.opacity;
      validationRef.current = true;
      onPoseApplied?.(frame, elapsedMs);
      if (magicalAnimation) bundle?.updateShaderTime(clock.elapsedTime);
      if (!frame.observeNow || (!onFrame && !onFrameDrawn)) return;

      const finalWorldQuaternion = selectedGroup.getWorldQuaternion(
        new Quaternion()
      );
      const worldQuaternion: readonly [number, number, number, number] = [
        finalWorldQuaternion.x,
        finalWorldQuaternion.y,
        finalWorldQuaternion.z,
        finalWorldQuaternion.w,
      ];
      const runtimeIdentities =
        bundle?.runtimeSourceId !== undefined &&
        bundle.runtimeCloneId !== undefined
          ? {
              runtimeSourceId: bundle.runtimeSourceId,
              runtimeCloneId: bundle.runtimeCloneId,
            }
          : undefined;
      onFrame?.(frame, worldQuaternion, runtimeIdentities);
      if (onFrameDrawn && !pendingDrawnFrame.current) {
        pendingDrawnFrame.current = {
          rendererFrameAtApplication: gl.info.render.frame,
          frame,
          worldQuaternion,
          runtimeIdentities,
          callback: onFrameDrawn,
        };
      }
    } catch (error) {
      onFailure(
        `motion pose application failed: ${error instanceof Error ? error.message : 'unknown'}`
      );
    }
  });

  if (!bundle) return null;
  return (
    <>
      <group
        ref={group}
        name={selectedGroupName}
        data-testid="runtime-dice-mesh"
        quaternion={initialPose.quaternion}
        position={initialPose.translation}
      >
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
      <mesh
        ref={shadow}
        name={shadowName}
        position={initialPose.shadow.translation}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={initialPose.shadow.scale}
      >
        <circleGeometry args={[0.34, 48]} />
        <meshBasicMaterial
          ref={shadowMaterial}
          name="attack-die-shadow-material"
          color="#05070c"
          transparent
          opacity={initialPose.shadow.opacity}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
