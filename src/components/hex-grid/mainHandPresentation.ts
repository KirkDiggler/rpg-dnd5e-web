import * as THREE from 'three';

export type Vec3Tuple = readonly [number, number, number];
export type QuaternionTuple = readonly [number, number, number, number];

export interface MainHandSocket {
  bone: string;
  boneUnitMeters: number;
  positionMeters: Vec3Tuple;
  rotationQuaternion: QuaternionTuple;
  scale: number;
}

export interface MainHandPresentation {
  ref: string;
  weaponUrl: string;
  socket: MainHandSocket;
}

export type MainHandAttachmentCode =
  | 'unarmed'
  | 'loading'
  | 'attached'
  | 'unmapped-ref'
  | 'asset-load-failed'
  | 'missing-bone'
  | 'invalid-socket';

export interface MainHandAttachmentStatus {
  code: MainHandAttachmentCode;
  ref?: string;
  weaponUrl?: string;
  bone?: string;
  message?: string;
}

export interface MainHandAttachmentResult {
  status: MainHandAttachmentStatus;
  detach: () => void;
}

const noop = (): void => {};

const allFinite = (values: readonly number[]): boolean =>
  values.every(Number.isFinite);

export function validateMainHandSocket(socket: MainHandSocket): boolean {
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
  code: MainHandAttachmentCode,
  presentation: MainHandPresentation,
  message?: string
): MainHandAttachmentStatus => ({
  code,
  ref: presentation.ref,
  weaponUrl: presentation.weaponUrl,
  bone: presentation.socket.bone,
  message,
});

export function attachMainHandObject(
  characterRoot: THREE.Object3D,
  weaponRoot: THREE.Object3D,
  presentation: MainHandPresentation
): MainHandAttachmentResult {
  const { socket } = presentation;

  if (!validateMainHandSocket(socket)) {
    return {
      status: statusFor('invalid-socket', presentation),
      detach: noop,
    };
  }

  const bone = characterRoot.getObjectByName(socket.bone);
  if (!(bone instanceof THREE.Bone)) {
    return {
      status: statusFor('missing-bone', presentation),
      detach: noop,
    };
  }

  const unitsPerMeter = 1 / socket.boneUnitMeters;
  weaponRoot.position
    .fromArray(socket.positionMeters)
    .multiplyScalar(unitsPerMeter);
  weaponRoot.quaternion.fromArray(socket.rotationQuaternion).normalize();
  weaponRoot.scale.setScalar(socket.scale * unitsPerMeter);
  bone.add(weaponRoot);

  return {
    status: statusFor('attached', presentation),
    detach: () => {
      if (weaponRoot.parent === bone) {
        bone.remove(weaponRoot);
      }
    },
  };
}
