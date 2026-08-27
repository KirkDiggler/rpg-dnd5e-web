import {
  INITIAL_AZIMUTH,
  INITIAL_DISTANCE,
  ORTHO_FAR,
  ORTHO_NEAR,
  ORTHO_ZOOM,
  POLAR_ANGLE,
  sphericalCameraPosition,
} from '@/author/preview3d/playCameraRig';
import { facingToRotationY } from '@/components/hex-grid/authorGridHelpers';
import { ClassCharacterModel } from '@/components/hex-grid/ClassCharacterModel';
import { resolveClassCharacterModelUrl } from '@/components/hex-grid/classCharacterModels';
import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
} from '@/components/hex-grid/mainHandPresentation';
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type {
  WeaponClassId,
  WeaponEquipmentState,
  WeaponFacing,
  WeaponMotion,
  WeaponRenderObservation,
  WeaponView,
} from './weaponAttachmentExperiment';

const ORBIT_CAMERA_POSITION = [2.4, 1.8, 3.1] as const;
const ORBIT_CAMERA_TARGET = [0, 0.7, 0] as const;
const CLOSE_CAMERA_POSITION = [-1.2, 1.22, 0.85] as const;
const CLOSE_CAMERA_TARGET = [-0.6, 1.02, -0.025] as const;
const TACTICAL_CAMERA_TARGET = [0, 0.65, 0] as const;

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

  useEffect(() => {
    invalidate();
  }, [invalidate]);
}

function CloseCamera() {
  useInvalidateAfterCameraActivation();
  return (
    <PerspectiveCamera
      name="weapon-attachment-close-camera"
      makeDefault
      position={CLOSE_CAMERA_POSITION}
      quaternion={CLOSE_CAMERA_QUATERNION}
      fov={42}
    />
  );
}

function OrbitCamera() {
  useInvalidateAfterCameraActivation();

  return (
    <>
      <PerspectiveCamera
        name="weapon-attachment-orbit-camera"
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
        { x: 0, y: 0, z: 0 },
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
      name="weapon-attachment-tactical-camera"
      makeDefault
      position={[position.x, position.y, position.z]}
      quaternion={quaternion}
      zoom={ORTHO_ZOOM}
      near={ORTHO_NEAR}
      far={ORTHO_FAR}
    />
  );
}

function sameStatus(
  left: MainHandAttachmentStatus | undefined,
  right: MainHandAttachmentStatus | undefined
): boolean {
  return (
    left?.code === right?.code &&
    left?.ref === right?.ref &&
    left?.weaponUrl === right?.weaponUrl &&
    left?.bone === right?.bone &&
    left?.message === right?.message
  );
}

function matchesPresentationIdentity(
  status: MainHandAttachmentStatus | undefined,
  presentation: MainHandPresentation | undefined
): boolean {
  return (
    status?.ref === presentation?.ref &&
    status?.weaponUrl === presentation?.weaponUrl
  );
}

function statusForCurrentPresentation(
  status: MainHandAttachmentStatus | undefined,
  presentation: MainHandPresentation | undefined
): MainHandAttachmentStatus | undefined {
  if (!status) return undefined;
  if (!presentation) {
    return status.code === 'unarmed' ? status : undefined;
  }
  return matchesPresentationIdentity(status, presentation) ? status : undefined;
}

function isStableObservation(
  equipmentState: WeaponEquipmentState,
  presentation: MainHandPresentation | undefined,
  status: MainHandAttachmentStatus | undefined
): status is MainHandAttachmentStatus {
  if (!status) return false;
  return equipmentState === 'unarmed'
    ? status.code === 'unarmed'
    : status.code === 'attached' &&
        matchesPresentationIdentity(status, presentation);
}

export interface WeaponAttachmentPreviewProps {
  classId?: WeaponClassId;
  equipmentState: WeaponEquipmentState;
  motion: WeaponMotion;
  view: WeaponView;
  facing: WeaponFacing;
  presentation?: MainHandPresentation;
  onAttachmentStatus?: (status: MainHandAttachmentStatus) => void;
  onRenderObserved: (observation: WeaponRenderObservation) => void;
}

export function WeaponAttachmentScene({
  classId = 'fighter',
  equipmentState,
  motion,
  view,
  facing,
  presentation,
  onAttachmentStatus,
  onRenderObserved,
}: WeaponAttachmentPreviewProps) {
  const [attachmentStatus, setAttachmentStatus] =
    useState<MainHandAttachmentStatus>();
  const lastObservedKey = useRef<string | undefined>(undefined);
  const handleMainHandStatus = useCallback(
    (status: MainHandAttachmentStatus) => {
      setAttachmentStatus((current) =>
        sameStatus(current, status) ? current : status
      );
    },
    []
  );
  const currentAttachmentStatus = statusForCurrentPresentation(
    attachmentStatus,
    presentation
  );

  useEffect(() => {
    if (!currentAttachmentStatus) return;
    onAttachmentStatus?.(currentAttachmentStatus);
  }, [currentAttachmentStatus, onAttachmentStatus]);

  useEffect(() => {
    if (
      !isStableObservation(
        equipmentState,
        presentation,
        currentAttachmentStatus
      )
    ) {
      lastObservedKey.current = undefined;
      return;
    }

    const observation = {
      equipmentState,
      motion,
      view,
      facing,
      attachmentCode: currentAttachmentStatus.code,
    } satisfies WeaponRenderObservation;
    const key = [
      equipmentState,
      motion,
      view,
      facing,
      currentAttachmentStatus.code,
    ].join('|');
    if (lastObservedKey.current === key) return;
    lastObservedKey.current = key;
    onRenderObserved(observation);
  }, [
    currentAttachmentStatus,
    equipmentState,
    facing,
    motion,
    onRenderObserved,
    presentation,
    view,
  ]);

  return (
    <>
      {view === 'close' ? (
        <CloseCamera />
      ) : view === 'orbit' ? (
        <OrbitCamera />
      ) : (
        <TacticalCamera />
      )}
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} />
      <Suspense fallback={null}>
        <ClassCharacterModel
          url={resolveClassCharacterModelUrl(classId, false)!}
          isMoving={motion === 'walk'}
          facingRotation={facingToRotationY(facing)}
          mainHandPresentation={presentation}
          onMainHandStatus={handleMainHandStatus}
        />
      </Suspense>
      <gridHelper
        args={[8, 16, '#354d4b', '#1d2928']}
        position={[0, 0.02, 0]}
      />
    </>
  );
}

export function WeaponAttachmentPreview(props: WeaponAttachmentPreviewProps) {
  return (
    <div
      data-testid="weapon-attachment-preview"
      style={{ width: '100%', height: 520, minHeight: 520 }}
    >
      <Canvas frameloop="demand" dpr={[1, 1.5]}>
        <WeaponAttachmentScene {...props} />
      </Canvas>
    </div>
  );
}
