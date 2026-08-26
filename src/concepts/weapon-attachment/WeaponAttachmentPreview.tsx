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
import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
} from '@/components/hex-grid/mainHandPresentation';
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type * as THREE from 'three';
import type {
  WeaponEquipmentState,
  WeaponFacing,
  WeaponMotion,
  WeaponRenderObservation,
  WeaponView,
} from './weaponAttachmentExperiment';

const FIGHTER_URL = '/models/synty/characters/fighter.glb' as const;
const ORBIT_CAMERA_POSITION = [2.4, 1.8, 3.1] as const;
const ORBIT_CAMERA_TARGET = [0, 0.7, 0] as const;
const CLOSE_CAMERA_POSITION = [-1.2, 1.22, 0.85] as const;
const CLOSE_CAMERA_TARGET = [-0.6, 1.02, -0.025] as const;
const TACTICAL_CAMERA_TARGET = [0, 0.65, 0] as const;

function CloseCamera() {
  const ref = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    ref.current?.lookAt(...CLOSE_CAMERA_TARGET);
    ref.current?.updateProjectionMatrix();
  }, []);

  return (
    <PerspectiveCamera
      ref={ref}
      name="weapon-attachment-close-camera"
      makeDefault
      position={CLOSE_CAMERA_POSITION}
      fov={42}
    />
  );
}

function OrbitCamera() {
  return (
    <>
      <PerspectiveCamera
        name="weapon-attachment-orbit-camera"
        makeDefault
        position={ORBIT_CAMERA_POSITION}
        fov={42}
      />
      <OrbitControls makeDefault target={ORBIT_CAMERA_TARGET} />
    </>
  );
}

function TacticalCamera() {
  const ref = useRef<THREE.OrthographicCamera | null>(null);
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

  useEffect(() => {
    ref.current?.lookAt(...TACTICAL_CAMERA_TARGET);
    ref.current?.updateProjectionMatrix();
  }, []);

  return (
    <OrthographicCamera
      ref={ref}
      name="weapon-attachment-tactical-camera"
      makeDefault
      position={[position.x, position.y, position.z]}
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

function isStableObservation(
  equipmentState: WeaponEquipmentState,
  status: MainHandAttachmentStatus | undefined
): status is MainHandAttachmentStatus {
  if (!status) return false;
  return equipmentState === 'unarmed'
    ? status.code === 'unarmed'
    : status.code === 'attached';
}

export interface WeaponAttachmentPreviewProps {
  equipmentState: WeaponEquipmentState;
  motion: WeaponMotion;
  view: WeaponView;
  facing: WeaponFacing;
  presentation?: MainHandPresentation;
  onAttachmentStatus?: (status: MainHandAttachmentStatus) => void;
  onRenderObserved: (observation: WeaponRenderObservation) => void;
}

export function WeaponAttachmentScene({
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

  useEffect(() => {
    if (!attachmentStatus) return;
    onAttachmentStatus?.(attachmentStatus);
  }, [attachmentStatus, onAttachmentStatus]);

  useEffect(() => {
    if (!isStableObservation(equipmentState, attachmentStatus)) {
      lastObservedKey.current = undefined;
      return;
    }

    const observation = {
      equipmentState,
      motion,
      view,
      facing,
      attachmentCode: attachmentStatus.code,
    } satisfies WeaponRenderObservation;
    const key = [
      equipmentState,
      motion,
      view,
      facing,
      attachmentStatus.code,
    ].join('|');
    if (lastObservedKey.current === key) return;
    lastObservedKey.current = key;
    onRenderObserved(observation);
  }, [
    attachmentStatus,
    equipmentState,
    facing,
    motion,
    onRenderObserved,
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
          url={FIGHTER_URL}
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
      style={{ width: '100%', height: '100%', minHeight: 520 }}
    >
      <Canvas frameloop="demand" dpr={[1, 1.5]}>
        <WeaponAttachmentScene {...props} />
      </Canvas>
    </div>
  );
}
