import {
  INITIAL_AZIMUTH,
  INITIAL_DISTANCE,
  ORTHO_FAR,
  ORTHO_NEAR,
  ORTHO_ZOOM,
  POLAR_ANGLE,
  sphericalCameraPosition,
} from '@/author/preview3d/playCameraRig';
import { ClassCharacterModel } from '@/components/hex-grid/ClassCharacterModel';
import type { MainHandAttachmentStatus } from '@/components/hex-grid/mainHandPresentation';
import type { SkinnedAccessoryStatus } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { CHARACTER_CUSTOMIZATION_BODY } from './characterCustomizationAssets';
import {
  CUSTOMIZATION_WEAPON_PRESENTATION,
  REFERENCE_CUSTOMIZATION_RESOLUTION,
  commitCustomizationObservationAfterRendererFrame,
  customizationObservationKey,
  deriveCustomizationEvidence,
  sameAccessoryStatus,
  sameWeaponStatus,
  type CharacterCustomizationDiagnostics,
  type PendingCustomizationObservation,
} from './characterCustomizationDiagnostics';
import {
  type ActiveSurfacePreset,
  type CharacterCustomizationFixture,
  type CharacterCustomizationRenderObservation,
  type ResolvedCustomizationFixture,
} from './characterCustomizationExperiment';

const CONTROLLED_POSITION = [-0.62, 0, 0] as const;
const REFERENCE_POSITION = [0.72, 0, 0] as const;
const CLOSE_CAMERA_POSITION = [-1.75, 1.35, 2.35] as const;
const CLOSE_CAMERA_TARGET = [-0.28, 0.92, 0] as const;
const ORBIT_CAMERA_POSITION = [2.8, 1.9, 3.65] as const;
const ORBIT_CAMERA_TARGET = [0.05, 0.68, 0] as const;
const TACTICAL_CAMERA_TARGET = [0.05, 0.58, 0] as const;

function lookAtQuaternion(
  position: readonly [number, number, number],
  target: readonly [number, number, number]
): readonly [number, number, number, number] {
  return new Quaternion()
    .setFromRotationMatrix(
      new Matrix4().lookAt(
        new Vector3(...position),
        new Vector3(...target),
        new Vector3(0, 1, 0)
      )
    )
    .toArray() as readonly [number, number, number, number];
}

const CLOSE_CAMERA_QUATERNION = lookAtQuaternion(
  CLOSE_CAMERA_POSITION,
  CLOSE_CAMERA_TARGET
);
const ORBIT_CAMERA_QUATERNION = lookAtQuaternion(
  ORBIT_CAMERA_POSITION,
  ORBIT_CAMERA_TARGET
);

function useInvalidateAfterCameraActivation() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [invalidate]);
}

function CloseCamera() {
  useInvalidateAfterCameraActivation();
  return (
    <PerspectiveCamera
      name="character-customization-close-camera"
      makeDefault
      position={CLOSE_CAMERA_POSITION}
      quaternion={CLOSE_CAMERA_QUATERNION}
      fov={38}
    />
  );
}

function OrbitCamera() {
  useInvalidateAfterCameraActivation();
  return (
    <>
      <PerspectiveCamera
        name="character-customization-orbit-camera"
        makeDefault
        position={ORBIT_CAMERA_POSITION}
        quaternion={ORBIT_CAMERA_QUATERNION}
        fov={42}
      />
      <OrbitControls makeDefault target={ORBIT_CAMERA_TARGET} />
    </>
  );
}

function TacticalCamera() {
  useInvalidateAfterCameraActivation();
  const position = useMemo(
    () =>
      sphericalCameraPosition(
        { x: 0.05, y: 0, z: 0 },
        POLAR_ANGLE,
        INITIAL_AZIMUTH,
        INITIAL_DISTANCE
      ),
    []
  );
  const quaternion = useMemo(
    () =>
      lookAtQuaternion(
        [position.x, position.y, position.z],
        TACTICAL_CAMERA_TARGET
      ),
    [position]
  );
  return (
    <OrthographicCamera
      name="character-customization-tactical-camera"
      makeDefault
      position={[position.x, position.y, position.z]}
      quaternion={quaternion}
      zoom={ORTHO_ZOOM}
      near={ORTHO_NEAR}
      far={ORTHO_FAR}
    />
  );
}

