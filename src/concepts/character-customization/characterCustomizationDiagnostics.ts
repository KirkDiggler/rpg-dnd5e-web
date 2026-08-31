import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
} from '@/components/hex-grid/mainHandPresentation';
import {
  MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET,
  resolveMainHandPresentation,
} from '@/components/hex-grid/mainHandWeapons';
import type { SkinnedAccessoryStatus } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import type { CharacterCustomizationSlot } from './characterCustomizationAssets';
import {
  REFERENCE_CUSTOMIZATION_FIXTURE,
  hasPositiveReferenceTwinIsolation,
  isPositiveCustomizationObservation,
  resolveCustomizationFixture,
  type ActiveSurfacePreset,
  type CharacterCustomizationFixture,
  type CharacterCustomizationRenderObservation,
  type ResolvedCustomizationFixture,
  type StyleResolution,
} from './characterCustomizationExperiment';

const weaponResolution = resolveMainHandPresentation({
  main_hand: { module: 'dnd5e', type: 'item', id: 'warhammer' },
});
if (weaponResolution.code !== 'mapped') {
  throw new Error('Canonical customization weapon witness must be mapped.');
}

export const CUSTOMIZATION_WEAPON_PRESENTATION: MainHandPresentation = {
  ...weaponResolution.presentation,
  socket: MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET,
};

export const REFERENCE_CUSTOMIZATION_RESOLUTION = resolveCustomizationFixture(
  REFERENCE_CUSTOMIZATION_FIXTURE
);

export interface CharacterCustomizationDiagnostics {
  readonly scalpStatus?: SkinnedAccessoryStatus;
  readonly facialHairStatus?: SkinnedAccessoryStatus;
  readonly referenceScalpStatus?: SkinnedAccessoryStatus;
  readonly referenceFacialHairStatus?: SkinnedAccessoryStatus;
  readonly mountedAccessoryArmatures: 0 | 'unknown';
  readonly referenceTwinIsolation: boolean;
  readonly sceneCommitted: boolean;
  readonly committedObservationKey?: string;
  readonly weaponStatus: MainHandAttachmentStatus;
}

export const EMPTY_CUSTOMIZATION_DIAGNOSTICS: CharacterCustomizationDiagnostics =
  Object.freeze({
    mountedAccessoryArmatures: 'unknown',
    referenceTwinIsolation: false,
    sceneCommitted: false,
    weaponStatus: { code: 'unarmed' as const },
  });

export type CustomizationSlotStatuses = Partial<
  Record<CharacterCustomizationSlot, SkinnedAccessoryStatus>
>;

export type PendingCustomizationObservation = Omit<
  CharacterCustomizationRenderObservation,
  'sceneCommitted'
>;

export interface DeriveCustomizationEvidenceInput {
  readonly fixture: CharacterCustomizationFixture;
  readonly surfacePreset: ActiveSurfacePreset;
  readonly resolution: ResolvedCustomizationFixture;
  readonly controlledStatuses: CustomizationSlotStatuses;
  readonly referenceStatuses: CustomizationSlotStatuses;
  readonly weaponStatus?: MainHandAttachmentStatus;
  readonly committedObservationKey?: string;
}

export interface DerivedCustomizationEvidence {
  readonly diagnostics: CharacterCustomizationDiagnostics;
  readonly pendingObservation?: PendingCustomizationObservation;
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((value, index) => value === right[index]))
  );
}

export function sameAccessoryStatus(
  left: SkinnedAccessoryStatus | undefined,
  right: SkinnedAccessoryStatus
): boolean {
  if (!left || left.code !== right.code || left.slot !== right.slot) {
    return false;
  }
  switch (right.code) {
    case 'none':
      return true;
    case 'loading':
      return (
        left.code === 'loading' &&
        left.styleRef === right.styleRef &&
        left.url === right.url
      );
    case 'rejected':
      return (
        left.code === 'rejected' &&
        left.styleRef === right.styleRef &&
        left.url === right.url &&
        left.message === right.message
      );
    case 'attached':
      return (
        left.code === 'attached' &&
        left.styleRef === right.styleRef &&
        left.url === right.url &&
        left.bodyRootBoneUuid === right.bodyRootBoneUuid &&
        sameStringArray(left.mappedBoneNames, right.mappedBoneNames) &&
        sameStringArray(left.mappedBoneUuids, right.mappedBoneUuids) &&
        left.instanceMaterials.length === right.instanceMaterials.length &&
        left.instanceMaterials.every((material, index) => {
          const compared = right.instanceMaterials[index];
          return (
            compared !== undefined &&
            material.materialUuid === compared.materialUuid &&
            material.baseColorSrgb === compared.baseColorSrgb &&
            material.roughness === compared.roughness &&
            material.metalness === compared.metalness
          );
        })
      );
  }
}

export function sameWeaponStatus(
  left: MainHandAttachmentStatus | undefined,
  right: MainHandAttachmentStatus
): boolean {
  return (
    left?.code === right.code &&
    left?.ref === right.ref &&
    left?.weaponUrl === right.weaponUrl &&
    left?.bone === right.bone &&
    left?.message === right.message
  );
}

export function statusForCurrentResolution(
  status: SkinnedAccessoryStatus | undefined,
  resolution: StyleResolution
): SkinnedAccessoryStatus | undefined {
  if (resolution.code === 'none') {
    return { code: 'none', slot: resolution.slot };
  }
  if (resolution.code === 'unmapped' || !status || status.code === 'none') {
    return undefined;
  }
  if (
    status.slot !== resolution.slot ||
    status.styleRef !== resolution.styleRef ||
    status.url !== resolution.asset.url
  ) {
    return undefined;
  }
  return status;
}

