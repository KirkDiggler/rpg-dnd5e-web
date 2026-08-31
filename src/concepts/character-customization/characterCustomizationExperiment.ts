import type { RuntimeSurfaceTreatment } from '@/components/hex-grid/runtimeSurfaceTreatment';
import type {
  SkinnedAccessoryPresentation,
  SkinnedAccessoryStatus,
} from '@/components/hex-grid/SkinnedAccessoryAttachment';
import {
  CHARACTER_CUSTOMIZATION_BODY,
  DEFAULT_FACIAL_HAIR_STYLE_REF,
  DEFAULT_SCALP_STYLE_REF,
  FACIAL_HAIR_OPTIONS,
  SCALP_OPTIONS,
  defaultStyleRefForSlot,
  optionsForSlot,
  type CharacterCustomizationAsset,
  type CharacterCustomizationSlot,
} from './characterCustomizationAssets';

export type StyleSelection = 'default' | 'none' | string;
export type CustomizationMotion = 'idle' | 'walk';
export type CustomizationView = 'close' | 'orbit' | 'play';

export interface CharacterCustomizationFixture {
  readonly scalp: StyleSelection;
  readonly facialHair: StyleSelection;
  readonly treatment: RuntimeSurfaceTreatment;
  readonly motion: CustomizationMotion;
  readonly view: CustomizationView;
  readonly showWeaponWitness: boolean;
}

export const SURFACE_PRESETS = Object.freeze({
  hair: Object.freeze({
    baseColorSrgb: '#5A3825',
    roughness: 0.72,
    metalness: 0,
  }),
  clothLike: Object.freeze({
    baseColorSrgb: '#5B6B8C',
    roughness: 0.95,
    metalness: 0,
  }),
  leatherLike: Object.freeze({
    baseColorSrgb: '#6B3F26',
    roughness: 0.7,
    metalness: 0,
  }),
  metalLike: Object.freeze({
    baseColorSrgb: '#9CA3AF',
    roughness: 0.25,
    metalness: 1,
  }),
} as const satisfies Record<string, RuntimeSurfaceTreatment>);

export type SurfacePresetName = keyof typeof SURFACE_PRESETS;
export type ActiveSurfacePreset = SurfacePresetName | 'custom';

export const DEFAULT_CUSTOMIZATION_FIXTURE: CharacterCustomizationFixture =
  Object.freeze({
    scalp: 'default',
    facialHair: 'default',
    treatment: SURFACE_PRESETS.hair,
    motion: 'idle',
    view: 'close',
    showWeaponWitness: false,
  });

export const REFERENCE_CUSTOMIZATION_FIXTURE: CharacterCustomizationFixture =
  Object.freeze({
    ...DEFAULT_CUSTOMIZATION_FIXTURE,
    scalp: DEFAULT_SCALP_STYLE_REF,
    facialHair: DEFAULT_FACIAL_HAIR_STYLE_REF,
    treatment: SURFACE_PRESETS.hair,
  });

export type StyleResolution =
  | {
      readonly code: 'none';
      readonly slot: CharacterCustomizationSlot;
      readonly selection: 'none';
    }
  | {
      readonly code: 'unmapped';
      readonly slot: CharacterCustomizationSlot;
      readonly selection: string;
    }
  | {
      readonly code: 'mapped';
      readonly slot: CharacterCustomizationSlot;
      readonly selection: StyleSelection;
      readonly styleRef: string;
      readonly asset: CharacterCustomizationAsset;
      readonly presentation: SkinnedAccessoryPresentation;
    };

export function resolveStyleSelection(
  slot: CharacterCustomizationSlot,
  selection: StyleSelection,
  treatment: RuntimeSurfaceTreatment
): StyleResolution {
  if (selection === 'none') return { code: 'none', slot, selection };

  const styleRef =
    selection === 'default' ? defaultStyleRefForSlot(slot) : selection;
  const asset = optionsForSlot(slot).find(
    (option) => option.styleRef === styleRef
  );
  if (!asset) return { code: 'unmapped', slot, selection };

  return {
    code: 'mapped',
    slot,
    selection,
    styleRef,
    asset,
    presentation: { slot, styleRef, url: asset.url, treatment },
  };
}

