import * as THREE from 'three';

export type Vec3Tuple = readonly [number, number, number];
export type QuaternionTuple = readonly [number, number, number, number];

export interface HandSocket {
  bone: string;
  boneUnitMeters: number;
  positionMeters: Vec3Tuple;
  rotationQuaternion: QuaternionTuple;
  scale: number;
}

export interface BonePresentation {
  ref: string;
  assetUrl: string;
  socket: HandSocket;
}

export type BoneAttachmentCode =
  | 'empty'
  | 'loading'
  | 'attached'
  | 'unmapped-ref'
  | 'asset-load-failed'
  | 'missing-bone'
  | 'invalid-socket';

export interface BoneAttachmentStatus {
  code: BoneAttachmentCode;
  ref?: string;
  assetUrl?: string;
  bone?: string;
  message?: string;
}

export interface BoneAttachmentResult {
  status: BoneAttachmentStatus;
  detach: () => void;
}

const noop = (): void => {};
const allFinite = (values: readonly number[]): boolean =>
  values.every(Number.isFinite);

export function validateHandSocket(socket: HandSocket): boolean {
  const quaternionLengthSquared = socket.rotationQuaternion.reduce(
    (sum, value) => sum + value * value,
    0
  );
  return (
    socket.bone.trim().length > 0 &&
    Number.isFinite(socket.boneUnitMeters) &&
    socket.boneUnitMeters > 0 &&
    allFinite(socket.positionMeters) &&
    allFinite(socket.rotationQuaternion) &&
    quaternionLengthSquared > Number.EPSILON &&
    Number.isFinite(socket.scale) &&
    socket.scale > 0
  );
}

const statusFor = (
  code: BoneAttachmentCode,
  presentation: BonePresentation,
  message?: string
): BoneAttachmentStatus => ({
  code,
  ref: presentation.ref,
  assetUrl: presentation.assetUrl,
  bone: presentation.socket.bone,
  message,
});

export function attachBoneObject(
  characterRoot: THREE.Object3D,
  assetRoot: THREE.Object3D,
  presentation: BonePresentation
): BoneAttachmentResult {
  const { socket } = presentation;
  if (!validateHandSocket(socket)) {
    return { status: statusFor('invalid-socket', presentation), detach: noop };
  }
  const bone = characterRoot.getObjectByName(socket.bone);
  if (!(bone instanceof THREE.Bone)) {
    return { status: statusFor('missing-bone', presentation), detach: noop };
  }
  const unitsPerMeter = 1 / socket.boneUnitMeters;
  assetRoot.position
    .fromArray(socket.positionMeters)
    .multiplyScalar(unitsPerMeter);
  assetRoot.quaternion.fromArray(socket.rotationQuaternion).normalize();
  assetRoot.scale.setScalar(socket.scale * unitsPerMeter);
  bone.add(assetRoot);
  return {
    status: statusFor('attached', presentation),
    detach: () => {
      if (assetRoot.parent === bone) bone.remove(assetRoot);
    },
  };
}
