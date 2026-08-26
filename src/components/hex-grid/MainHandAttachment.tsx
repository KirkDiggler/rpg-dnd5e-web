import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  attachMainHandObject,
  type MainHandAttachmentStatus,
  type MainHandPresentation,
} from './mainHandPresentation';

interface StatusProps {
  status: MainHandAttachmentStatus;
  onStatus?: (status: MainHandAttachmentStatus) => void;
}

function StatusReporter({ status, onStatus }: StatusProps) {
  const { code, ref, weaponUrl, bone, message } = status;

  useEffect(() => {
    if (!onStatus) return;

    const reportedStatus: MainHandAttachmentStatus = { code };
    if (ref !== undefined) reportedStatus.ref = ref;
    if (weaponUrl !== undefined) reportedStatus.weaponUrl = weaponUrl;
    if (bone !== undefined) reportedStatus.bone = bone;
    if (message !== undefined) reportedStatus.message = message;

    onStatus(reportedStatus);
  }, [bone, code, message, onStatus, ref, weaponUrl]);
  return null;
}

interface LoadedAttachmentProps {
  characterRoot: THREE.Object3D;
  presentation: MainHandPresentation;
  onStatus?: (status: MainHandAttachmentStatus) => void;
}

function LoadedAttachment({
  characterRoot,
  presentation,
  onStatus,
}: LoadedAttachmentProps) {
  const { scene } = useGLTF(presentation.weaponUrl);
  const weapon = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) child.raycast = () => {};
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    const result = attachMainHandObject(characterRoot, weapon, presentation);
    onStatus?.(result.status);
    return result.detach;
  }, [characterRoot, onStatus, presentation, weapon]);

  return null;
}

interface ErrorBoundaryProps {
  presentation: MainHandPresentation;
  onStatus?: (status: MainHandAttachmentStatus) => void;
  children: ReactNode;
}

class AttachmentErrorBoundary extends Component<
  ErrorBoundaryProps,
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
      weaponUrl: presentation.weaponUrl,
      bone: presentation.socket.bone,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
  if (!presentation) {
    return <StatusReporter status={{ code: 'unarmed' }} onStatus={onStatus} />;
  }

  const loading: MainHandAttachmentStatus = {
    code: 'loading',
    ref: presentation.ref,
    weaponUrl: presentation.weaponUrl,
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
