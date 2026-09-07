import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { BoneAttachmentSlot } from './BoneAttachmentSlot';
import type { BoneAttachmentStatus, BonePresentation } from './boneAttachment';
import {
  mainHandStatusFromBone,
  type MainHandAttachmentStatus,
  type MainHandPresentation,
} from './mainHandPresentation';

export interface MainHandAttachmentSlotProps {
  characterRoot: THREE.Object3D;
  presentation?: MainHandPresentation;
  onStatus?: (status: MainHandAttachmentStatus) => void;
}

export function MainHandAttachmentSlot({
  characterRoot,
  presentation,
  onStatus,
}: MainHandAttachmentSlotProps) {
  const genericPresentation = useMemo<BonePresentation | undefined>(
    () =>
      presentation
        ? {
            ref: presentation.ref,
            assetUrl: presentation.weaponUrl,
            socket: presentation.socket,
          }
        : undefined,
    [presentation]
  );
  const handleStatus = useCallback(
    (status: BoneAttachmentStatus) =>
      onStatus?.(mainHandStatusFromBone(status)),
    [onStatus]
  );
  return (
    <BoneAttachmentSlot
      characterRoot={characterRoot}
      presentation={genericPresentation}
      onStatus={handleStatus}
    />
  );
}