export interface ResolvedCustomizationFixture {
  readonly scalp: StyleResolution;
  readonly facialHair: StyleResolution;
  readonly presentations: readonly SkinnedAccessoryPresentation[];
}

export function resolveCustomizationFixture(
  fixture: CharacterCustomizationFixture
): ResolvedCustomizationFixture {
  const scalp = resolveStyleSelection(
    'scalp',
    fixture.scalp,
    fixture.treatment
  );
  const facialHair = resolveStyleSelection(
    'facial-hair',
    fixture.facialHair,
    fixture.treatment
  );
  const presentations = [scalp, facialHair].flatMap((resolution) =>
    resolution.code === 'mapped' ? [resolution.presentation] : []
  );
  return { scalp, facialHair, presentations };
}

export interface CharacterCustomizationRenderObservation {
  readonly fixture: CharacterCustomizationFixture;
  readonly surfacePreset: ActiveSurfacePreset;
  readonly scalpStatus: SkinnedAccessoryStatus;
  readonly facialHairStatus: SkinnedAccessoryStatus;
  readonly referenceScalpStatus: SkinnedAccessoryStatus;
  readonly referenceFacialHairStatus: SkinnedAccessoryStatus;
  readonly sceneCommitted: boolean;
  readonly mountedAccessoryArmatures: number;
}

export interface CharacterCustomizationCoverage {
  readonly scalpSelections: StyleSelection[];
  readonly facialHairSelections: StyleSelection[];
  readonly motions: CustomizationMotion[];
  readonly views: CustomizationView[];
  readonly surfacePresets: SurfacePresetName[];
  readonly simultaneousNonDefaultPair: boolean;
  readonly referenceTwinIsolation: boolean;
}

const SCALP_SELECTION_ORDER: StyleSelection[] = [
  'default',
  'none',
  ...SCALP_OPTIONS.map((option) => option.styleRef),
];
const FACIAL_HAIR_SELECTION_ORDER: StyleSelection[] = [
  'default',
  'none',
  ...FACIAL_HAIR_OPTIONS.map((option) => option.styleRef),
];
const MOTION_ORDER: CustomizationMotion[] = ['idle', 'walk'];
const VIEW_ORDER: CustomizationView[] = ['close', 'orbit', 'play'];
const PRESET_ORDER = Object.keys(SURFACE_PRESETS) as SurfacePresetName[];

function attachedStatusMatches(
  status: SkinnedAccessoryStatus,
  resolution: Extract<StyleResolution, { code: 'mapped' }>
): boolean {
  return (
    status.code === 'attached' &&
    status.slot === resolution.slot &&
    status.styleRef === resolution.styleRef &&
    status.url === resolution.asset.url &&
    status.bodyRootBoneUuid.length > 0 &&
    status.mappedBoneNames.length > 0 &&
    status.mappedBoneNames.length === status.mappedBoneUuids.length &&
    status.instanceMaterials.length > 0 &&
    status.instanceMaterials.every(
      (material) =>
        material.materialUuid.trim().length > 0 &&
        /^#[0-9A-F]{6}$/i.test(material.baseColorSrgb) &&
        Number.isFinite(material.roughness) &&
        material.roughness >= 0 &&
        material.roughness <= 1 &&
        Number.isFinite(material.metalness) &&
        material.metalness >= 0 &&
        material.metalness <= 1
    )
  );
}

export function statusMatchesResolution(
  status: SkinnedAccessoryStatus,
  resolution: StyleResolution
): boolean {
  if (resolution.code === 'unmapped') return false;
  if (resolution.code === 'none') {
    return status.code === 'none' && status.slot === resolution.slot;
  }
  return attachedStatusMatches(status, resolution);
}

