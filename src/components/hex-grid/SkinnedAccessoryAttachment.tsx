import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  applyRuntimeSurfaceTreatment,
  type RuntimeSurfaceTreatment,
} from './runtimeSurfaceTreatment';
import { bindSkinnedAccessory } from './skinnedAccessory';

export interface SkinnedAccessoryPresentation {
  readonly slot: 'scalp' | 'facial-hair';
  readonly styleRef: string;
  readonly url: string;
  readonly treatment: RuntimeSurfaceTreatment;
}

export type SkinnedAccessoryStatus =
  | {
      readonly code: 'none';
      readonly slot: SkinnedAccessoryPresentation['slot'];
    }
  | {
      readonly code: 'loading';
      readonly slot: SkinnedAccessoryPresentation['slot'];
      readonly styleRef: string;
    }
  | {
      readonly code: 'attached';
      readonly slot: SkinnedAccessoryPresentation['slot'];
      readonly styleRef: string;
      readonly url: string;
      readonly bodyRootBoneUuid: string;
      readonly mappedBoneNames: readonly string[];
      readonly mappedBoneUuids: readonly string[];
    }
  | {
      readonly code: 'rejected';
      readonly slot: SkinnedAccessoryPresentation['slot'];
      readonly styleRef: string;
      readonly url: string;
      readonly message: string;
    };

interface PresentationIdentity {
  readonly slot: SkinnedAccessoryPresentation['slot'];
  readonly styleRef: string;
  readonly url: string;
}

type ReportStatus = (
  identity: PresentationIdentity,
  status: SkinnedAccessoryStatus
) => boolean;

interface StatusReporterProps {
  readonly identity: PresentationIdentity;
  readonly status: SkinnedAccessoryStatus;
  readonly reportStatus: ReportStatus;
}

function StatusReporter({
  identity,
  status,
  reportStatus,
}: StatusReporterProps) {
  useEffect(() => {
    reportStatus(identity, status);
  }, [identity, reportStatus, status]);
  return null;
}

interface LoadedAttachmentProps {
  readonly characterRoot: THREE.Object3D;
  readonly identity: PresentationIdentity;
  readonly presentation: SkinnedAccessoryPresentation;
  readonly invalidate: () => void;
  readonly reportStatus: ReportStatus;
}

