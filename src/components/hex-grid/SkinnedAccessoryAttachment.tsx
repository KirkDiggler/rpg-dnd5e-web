import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import {
  updateRuntimeAccessorySurfaceTreatment,
  type RuntimeEntityMaterialTreatment,
  type RuntimeSurfaceTreatment,
} from './runtimeSurfaceTreatment';
import {
  markMountedSkinnedAccessory,
  prepareSkinnedAccessory,
  type PreparedSkinnedAccessory,
  type SkinnedAccessoryPresentation,
} from './skinnedAccessory';

export type { SkinnedAccessoryPresentation } from './skinnedAccessory';

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

interface MountedAttachment extends PreparedSkinnedAccessory {
  readonly identity: PresentationIdentity;
  appliedTreatmentKey: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function attachedStatus(mounted: MountedAttachment): SkinnedAccessoryStatus {
  return {
    code: 'attached',
    slot: mounted.identity.slot,
    styleRef: mounted.identity.styleRef,
    url: mounted.identity.url,
    meshUuid: mounted.mesh.uuid,
    bodyRootBoneUuid: mounted.evidence.bodyRootBoneUuid,
    mappedBoneNames: mounted.evidence.mappedBoneNames,
    mappedBoneUuids: mounted.evidence.mappedBoneUuids,
    instanceMaterials: mounted.materials.map((material) => ({
      materialUuid: material.uuid,
      baseColorSrgb:
        `#${material.color.getHexString().toUpperCase()}` as `#${string}`,
      roughness: material.roughness,
      metalness: material.metalness,
    })),
  };
}

function treatmentKey(
  surface: RuntimeSurfaceTreatment,
  entity: RuntimeEntityMaterialTreatment
): string {
  return [
    surface.baseColorSrgb.toUpperCase(),
    surface.roughness,
    surface.metalness,
    entity.isSelected,
    entity.isGhost,
    entity.remembered,
  ].join('|');
}

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
  readonly getPresentation: () => SkinnedAccessoryPresentation;
  readonly commitPrepared: (
    identity: PresentationIdentity,
    prepared: PreparedSkinnedAccessory
  ) => void;
  readonly rejectPrepared: (
    identity: PresentationIdentity,
    error: unknown
  ) => void;
  readonly reportStatus: ReportStatus;
}

