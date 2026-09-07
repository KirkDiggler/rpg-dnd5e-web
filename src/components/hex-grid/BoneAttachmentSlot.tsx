import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  attachBoneObject,
  type BoneAttachmentStatus,
  type BonePresentation,
} from './boneAttachment';

function StatusReporter({
  status,
  onStatus,
}: {
  status: BoneAttachmentStatus;
  onStatus?: (status: BoneAttachmentStatus) => void;
}) {
  const { code, ref, assetUrl, bone, message } = status;
  useEffect(() => {
    const reported: BoneAttachmentStatus = { code };
    if (ref !== undefined) reported.ref = ref;
    if (assetUrl !== undefined) reported.assetUrl = assetUrl;
    if (bone !== undefined) reported.bone = bone;
    if (message !== undefined) reported.message = message;
    onStatus?.(reported);
  }, [assetUrl, bone, code, message, onStatus, ref]);
  return null;
}

function LoadedAttachment({
  characterRoot,
  presentation,
  onStatus,
}: {
  characterRoot: THREE.Object3D;
  presentation: BonePresentation;
  onStatus?: (status: BoneAttachmentStatus) => void;
}) {
  const { scene } = useGLTF(presentation.assetUrl);
  const asset = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) child.raycast = () => {};
    });
    return clone;
  }, [scene]);
  useEffect(() => {
    const result = attachBoneObject(characterRoot, asset, presentation);
    onStatus?.(result.status);
    return result.detach;
  }, [asset, characterRoot, onStatus, presentation]);
  return null;
}

class AttachmentErrorBoundary extends Component<
  {
    presentation: BonePresentation;
    onStatus?: (status: BoneAttachmentStatus) => void;
    children: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    const { presentation, onStatus } = this.props;
    onStatus?.({
      code: 'asset-load-failed',
      ref: presentation.ref,
      assetUrl: presentation.assetUrl,
      bone: presentation.socket.bone,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface BoneAttachmentSlotProps {
  characterRoot: THREE.Object3D;
  presentation?: BonePresentation;
  onStatus?: (status: BoneAttachmentStatus) => void;
}

export function BoneAttachmentSlot({
  characterRoot,
  presentation,
  onStatus,
}: BoneAttachmentSlotProps) {
  if (!presentation) {
    return <StatusReporter status={{ code: 'empty' }} onStatus={onStatus} />;
  }
  const loading: BoneAttachmentStatus = {
    code: 'loading',
    ref: presentation.ref,
    assetUrl: presentation.assetUrl,
    bone: presentation.socket.bone,
  };
  return (
    <AttachmentErrorBoundary presentation={presentation} onStatus={onStatus}>
      <Suspense
        fallback={<StatusReporter status={loading} onStatus={onStatus} />}
      >
        <LoadedAttachment
          characterRoot={characterRoot}
          presentation={presentation}
          onStatus={onStatus}
        />
      </Suspense>
    </AttachmentErrorBoundary>
  );
}
