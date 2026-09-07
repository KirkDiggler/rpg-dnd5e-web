import type * as THREE from 'three';
import {
  attachBoneObject,
  validateHandSocket,
  type BoneAttachmentCode,
  type BoneAttachmentStatus,
  type HandSocket,
} from './boneAttachment';

export type Vec3Tuple = readonly [number, number, number];
export type QuaternionTuple = readonly [number, number, number, number];
export type MainHandSocket = HandSocket;

export interface MainHandPresentation {
  ref: string;
  weaponUrl: string;
  socket: MainHandSocket;
}

export type MainHandAttachmentCode =
  | Exclude<BoneAttachmentCode, 'empty'>
  | 'unarmed';

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

export const validateMainHandSocket = validateHandSocket;

export function mainHandStatusFromBone(
  status: BoneAttachmentStatus
): MainHandAttachmentStatus {
  const mapped: MainHandAttachmentStatus = {
    code: status.code === 'empty' ? 'unarmed' : status.code,
  };
  if (status.ref !== undefined) mapped.ref = status.ref;
  if (status.assetUrl !== undefined) mapped.weaponUrl = status.assetUrl;
  if (status.bone !== undefined) mapped.bone = status.bone;
  if (status.message !== undefined) mapped.message = status.message;
  return mapped;
}

export function attachMainHandObject(
  characterRoot: THREE.Object3D,
  weaponRoot: THREE.Object3D,
  presentation: MainHandPresentation
): MainHandAttachmentResult {
  const result = attachBoneObject(characterRoot, weaponRoot, {
    ref: presentation.ref,
    assetUrl: presentation.weaponUrl,
    socket: presentation.socket,
  });
  return {
    status: mainHandStatusFromBone(result.status),
    detach: result.detach,
  };
}
