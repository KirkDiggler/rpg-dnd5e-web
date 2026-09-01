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
  updateRuntimeSurfaceTreatment,
  type RuntimeSurfaceTreatment,
} from './runtimeSurfaceTreatment';
import { bindSkinnedAccessory } from './skinnedAccessory';

export interface SkinnedAccessoryPresentation {
  readonly slot: 'scalp' | 'facial-hair';
  readonly styleRef: string;
  readonly url: string;
  readonly treatment: RuntimeSurfaceTreatment;
}

/** Values read back from an attachment's per-instance cloned materials. */
export interface SkinnedAccessoryMaterialEvidence extends RuntimeSurfaceTreatment {
  readonly materialUuid: string;
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
      readonly url: string;
    }
  | {
      readonly code: 'attached';
      readonly slot: SkinnedAccessoryPresentation['slot'];
      readonly styleRef: string;
      readonly url: string;
      readonly meshUuid: string;
      readonly bodyRootBoneUuid: string;
      readonly mappedBoneNames: readonly string[];
      readonly mappedBoneUuids: readonly string[];
      readonly instanceMaterials: readonly SkinnedAccessoryMaterialEvidence[];
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

interface MountedAttachment {
  readonly identity: PresentationIdentity;
  readonly mesh: THREE.SkinnedMesh;
  readonly materials: readonly THREE.MeshStandardMaterial[];
  readonly bodyRootBoneUuid: string;
  readonly mappedBoneNames: readonly string[];
  readonly mappedBoneUuids: readonly string[];
  readonly ownsSkeletonWrapper: boolean;
}

function attachedStatus(mounted: MountedAttachment): SkinnedAccessoryStatus {
  return {
    code: 'attached',
    slot: mounted.identity.slot,
    styleRef: mounted.identity.styleRef,
    url: mounted.identity.url,
    meshUuid: mounted.mesh.uuid,
    bodyRootBoneUuid: mounted.bodyRootBoneUuid,
    mappedBoneNames: mounted.mappedBoneNames,
    mappedBoneUuids: mounted.mappedBoneUuids,
    instanceMaterials: mounted.materials.map((material) => ({
      materialUuid: material.uuid,
      baseColorSrgb:
        `#${material.color.getHexString().toUpperCase()}` as `#${string}`,
      roughness: material.roughness,
      metalness: material.metalness,
    })),
  };
}

function materialsMatchTreatment(
  materials: readonly THREE.MeshStandardMaterial[],
  treatment: RuntimeSurfaceTreatment
): boolean {
  return materials.every(
    (material) =>
      `#${material.color.getHexString().toUpperCase()}` ===
        treatment.baseColorSrgb.toUpperCase() &&
      material.roughness === treatment.roughness &&
      material.metalness === treatment.metalness
  );
}

function LoadedAttachment({
  characterRoot,
  identity,
  presentation,
  invalidate,
  reportStatus,
}: LoadedAttachmentProps) {
  const { scene } = useGLTF(identity.url);
  const mountedAttachment = useRef<MountedAttachment | undefined>(undefined);
  const currentTreatment = useRef(presentation.treatment);
  const currentInvalidate = useRef(invalidate);
  currentTreatment.current = presentation.treatment;
  currentInvalidate.current = invalidate;
  const { baseColorSrgb, roughness, metalness } = presentation.treatment;

  // Identity owns cloning, rebinding, mounting, and cleanup. Treatment values
  // deliberately stay behind a ref so color/PBR changes cannot replay this
  // lifecycle and make the accessory disappear for a frame.
  useEffect(() => {
    reportStatus(identity, {
      code: 'loading',
      slot: identity.slot,
      styleRef: identity.styleRef,
      url: identity.url,
    });

    let accessoryRoot: THREE.Object3D;
    try {
      accessoryRoot = cloneSkeleton(scene);
    } catch (error) {
      if (
        reportStatus(identity, rejectionStatus(identity, errorMessage(error)))
      ) {
        currentInvalidate.current();
      }
      return;
    }

    const result = bindSkinnedAccessory(characterRoot, accessoryRoot);
    if (!result.ok) {
      if (reportStatus(identity, rejectionStatus(identity, result.message))) {
        currentInvalidate.current();
      }
      return;
    }

    let materials: readonly THREE.MeshStandardMaterial[];
    try {
      materials = applyRuntimeSurfaceTreatment(
        result.mesh,
        currentTreatment.current
      );
    } catch (error) {
      if (result.ownsSkeletonWrapper) result.mesh.skeleton.dispose();
      if (
        reportStatus(identity, rejectionStatus(identity, errorMessage(error)))
      ) {
        currentInvalidate.current();
      }
      return;
    }

    const mounted: MountedAttachment = {
      identity,
      mesh: result.mesh,
      materials,
      bodyRootBoneUuid: result.bodyRootBoneUuid,
      mappedBoneNames: result.mappedBoneNames,
      mappedBoneUuids: result.mappedBoneUuids,
      ownsSkeletonWrapper: result.ownsSkeletonWrapper,
    };
    mountedAttachment.current = mounted;
    characterRoot.add(mounted.mesh);
    currentInvalidate.current();
    if (!reportStatus(identity, attachedStatus(mounted))) {
      // In StrictMode's setup -> cleanup -> setup probe, child passive effects
      // run before the parent's identity-restoring setup. Retry only for the
      // still-mounted instance after that setup so diagnostics cannot retain
      // UUIDs from the disposed probe instance.
      queueMicrotask(() => {
        if (mountedAttachment.current === mounted) {
          reportStatus(identity, attachedStatus(mounted));
        }
      });
    }

    return () => {
      if (mountedAttachment.current === mounted) {
        mountedAttachment.current = undefined;
      }
      characterRoot.remove(mounted.mesh);
      mounted.materials.forEach((material) => material.dispose());
      if (mounted.ownsSkeletonWrapper) mounted.mesh.skeleton.dispose();
      currentInvalidate.current();
    };
  }, [characterRoot, identity, reportStatus, scene]);

  // The mounted mesh and its instance-owned material objects remain stable.
  // Mutate only their supported surface fields, then publish values read back
  // from those same material identities for the diagnostics fence.
  useEffect(() => {
    const mounted = mountedAttachment.current;
    if (!mounted || mounted.identity !== identity) return;
    const treatment: RuntimeSurfaceTreatment = {
      baseColorSrgb,
      roughness,
      metalness,
    };
    if (materialsMatchTreatment(mounted.materials, treatment)) return;

    try {
      updateRuntimeSurfaceTreatment(mounted.materials, treatment);
    } catch (error) {
      if (
        reportStatus(identity, rejectionStatus(identity, errorMessage(error)))
      ) {
        currentInvalidate.current();
      }
      return;
    }
    if (reportStatus(identity, attachedStatus(mounted))) {
      currentInvalidate.current();
    }
  }, [baseColorSrgb, identity, metalness, reportStatus, roughness]);

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
      url: identity.url,
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