function sameTreatment(
  left: RuntimeSurfaceTreatment,
  right: RuntimeSurfaceTreatment
): boolean {
  return (
    left.baseColorSrgb.toUpperCase() === right.baseColorSrgb.toUpperCase() &&
    left.roughness === right.roughness &&
    left.metalness === right.metalness
  );
}

function bodyIdentityIsCoherent(
  first: SkinnedAccessoryStatus,
  second: SkinnedAccessoryStatus
): boolean {
  if (first.code !== 'attached' || second.code !== 'attached') return true;
  return first.bodyRootBoneUuid === second.bodyRootBoneUuid;
}

function attachedStatuses(
  ...statuses: readonly SkinnedAccessoryStatus[]
): Extract<SkinnedAccessoryStatus, { code: 'attached' }>[] {
  return statuses.filter(
    (status): status is Extract<SkinnedAccessoryStatus, { code: 'attached' }> =>
      status.code === 'attached'
  );
}

function actualMaterialsMatch(
  statuses: readonly Extract<SkinnedAccessoryStatus, { code: 'attached' }>[],
  treatment: RuntimeSurfaceTreatment
): boolean {
  return statuses.every((status) =>
    status.instanceMaterials.every((material) =>
      sameTreatment(material, treatment)
    )
  );
}

function surfaceEvidenceMatchesFixture(
  observation: CharacterCustomizationRenderObservation
): boolean {
  return (
    actualMaterialsMatch(
      attachedStatuses(observation.scalpStatus, observation.facialHairStatus),
      observation.fixture.treatment
    ) &&
    actualMaterialsMatch(
      attachedStatuses(
        observation.referenceScalpStatus,
        observation.referenceFacialHairStatus
      ),
      REFERENCE_CUSTOMIZATION_FIXTURE.treatment
    )
  );
}

export function isPositiveCustomizationObservation(
  observation: CharacterCustomizationRenderObservation
): boolean {
  if (!observation.sceneCommitted) return false;
  if (observation.mountedAccessoryArmatures !== 0) return false;
  const resolution = resolveCustomizationFixture(observation.fixture);
  if (
    !statusMatchesResolution(observation.scalpStatus, resolution.scalp) ||
    !statusMatchesResolution(
      observation.facialHairStatus,
      resolution.facialHair
    )
  ) {
    return false;
  }

  const reference = resolveCustomizationFixture(
    REFERENCE_CUSTOMIZATION_FIXTURE
  );
  return (
    statusMatchesResolution(
      observation.referenceScalpStatus,
      reference.scalp
    ) &&
    statusMatchesResolution(
      observation.referenceFacialHairStatus,
      reference.facialHair
    ) &&
    bodyIdentityIsCoherent(
      observation.scalpStatus,
      observation.facialHairStatus
    ) &&
    bodyIdentityIsCoherent(
      observation.referenceScalpStatus,
      observation.referenceFacialHairStatus
    ) &&
    surfaceEvidenceMatchesFixture(observation)
  );
}

export function hasPositiveReferenceTwinIsolation(
  observation: CharacterCustomizationRenderObservation
): boolean {
  if (!isPositiveCustomizationObservation(observation)) return false;
  if (
    sameTreatment(
      observation.fixture.treatment,
      REFERENCE_CUSTOMIZATION_FIXTURE.treatment
    )
  ) {
    return false;
  }

  const controlled = attachedStatuses(
    observation.scalpStatus,
    observation.facialHairStatus
  );
  const reference = attachedStatuses(
    observation.referenceScalpStatus,
    observation.referenceFacialHairStatus
  );
  if (controlled.length === 0 || reference.length === 0) return false;

  const controlledRoots = new Set(
    controlled.map((status) => status.bodyRootBoneUuid)
  );
  const referenceRoots = new Set(
    reference.map((status) => status.bodyRootBoneUuid)
  );
  if (
    controlledRoots.size !== 1 ||
    referenceRoots.size !== 1 ||
    controlledRoots.values().next().value ===
      referenceRoots.values().next().value
  ) {
    return false;
  }

  const controlledMaterialUuids = controlled.flatMap((status) =>
    status.instanceMaterials.map((material) => material.materialUuid)
  );
  const referenceMaterialUuids = reference.flatMap((status) =>
    status.instanceMaterials.map((material) => material.materialUuid)
  );
  if (
    new Set(controlledMaterialUuids).size !== controlledMaterialUuids.length ||
    new Set(referenceMaterialUuids).size !== referenceMaterialUuids.length
  ) {
    return false;
  }
  const controlledIdentitySet = new Set(controlledMaterialUuids);
  return referenceMaterialUuids.every(
    (materialUuid) => !controlledIdentitySet.has(materialUuid)
  );
}