function LoadedAttachment({
  characterRoot,
  identity,
  getPresentation,
  commitPrepared,
  rejectPrepared,
  reportStatus,
}: LoadedAttachmentProps) {
  const { scene } = useGLTF(identity.url);

  useLayoutEffect(() => {
    reportStatus(identity, {
      code: 'loading',
      slot: identity.slot,
      styleRef: identity.styleRef,
      url: identity.url,
    });
    let prepared: PreparedSkinnedAccessory;
    try {
      prepared = prepareSkinnedAccessory(
        characterRoot,
        scene,
        getPresentation()
      );
    } catch (error) {
      rejectPrepared(identity, error);
      return;
    }
    commitPrepared(identity, prepared);
    // Identity changes deliberately do not clean the mounted preparation.
    // The stable slot owner retains it until a newer preparation commits;
    // owner unmount owns the final active cleanup.
  }, [
    characterRoot,
    commitPrepared,
    getPresentation,
    identity,
    rejectPrepared,
    reportStatus,
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
  readonly isSelected?: boolean;
  readonly isGhost?: boolean;
  readonly remembered?: boolean;
  readonly onStatus?: (status: SkinnedAccessoryStatus) => void;
}

export function SkinnedAccessoryAttachment({
  characterRoot,
  presentation,
  isSelected = false,
  isGhost = false,
  remembered = false,
  onStatus,
}: SkinnedAccessoryAttachmentProps) {
  const invalidate = useThree((state) => state.invalidate);
  const currentInvalidate = useRef(invalidate);
  const currentOnStatus = useRef(onStatus);
  const currentPresentation = useRef(presentation);
  const currentEntityTreatment = useRef<RuntimeEntityMaterialTreatment>({
    isSelected,
    isGhost,
    remembered,
  });
  const activeRef = useRef<MountedAttachment | undefined>(undefined);
  const identity = useMemo<PresentationIdentity>(
    () => ({
      slot: presentation.slot,
      styleRef: presentation.styleRef,
      url: presentation.url,
    }),
    [presentation.slot, presentation.styleRef, presentation.url]
  );
  const currentIdentity = useRef(identity);
  const loadingReportedFor = useRef<PresentationIdentity | null>(null);
  currentIdentity.current = identity;
  currentInvalidate.current = invalidate;
  currentOnStatus.current = onStatus;
  currentPresentation.current = presentation;
  currentEntityTreatment.current = { isSelected, isGhost, remembered };

  const getPresentation = useCallback(() => currentPresentation.current, []);

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

  const rejectPrepared = useCallback(
    (reportedIdentity: PresentationIdentity, error: unknown) => {
      if (
        reportStatus(
          reportedIdentity,
          rejectionStatus(reportedIdentity, errorMessage(error))
        )
      ) {
        currentInvalidate.current();
      }
    },
    [reportStatus]
  );

  const commitPrepared = useCallback(
    (
      reportedIdentity: PresentationIdentity,
      prepared: PreparedSkinnedAccessory
    ) => {
      if (currentIdentity.current !== reportedIdentity) {
        prepared.dispose();
        return;
      }
      const currentSurface = currentPresentation.current.treatment;
      const currentEntity = currentEntityTreatment.current;
      try {
        updateRuntimeAccessorySurfaceTreatment(
          prepared.materials,
          currentSurface,
          currentEntity
        );
      } catch (error) {
        prepared.dispose();
        rejectPrepared(reportedIdentity, error);
        return;
      }
      const next: MountedAttachment = {
        ...prepared,
        identity: reportedIdentity,
        appliedTreatmentKey: treatmentKey(currentSurface, currentEntity),
      };
      const previous = activeRef.current;

      // One layout turn: next becomes renderable before the prior valid mesh
      // is removed, so no committed frame can observe an empty slot. Marking
      // keeps later preparations from mistaking this runtime subset skin for
      // another authoritative body skin.
      markMountedSkinnedAccessory(next.mesh);
      characterRoot.add(next.mesh);
      if (previous) {
        characterRoot.remove(previous.mesh);
        previous.dispose();
      }
      activeRef.current = next;
      currentInvalidate.current();
      if (!reportStatus(reportedIdentity, attachedStatus(next))) {
        prepared.dispose();
        characterRoot.remove(next.mesh);
        if (activeRef.current === next) activeRef.current = undefined;
      }
    },
    [characterRoot, rejectPrepared, reportStatus]
  );

  // The slot owner, not an identity-keyed loader child, owns final cleanup.
  // React StrictMode's setup/cleanup/setup probe therefore disposes only its
  // own prepared instance; cached source scene resources remain untouched.
  useLayoutEffect(() => {
    return () => {
      const active = activeRef.current;
      if (!active) return;
      activeRef.current = undefined;
      characterRoot.remove(active.mesh);
      active.dispose();
      currentInvalidate.current();
    };
  }, [characterRoot]);

  const { baseColorSrgb, roughness, metalness } = presentation.treatment;
  useEffect(() => {
    const active = activeRef.current;
    if (!active || active.identity !== identity) return;
    const surface: RuntimeSurfaceTreatment = {
      baseColorSrgb,
      roughness,
      metalness,
    };
    const entity = { isSelected, isGhost, remembered };
    const nextKey = treatmentKey(surface, entity);
    if (active.appliedTreatmentKey === nextKey) return;
    try {
      updateRuntimeAccessorySurfaceTreatment(active.materials, surface, entity);
    } catch (error) {
      rejectPrepared(identity, error);
      return;
    }
    active.appliedTreatmentKey = nextKey;
    if (reportStatus(identity, attachedStatus(active))) {
      currentInvalidate.current();
    }
  }, [
    baseColorSrgb,
    identity,
    isGhost,
    isSelected,
    metalness,
    rejectPrepared,
    remembered,
    reportStatus,
    roughness,
  ]);

  const loading = useMemo<SkinnedAccessoryStatus>(
    () => ({
      code: 'loading',
      slot: identity.slot,
      styleRef: identity.styleRef,
      url: identity.url,
    }),
    [identity]
  );
  const requestKey = `${identity.slot}|${identity.url}`;

  return (
    <AttachmentErrorBoundary
      key={requestKey}
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
          key={requestKey}
          characterRoot={characterRoot}
          identity={identity}
          getPresentation={getPresentation}
          commitPrepared={commitPrepared}
          rejectPrepared={rejectPrepared}
          reportStatus={reportStatus}
        />
      </Suspense>
    </AttachmentErrorBoundary>
  );
}
