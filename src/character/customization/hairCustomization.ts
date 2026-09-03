import type { SkinnedAccessoryPresentation } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import {
  CHARACTER_CUSTOMIZATION_CATALOG,
  type CharacterCustomizationProfile,
  type CustomizationRaceRef,
} from '@/generated/characterCustomizationCatalog';
import type { HairCustomization } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';

export type HairSlotSelection =
  | { readonly kind: 'default' }
  | { readonly kind: 'none' }
  | { readonly kind: 'style'; readonly styleRef: string }
  | { readonly kind: 'invalid' };

export type HairResolutionDiagnostic =
  | {
      readonly code: 'unsupported-race' | 'unsupported-class';
      readonly requestedRef: string | undefined;
    }
  | {
      readonly code: 'unknown-style-ref';
      readonly slot: SkinnedAccessoryPresentation['slot'];
      readonly requestedStyleRef: string;
    }
  | {
      readonly code: 'invalid-selection';
      readonly slot: SkinnedAccessoryPresentation['slot'];
    }
  | {
      readonly code: 'invalid-color-srgb' | 'invalid-roughness';
      readonly requestedValue: number;
    };

export interface ResolvedHairPresentation {
  readonly profileRef: string | undefined;
  readonly accessories: readonly SkinnedAccessoryPresentation[];
  readonly diagnostics: readonly HairResolutionDiagnostic[];
}

/** Both character Appearance and session Customization satisfy this shape. */
export interface HairCustomizationContainer {
  readonly hair?: HairCustomization;
}

export interface ResolveHairPresentationInput {
  readonly raceRefId?: string;
  readonly classRefId?: string;
  readonly customization?: HairCustomizationContainer;
}

function normalizeRef(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return normalized || undefined;
}

function profileForRace(
  raceRefId: string | undefined
): CharacterCustomizationProfile | undefined {
  if (
    !raceRefId ||
    !Object.hasOwn(CHARACTER_CUSTOMIZATION_CATALOG.profiles, raceRefId)
  ) {
    return undefined;
  }
  return CHARACTER_CUSTOMIZATION_CATALOG.profiles[
    raceRefId as CustomizationRaceRef
  ];
}

const SHARED_SURFACE = CHARACTER_CUSTOMIZATION_CATALOG.profiles.human.surface;

export function resolveHairColorSrgb(value: number | undefined): number {
  return value === undefined ||
    (Number.isInteger(value) && value >= 0 && value <= 0xffffff)
    ? (value ?? SHARED_SURFACE.defaultColorSrgb)
    : SHARED_SURFACE.defaultColorSrgb;
}

export function resolveHairRoughness(value: number | undefined): number {
  return value === undefined ||
    (Number.isFinite(value) && value >= 0 && value <= 1)
    ? (value ?? SHARED_SURFACE.defaultRoughness)
    : SHARED_SURFACE.defaultRoughness;
}

export function rgb24ToHex(value: number): `#${string}` {
  return `#${value.toString(16).padStart(6, '0').toUpperCase()}`;
}

function normalizeSelection(
  selection: HairCustomization['scalp']
): HairSlotSelection | undefined {
  if (selection === undefined) return { kind: 'default' };
  switch (selection.selection.case) {
    case 'styleRef':
      return { kind: 'style', styleRef: selection.selection.value };
    case 'none':
      return { kind: 'none' };
    default:
      return undefined;
  }
}

function resolveSlot(
  profile: CharacterCustomizationProfile,
  slot: SkinnedAccessoryPresentation['slot'],
  selection: HairSlotSelection | undefined,
  treatment: SkinnedAccessoryPresentation['treatment'],
  diagnostics: HairResolutionDiagnostic[]
): SkinnedAccessoryPresentation | undefined {
  if (selection === undefined) {
    diagnostics.push({ code: 'invalid-selection', slot });
    return undefined;
  }
  if (selection.kind === 'none') return undefined;
  if (selection.kind === 'invalid') {
    diagnostics.push({ code: 'invalid-selection', slot });
    return undefined;
  }

  const catalog =
    slot === 'scalp' ? profile.slots.scalp : profile.slots.facialHair;
  const defaultSelection = catalog.defaultSelection;
  let requestedStyleRef: string;
  if (selection.kind === 'default') {
    if (defaultSelection.kind === 'none') return undefined;
    requestedStyleRef = defaultSelection.styleRef;
  } else {
    requestedStyleRef = selection.styleRef;
  }
  const option = catalog.options.find(
    (candidate) => candidate.styleRef === requestedStyleRef
  );
  if (!option) {
    diagnostics.push({
      code: 'unknown-style-ref',
      slot,
      requestedStyleRef,
    });
    return undefined;
  }
  return {
    slot,
    styleRef: option.styleRef,
    url: option.url,
    treatment,
  };
}

export function resolveHairPresentation({
  raceRefId,
  classRefId,
  customization,
}: ResolveHairPresentationInput): ResolvedHairPresentation {
  const diagnostics: HairResolutionDiagnostic[] = [];
  const normalizedRace = normalizeRef(raceRefId);
  const profile = profileForRace(normalizedRace);
  if (!profile) {
    return {
      profileRef: undefined,
      accessories: [],
      diagnostics: [{ code: 'unsupported-race', requestedRef: normalizedRace }],
    };
  }
  const normalizedClass = normalizeRef(classRefId);
  if (!normalizedClass || !Object.hasOwn(profile.bodies, normalizedClass)) {
    return {
      profileRef: profile.profileRef,
      accessories: [],
      diagnostics: [
        { code: 'unsupported-class', requestedRef: normalizedClass },
      ],
    };
  }

  const hair = customization?.hair;
  const requestedColor = hair?.colorSrgb;
  const colorSrgb = resolveHairColorSrgb(requestedColor);
  if (requestedColor !== undefined && colorSrgb !== requestedColor) {
    diagnostics.push({
      code: 'invalid-color-srgb',
      requestedValue: requestedColor,
    });
  }

  const requestedRoughness = hair?.roughness;
  const roughness = resolveHairRoughness(requestedRoughness);
  if (requestedRoughness !== undefined && roughness !== requestedRoughness) {
    diagnostics.push({
      code: 'invalid-roughness',
      requestedValue: requestedRoughness,
    });
  }

  const treatment = {
    baseColorSrgb: rgb24ToHex(colorSrgb),
    roughness,
    metalness: profile.defaults.metalness,
  } as const;
  const accessories = [
    resolveSlot(
      profile,
      'scalp',
      normalizeSelection(hair?.scalp),
      treatment,
      diagnostics
    ),
    resolveSlot(
      profile,
      'facial-hair',
      normalizeSelection(hair?.facialHair),
      treatment,
      diagnostics
    ),
  ].filter(
    (value): value is SkinnedAccessoryPresentation => value !== undefined
  );

  return {
    profileRef: profile.profileRef,
    accessories,
    diagnostics,
  };
}
