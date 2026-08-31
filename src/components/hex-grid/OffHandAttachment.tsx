import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { BoneAttachmentSlot } from './BoneAttachmentSlot';
import type { BoneAttachmentStatus, BonePresentation } from './boneAttachment';
import {
  offHandStatusFromBone,
  type OffHandAttachmentStatus,
  type OffHandPresentation,
} from './offHandEquipment';

export interface OffHandAttachmentSlotProps {
  characterRoot: THREE.Object3D;
  presentation?: OffHandPresentation;
  onStatus?: (status: OffHandAttachmentStatus) => void;
}

export function OffHandAttachmentSlot({
  characterRoot,
  presentation,
  onStatus,
}: OffHandAttachmentSlotProps) {
  const genericPresentation = useMemo<BonePresentation | undefined>(
    () =>
      presentation
        ? {
            ref: presentation.ref,
            assetUrl: presentation.assetUrl,
            socket: presentation.socket,
          }
        : undefined,
    [presentation]
  );
  const handleStatus = useCallback(
    (status: BoneAttachmentStatus) => onStatus?.(offHandStatusFromBone(status)),
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