function rejectionStatus(
  identity: PresentationIdentity,
  message: string
): SkinnedAccessoryStatus {
  return {
    code: 'rejected',
    slot: identity.slot,
    styleRef: identity.styleRef,
    url: identity.url,
    message,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function LoadedAttachment({
  characterRoot,
  identity,
  presentation,
  invalidate,
  reportStatus,
}: LoadedAttachmentProps) {
  const { scene } = useGLTF(identity.url);
  const { baseColorSrgb, roughness, metalness } = presentation.treatment;

  useEffect(() => {
    reportStatus(identity, {
      code: 'loading',
      slot: identity.slot,
      styleRef: identity.styleRef,
    });

    let accessoryRoot: THREE.Object3D;
    try {
      accessoryRoot = cloneSkeleton(scene);
    } catch (error) {
      if (
        reportStatus(identity, rejectionStatus(identity, errorMessage(error)))
      ) {
        invalidate();
      }
      return;
    }

    const result = bindSkinnedAccessory(characterRoot, accessoryRoot);
    if (!result.ok) {
      if (reportStatus(identity, rejectionStatus(identity, result.message))) {
        invalidate();
      }
      return;
    }

    let createdMaterials: readonly THREE.Material[];
    try {
      createdMaterials = applyRuntimeSurfaceTreatment(result.mesh, {
        baseColorSrgb,
        roughness,
        metalness,
      });
    } catch (error) {
      if (result.ownsSkeletonWrapper) result.mesh.skeleton.dispose();
      if (
        reportStatus(identity, rejectionStatus(identity, errorMessage(error)))
      ) {
        invalidate();
      }
      return;
    }

    characterRoot.add(result.mesh);
    invalidate();
    reportStatus(identity, {
      code: 'attached',
      slot: identity.slot,
      styleRef: identity.styleRef,
      url: identity.url,
      bodyRootBoneUuid: result.bodyRootBoneUuid,
      mappedBoneNames: result.mappedBoneNames,
      mappedBoneUuids: result.mappedBoneUuids,
    });

    return () => {
      characterRoot.remove(result.mesh);
      createdMaterials.forEach((material) => material.dispose());
      if (result.ownsSkeletonWrapper) result.mesh.skeleton.dispose();
      invalidate();
    };
  }, [
    baseColorSrgb,
    characterRoot,
    identity,
    invalidate,
    metalness,
    reportStatus,
    roughness,
    scene,
  ]);

  return null;
}

interface AttachmentErrorBoundaryProps {
  readonly identity: PresentationIdentity;
  readonly invalidate: () => void;
  readonly reportStatus: ReportStatus;
  readonly children: ReactNode;
}

class AttachmentErrorBoundary extends Component<
  AttachmentErrorBoundaryProps,
  { readonly failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const { identity, invalidate, reportStatus } = this.props;
    if (
      reportStatus(identity, rejectionStatus(identity, errorMessage(error)))
    ) {
      invalidate();
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface SkinnedAccessoryAttachmentProps {
  readonly characterRoot: THREE.Object3D;
  readonly presentation: SkinnedAccessoryPresentation;
  readonly onStatus?: (status: SkinnedAccessoryStatus) => void;
}

export function SkinnedAccessoryAttachment({
  characterRoot,
  presentation,
  onStatus,
}: SkinnedAccessoryAttachmentProps) {
  const invalidate = useThree((state) => state.invalidate);
  const identity = useMemo<PresentationIdentity>(
    () => ({
      slot: presentation.slot,
      styleRef: presentation.styleRef,
      url: presentation.url,
    }),
    [presentation.slot, presentation.styleRef, presentation.url]
  );
  const currentIdentity = useRef<PresentationIdentity | null>(identity);
  const loadingReportedFor = useRef<PresentationIdentity | null>(null);
  const currentOnStatus = useRef(onStatus);
  currentIdentity.current = identity;
  currentOnStatus.current = onStatus;

  const reportStatus = useCallback<ReportStatus>((reportedIdentity, status) => {
    if (currentIdentity.current !== reportedIdentity) return false;
    if (
      status.code === 'loading' &&
      loadingReportedFor.current === reportedIdentity
    ) {
      return true;
    }
    if (status.code === 'loading') {
      loadingReportedFor.current = reportedIdentity;
    }
    currentOnStatus.current?.(status);
    return true;
  }, []);

  // StrictMode replays setup -> cleanup -> setup without another render. Restore
  // the committed identity in setup so the cleanup probe cannot disarm the
  // terminal-status fence while a Suspense load remains pending.
  useEffect(() => {
    currentIdentity.current = identity;
    return () => {
      if (currentIdentity.current === identity) currentIdentity.current = null;
    };
  }, [identity]);

  const loading = useMemo<SkinnedAccessoryStatus>(
    () => ({
      code: 'loading',
      slot: identity.slot,
      styleRef: identity.styleRef,
    }),
    [identity]
  );
  const key = `${identity.slot}|${identity.styleRef}|${identity.url}`;

  return (
    <AttachmentErrorBoundary
      key={key}
      identity={identity}
      invalidate={invalidate}
      reportStatus={reportStatus}
    >
      <Suspense
        fallback={
          <StatusReporter
            identity={identity}
            status={loading}
            reportStatus={reportStatus}
          />
        }
      >
        <LoadedAttachment
          characterRoot={characterRoot}
          identity={identity}
          presentation={presentation}
          invalidate={invalidate}
          reportStatus={reportStatus}
        />
      </Suspense>
    </AttachmentErrorBoundary>
  );
}