function isNonDefaultExactSelection(
  selection: StyleSelection,
  defaultStyleRef: string
): boolean {
  return (
    selection !== 'default' &&
    selection !== 'none' &&
    selection !== defaultStyleRef
  );
}

export function coverageFor(
  observations: readonly CharacterCustomizationRenderObservation[]
): CharacterCustomizationCoverage {
  const valid = observations.filter(isPositiveCustomizationObservation);
  return {
    scalpSelections: SCALP_SELECTION_ORDER.filter((selection) =>
      valid.some((row) => row.fixture.scalp === selection)
    ),
    facialHairSelections: FACIAL_HAIR_SELECTION_ORDER.filter((selection) =>
      valid.some((row) => row.fixture.facialHair === selection)
    ),
    motions: MOTION_ORDER.filter((motion) =>
      valid.some((row) => row.fixture.motion === motion)
    ),
    views: VIEW_ORDER.filter((view) =>
      valid.some((row) => row.fixture.view === view)
    ),
    surfacePresets: PRESET_ORDER.filter((preset) =>
      valid.some(
        (row) =>
          row.surfacePreset === preset &&
          sameTreatment(row.fixture.treatment, SURFACE_PRESETS[preset])
      )
    ),
    simultaneousNonDefaultPair: valid.some(
      (row) =>
        isNonDefaultExactSelection(
          row.fixture.scalp,
          DEFAULT_SCALP_STYLE_REF
        ) &&
        isNonDefaultExactSelection(
          row.fixture.facialHair,
          DEFAULT_FACIAL_HAIR_STYLE_REF
        )
    ),
    referenceTwinIsolation: valid.some(hasPositiveReferenceTwinIsolation),
  };
}

export function canRecordCustomizationVerdict(
  observations: readonly CharacterCustomizationRenderObservation[]
): boolean {
  const coverage = coverageFor(observations);
  return (
    coverage.scalpSelections.length === SCALP_SELECTION_ORDER.length &&
    coverage.facialHairSelections.length ===
      FACIAL_HAIR_SELECTION_ORDER.length &&
    coverage.motions.length === MOTION_ORDER.length &&
    coverage.views.length === VIEW_ORDER.length &&
    coverage.surfacePresets.length === PRESET_ORDER.length &&
    coverage.simultaneousNonDefaultPair &&
    coverage.referenceTwinIsolation
  );
}

export interface CharacterCustomizationConceptVerdict {
  readonly warning: 'NON-PRODUCTION CONCEPT EVIDENCE';
  readonly body: typeof CHARACTER_CUSTOMIZATION_BODY;
  readonly coverage: CharacterCustomizationCoverage;
  readonly positiveObservationCount: number;
}

export function customizationConceptVerdict(
  observations: readonly CharacterCustomizationRenderObservation[]
): CharacterCustomizationConceptVerdict {
  if (!canRecordCustomizationVerdict(observations)) {
    throw new Error('character customization concept coverage is incomplete');
  }
  return {
    warning: 'NON-PRODUCTION CONCEPT EVIDENCE',
    body: CHARACTER_CUSTOMIZATION_BODY,
    coverage: coverageFor(observations),
    positiveObservationCount: observations.filter(
      isPositiveCustomizationObservation
    ).length,
  };
}
