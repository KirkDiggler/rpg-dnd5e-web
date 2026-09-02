import type { SkinnedAccessoryPresentation } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import { DWARF_CUSTOMIZATION_CATALOG } from '@/generated/dwarfCustomizationCatalog';
import type { HairCustomization } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';

export type HairSlotSelection =
  | { readonly kind: 'default' }
  | { readonly kind: 'none' }
  | { readonly kind: 'style'; readonly styleRef: string };

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
  readonly profileRef: string;
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

interface ResolvableStyle {
  readonly styleRef: string;
  readonly url: string;
}

const STARTER_CLASSES = new Set(['barbarian', 'fighter', 'monk', 'rogue']);
const SCALP_BY_REF: ReadonlyMap<string, ResolvableStyle> = new Map(
  DWARF_CUSTOMIZATION_CATALOG.slots.scalp.options.map((option) => [
    option.styleRef,
    option,
  ])
);
const FACIAL_HAIR_BY_REF: ReadonlyMap<string, ResolvableStyle> = new Map(
  DWARF_CUSTOMIZATION_CATALOG.slots.facialHair.options.map((option) => [
    option.styleRef,
    option,
  ])
);

function normalizeRef(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
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

  const defaultStyleRef =
    slot === 'scalp'
      ? DWARF_CUSTOMIZATION_CATALOG.defaults.scalpStyleRef
      : DWARF_CUSTOMIZATION_CATALOG.defaults.facialHairStyleRef;
  const requestedStyleRef =
    selection.kind === 'default' ? defaultStyleRef : selection.styleRef;
  const options = slot === 'scalp' ? SCALP_BY_REF : FACIAL_HAIR_BY_REF;
  const option = options.get(requestedStyleRef);
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
  if (normalizedRace !== DWARF_CUSTOMIZATION_CATALOG.raceRef) {
    return {
      profileRef: DWARF_CUSTOMIZATION_CATALOG.profileRef,
      accessories: [],
      diagnostics: [{ code: 'unsupported-race', requestedRef: normalizedRace }],
    };
  }
  const normalizedClass = normalizeRef(classRefId);
  if (!normalizedClass || !STARTER_CLASSES.has(normalizedClass)) {
    return {
      profileRef: DWARF_CUSTOMIZATION_CATALOG.profileRef,
      accessories: [],
      diagnostics: [
        { code: 'unsupported-class', requestedRef: normalizedClass },
      ],
    };
  }

  const hair = customization?.hair;
  const requestedColor = hair?.colorSrgb;
  const colorSrgb =
    requestedColor === undefined ||
    (Number.isInteger(requestedColor) &&
      requestedColor >= 0 &&
      requestedColor <= 0xffffff)
      ? (requestedColor ?? DWARF_CUSTOMIZATION_CATALOG.defaults.colorSrgb)
      : DWARF_CUSTOMIZATION_CATALOG.defaults.colorSrgb;
  if (requestedColor !== undefined && colorSrgb !== requestedColor) {
    diagnostics.push({
      code: 'invalid-color-srgb',
      requestedValue: requestedColor,
    });
  }

  const requestedRoughness = hair?.roughness;
  const roughness =
    requestedRoughness === undefined ||
    (Number.isFinite(requestedRoughness) &&
      requestedRoughness >= 0 &&
      requestedRoughness <= 1)
      ? (requestedRoughness ?? DWARF_CUSTOMIZATION_CATALOG.defaults.roughness)
      : DWARF_CUSTOMIZATION_CATALOG.defaults.roughness;
  if (requestedRoughness !== undefined && roughness !== requestedRoughness) {
    diagnostics.push({
      code: 'invalid-roughness',
      requestedValue: requestedRoughness,
    });
  }

  const treatment = {
    baseColorSrgb: rgb24ToHex(colorSrgb),
    roughness,
    metalness: DWARF_CUSTOMIZATION_CATALOG.defaults.metalness,
  } as const;
  const accessories = [
    resolveSlot(
      'scalp',
      normalizeSelection(hair?.scalp),
      treatment,
      diagnostics
    ),
    resolveSlot(
      'facial-hair',
      normalizeSelection(hair?.facialHair),
      treatment,
      diagnostics
    ),
  ].filter(
    (value): value is SkinnedAccessoryPresentation => value !== undefined
  );

  return {
    profileRef: DWARF_CUSTOMIZATION_CATALOG.profileRef,
    accessories,
    diagnostics,
  };
}