interface PendingCommit {
  readonly key: string;
  readonly rendererFrameAtReadiness: number;
  readonly observation: PendingCustomizationObservation;
}

function SceneCommitWitness({
  observation,
  onRenderObserved,
}: {
  readonly observation?: PendingCustomizationObservation;
  readonly onRenderObserved: (
    observation: CharacterCustomizationRenderObservation
  ) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const pending = useRef<PendingCommit | undefined>(undefined);
  const lastReportedKey = useRef<string | undefined>(undefined);
  const callbackRef = useRef(onRenderObserved);
  callbackRef.current = onRenderObserved;
  const key = observation
    ? customizationObservationKey(observation)
    : undefined;

  useEffect(() => {
    if (!key) {
      pending.current = undefined;
      lastReportedKey.current = undefined;
      return;
    }
    if (lastReportedKey.current !== key) invalidate();
  }, [invalidate, key]);

  useFrame(({ gl, invalidate: invalidateFrame }) => {
    if (!observation || !key || lastReportedKey.current === key) return;
    if (pending.current?.key !== key) {
      pending.current = {
        key,
        rendererFrameAtReadiness: gl.info.render.frame,
        observation,
      };
      invalidateFrame();
      return;
    }
    const committed = pending.current;
    const committedObservation =
      commitCustomizationObservationAfterRendererFrame(
        committed.observation,
        committed.rendererFrameAtReadiness,
        gl.info.render.frame
      );
    if (!committedObservation) {
      invalidateFrame();
      return;
    }

    pending.current = undefined;
    lastReportedKey.current = key;
    callbackRef.current(committedObservation);
  });

  return null;
}

export interface CharacterCustomizationPreviewProps {
  readonly fixture: CharacterCustomizationFixture;
  readonly surfacePreset: ActiveSurfacePreset;
  readonly resolution: ResolvedCustomizationFixture;
  readonly onDiagnostics: (
    diagnostics: CharacterCustomizationDiagnostics
  ) => void;
  readonly onRenderObserved: (
    observation: CharacterCustomizationRenderObservation
  ) => void;
}

export function CharacterCustomizationScene({
  fixture,
  surfacePreset,
  resolution,
  onDiagnostics,
  onRenderObserved,
}: CharacterCustomizationPreviewProps) {
  const [controlledStatuses, setControlledStatuses] = useState<
    Partial<Record<'scalp' | 'facial-hair', SkinnedAccessoryStatus>>
  >({});
  const [referenceStatuses, setReferenceStatuses] = useState<
    Partial<Record<'scalp' | 'facial-hair', SkinnedAccessoryStatus>>
  >({});
  const [weaponStatus, setWeaponStatus] = useState<MainHandAttachmentStatus>({
    code: 'unarmed',
  });
  const [committedObservationKey, setCommittedObservationKey] = useState<
    string | undefined
  >();

  const handleControlledStatus = useCallback(
    (status: SkinnedAccessoryStatus) => {
      setControlledStatuses((current) =>
        sameAccessoryStatus(current[status.slot], status)
          ? current
          : { ...current, [status.slot]: status }
      );
    },
    []
  );
  const handleReferenceStatus = useCallback(
    (status: SkinnedAccessoryStatus) => {
      setReferenceStatuses((current) =>
        sameAccessoryStatus(current[status.slot], status)
          ? current
          : { ...current, [status.slot]: status }
      );
    },
    []
  );
  const handleWeaponStatus = useCallback((status: MainHandAttachmentStatus) => {
    setWeaponStatus((current) =>
      sameWeaponStatus(current, status) ? current : status
    );
  }, []);
  const handleRenderObserved = useCallback(
    (observation: CharacterCustomizationRenderObservation) => {
      const pendingObservation: PendingCustomizationObservation = {
        fixture: observation.fixture,
        surfacePreset: observation.surfacePreset,
        scalpStatus: observation.scalpStatus,
        facialHairStatus: observation.facialHairStatus,
        referenceScalpStatus: observation.referenceScalpStatus,
        referenceFacialHairStatus: observation.referenceFacialHairStatus,
        mountedAccessoryArmatures: observation.mountedAccessoryArmatures,
      };
      setCommittedObservationKey(
        customizationObservationKey(pendingObservation)
      );
      onRenderObserved(observation);
    },
    [onRenderObserved]
  );

  const evidence = useMemo(
    () =>
      deriveCustomizationEvidence({
        fixture,
        surfacePreset,
        resolution,
        controlledStatuses,
        referenceStatuses,
        weaponStatus,
        committedObservationKey,
      }),
    [
      committedObservationKey,
      controlledStatuses,
      fixture,
      referenceStatuses,
      resolution,
      surfacePreset,
      weaponStatus,
    ]
  );
  const { diagnostics, pendingObservation: observation } = evidence;

  useEffect(() => onDiagnostics(diagnostics), [diagnostics, onDiagnostics]);

  return (
    <>
      {fixture.view === 'close' ? (
        <CloseCamera />
      ) : fixture.view === 'orbit' ? (
        <OrbitCamera />
      ) : (
        <TacticalCamera />
      )}
      <color attach="background" args={['#101817']} />
      <ambientLight intensity={1.25} />
      <hemisphereLight args={['#dbeafe', '#20322f', 1.15]} />
      <directionalLight position={[4, 7, 5]} intensity={1.5} />
      <directionalLight position={[-4, 3, 2]} intensity={0.5} />
      <Suspense fallback={null}>
        <group position={CONTROLLED_POSITION}>
          <ClassCharacterModel
            url={CHARACTER_CUSTOMIZATION_BODY.url}
            isMoving={fixture.motion === 'walk'}
            accessories={resolution.presentations}
            onAccessoryStatus={handleControlledStatus}
            mainHandPresentation={
              fixture.showWeaponWitness
                ? CUSTOMIZATION_WEAPON_PRESENTATION
                : undefined
            }
            onMainHandStatus={handleWeaponStatus}
          />
        </group>
        <group position={REFERENCE_POSITION}>
          <ClassCharacterModel
            url={CHARACTER_CUSTOMIZATION_BODY.url}
            isMoving={fixture.motion === 'walk'}
            accessories={REFERENCE_CUSTOMIZATION_RESOLUTION.presentations}
            onAccessoryStatus={handleReferenceStatus}
          />
        </group>
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]}>
        <planeGeometry args={[7, 5]} />
        <meshStandardMaterial color="#172522" roughness={1} />
      </mesh>
      <gridHelper args={[7, 14, '#46615c', '#293c38']} position={[0, 0, 0]} />
      <SceneCommitWitness
        observation={observation}
        onRenderObserved={handleRenderObserved}
      />
    </>
  );
}

export function CharacterCustomizationPreview(
  props: CharacterCustomizationPreviewProps
) {
  return (
    <div
      data-testid="character-customization-preview"
      className="relative overflow-hidden rounded"
      style={{ width: '100%', height: 560, minHeight: 560 }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-around px-8 text-xs font-semibold uppercase tracking-wider text-slate-100">
        <span className="rounded bg-slate-950/75 px-2 py-1">
          Controlled customization
        </span>
        <span className="rounded bg-slate-950/75 px-2 py-1">
          Untouched reference twin
        </span>
      </div>
      <Canvas frameloop="demand" dpr={[1, 1.5]}>
        <CharacterCustomizationScene {...props} />
      </Canvas>
    </div>
  );
}