function isTerminalStatus(status: SkinnedAccessoryStatus | undefined): boolean {
  return (
    status?.code === 'none' ||
    status?.code === 'attached' ||
    status?.code === 'rejected'
  );
}

function currentWeaponStatus(
  showWeaponWitness: boolean,
  stored: MainHandAttachmentStatus | undefined
): MainHandAttachmentStatus {
  if (!showWeaponWitness) return { code: 'unarmed' };

  const expected = CUSTOMIZATION_WEAPON_PRESENTATION;
  if (
    stored?.code !== 'unarmed' &&
    stored?.ref === expected.ref &&
    stored.weaponUrl === expected.weaponUrl &&
    stored.bone === expected.socket.bone
  ) {
    return stored;
  }
  return {
    code: 'loading',
    ref: expected.ref,
    weaponUrl: expected.weaponUrl,
    bone: expected.socket.bone,
  };
}

export function customizationObservationKey(
  observation: PendingCustomizationObservation
): string {
  return JSON.stringify(observation);
}

function pendingObservationFor(
  fixture: CharacterCustomizationFixture,
  surfacePreset: ActiveSurfacePreset,
  scalpStatus: SkinnedAccessoryStatus | undefined,
  facialHairStatus: SkinnedAccessoryStatus | undefined,
  referenceScalpStatus: SkinnedAccessoryStatus | undefined,
  referenceFacialHairStatus: SkinnedAccessoryStatus | undefined,
  mountedAccessoryArmatures: 0 | 'unknown'
): PendingCustomizationObservation | undefined {
  if (
    mountedAccessoryArmatures !== 0 ||
    !scalpStatus ||
    !facialHairStatus ||
    !referenceScalpStatus ||
    !referenceFacialHairStatus
  ) {
    return undefined;
  }
  const pending: PendingCustomizationObservation = {
    fixture: { ...fixture, treatment: { ...fixture.treatment } },
    surfacePreset,
    scalpStatus,
    facialHairStatus,
    referenceScalpStatus,
    referenceFacialHairStatus,
    mountedAccessoryArmatures,
  };
  return isPositiveCustomizationObservation({
    ...pending,
    sceneCommitted: true,
  })
    ? pending
    : undefined;
}

export function deriveCustomizationEvidence({
  fixture,
  surfacePreset,
  resolution,
  controlledStatuses,
  referenceStatuses,
  weaponStatus,
  committedObservationKey,
}: DeriveCustomizationEvidenceInput): DerivedCustomizationEvidence {
  const scalpStatus = statusForCurrentResolution(
    controlledStatuses.scalp,
    resolution.scalp
  );
  const facialHairStatus = statusForCurrentResolution(
    controlledStatuses['facial-hair'],
    resolution.facialHair
  );
  const referenceScalpStatus = statusForCurrentResolution(
    referenceStatuses.scalp,
    REFERENCE_CUSTOMIZATION_RESOLUTION.scalp
  );
  const referenceFacialHairStatus = statusForCurrentResolution(
    referenceStatuses['facial-hair'],
    REFERENCE_CUSTOMIZATION_RESOLUTION.facialHair
  );
  const allStatusesTerminal = [
    scalpStatus,
    facialHairStatus,
    referenceScalpStatus,
    referenceFacialHairStatus,
  ].every(isTerminalStatus);
  const mountedAccessoryArmatures = allStatusesTerminal ? 0 : 'unknown';
  const pendingObservation = pendingObservationFor(
    fixture,
    surfacePreset,
    scalpStatus,
    facialHairStatus,
    referenceScalpStatus,
    referenceFacialHairStatus,
    mountedAccessoryArmatures
  );
  const sceneCommitted = Boolean(
    pendingObservation &&
    committedObservationKey === customizationObservationKey(pendingObservation)
  );
  const committedObservation =
    pendingObservation && sceneCommitted
      ? { ...pendingObservation, sceneCommitted: true }
      : undefined;

  return {
    diagnostics: {
      scalpStatus,
      facialHairStatus,
      referenceScalpStatus,
      referenceFacialHairStatus,
      mountedAccessoryArmatures,
      referenceTwinIsolation: committedObservation
        ? hasPositiveReferenceTwinIsolation(committedObservation)
        : false,
      sceneCommitted,
      committedObservationKey,
      weaponStatus: currentWeaponStatus(
        fixture.showWeaponWitness,
        weaponStatus
      ),
    },
    pendingObservation,
  };
}

export function deriveCustomizationEvidenceFromDiagnostics(
  fixture: CharacterCustomizationFixture,
  surfacePreset: ActiveSurfacePreset,
  resolution: ResolvedCustomizationFixture,
  stored: CharacterCustomizationDiagnostics
): DerivedCustomizationEvidence {
  return deriveCustomizationEvidence({
    fixture,
    surfacePreset,
    resolution,
    controlledStatuses: {
      scalp: stored.scalpStatus,
      'facial-hair': stored.facialHairStatus,
    },
    referenceStatuses: {
      scalp: stored.referenceScalpStatus,
      'facial-hair': stored.referenceFacialHairStatus,
    },
    weaponStatus: stored.weaponStatus,
    committedObservationKey: stored.committedObservationKey,
  });
}

export function commitCustomizationObservationAfterRendererFrame(
  observation: PendingCustomizationObservation | undefined,
  rendererFrameAtReadiness: number,
  currentRendererFrame: number
): CharacterCustomizationRenderObservation | undefined {
  if (!observation || currentRendererFrame <= rendererFrameAtReadiness) {
    return undefined;
  }
  return { ...observation, sceneCommitted: true };
}
