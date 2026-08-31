import { facingToRotationY } from '@/components/hex-grid/authorGridHelpers';
import { ClassCharacterModel } from '@/components/hex-grid/ClassCharacterModel';
import { resolvePlayerCharacterModel } from '@/components/hex-grid/classCharacterModels';
import type { MainHandAttachmentStatus } from '@/components/hex-grid/mainHandPresentation';
import { mainHandSocketForRigFamily } from '@/components/hex-grid/mainHandWeapons';
import {
  offHandSocketForRigFamily,
  type OffHandAttachmentStatus,
} from '@/components/hex-grid/offHandEquipment';
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import type {
  OffHandClassId,
  OffHandFacing,
  OffHandMotion,
  OffHandRaceId,
  OffHandStateId,
  OffHandView,
} from './offHandAttachmentExperiment';
import { resolveOffHandFixture } from './offHandAttachmentExperiment';
import { lookAtQuaternion } from './offHandCamera';

const CLOSE_POSITION = [-1.5, 1.3, 1.1] as const;
const CLOSE_QUATERNION = lookAtQuaternion(CLOSE_POSITION, [-0.55, 1.0, 0]);
const ORBIT_POSITION = [2.4, 1.8, 3.1] as const;
const ORBIT_TARGET = [0, 0.8, 0] as const;
const ORBIT_QUATERNION = lookAtQuaternion(ORBIT_POSITION, ORBIT_TARGET);
const PLAY_POSITION = [4.5, 6.2, 4.5] as const;
const PLAY_QUATERNION = lookAtQuaternion(PLAY_POSITION, [0, 0.65, 0]);

export interface OffHandAttachmentPreviewProps {
  stateId: OffHandStateId;
  classId: OffHandClassId;
  raceId: OffHandRaceId;
  motion: OffHandMotion;
  view: OffHandView;
  facing: OffHandFacing;
  onMainStatus?: (status: MainHandAttachmentStatus) => void;
  onOffStatus?: (status: OffHandAttachmentStatus) => void;
}

function Camera({ view }: { view: OffHandView }) {
  if (view === 'close') {
    return (
      <PerspectiveCamera
        makeDefault
        position={CLOSE_POSITION}
        quaternion={CLOSE_QUATERNION}
        fov={38}
      />
    );
  }
  if (view === 'orbit') {
    return (
      <>
        <PerspectiveCamera
          makeDefault
          position={ORBIT_POSITION}
          quaternion={ORBIT_QUATERNION}
          fov={42}
        />
        <OrbitControls makeDefault target={ORBIT_TARGET} />
      </>
    );
  }
  return (
    <OrthographicCamera
      makeDefault
      position={PLAY_POSITION}
      quaternion={PLAY_QUATERNION}
      zoom={150}
      near={0.1}
      far={100}
    />
  );
}

export function OffHandAttachmentScene(props: OffHandAttachmentPreviewProps) {
  const resolution = useMemo(
    () => resolveOffHandFixture(props.stateId),
    [props.stateId]
  );
  const model = useMemo(
    () => resolvePlayerCharacterModel(props.raceId, props.classId, false),
    [props.classId, props.raceId]
  );
  if (!model) return null;
  const main =
    resolution.mainHand.code === 'mapped'
      ? resolution.mainHand.presentation
      : undefined;
  const off =
    resolution.offHand.code === 'mapped'
      ? resolution.offHand.presentation
      : undefined;
  return (
    <>
      <Camera view={props.view} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} />
      <Suspense fallback={null}>
        <ClassCharacterModel
          key={model.url}
          url={model.url}
          isMoving={props.motion === 'walk'}
          facingRotation={facingToRotationY(props.facing)}
          mainHandPresentation={main}
          mainHandSocketOverride={mainHandSocketForRigFamily(model.rigFamily)}
          onMainHandStatus={props.onMainStatus}
          offHandPresentation={off}
          offHandSocketOverride={offHandSocketForRigFamily(model.rigFamily)}
          onOffHandStatus={props.onOffStatus}
        />
      </Suspense>
      <gridHelper
        args={[8, 16, '#354d4b', '#1d2928']}
        position={[0, 0.02, 0]}
      />
    </>
  );
}

export function OffHandAttachmentPreview(props: OffHandAttachmentPreviewProps) {
  return (
    <div
      data-testid="off-hand-attachment-preview"
      style={{ width: '100%', height: 520, minHeight: 520 }}
    >
      <Canvas frameloop="demand" dpr={[1, 1.5]}>
        <OffHandAttachmentScene {...props} />
      </Canvas>
    </div>
  );
}
