import {
  CHARACTER_CUSTOMIZATION_CATALOG,
  type OutfitTreatment,
} from '@/generated/characterCustomizationCatalog';
import type {
  HairCustomization,
  OutfitCustomization,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';

/** Both Character.appearance and PublicMemberInfo.customization satisfy this shape. */
export interface OutfitCustomizationContainer {
  readonly outfit?: OutfitCustomization;
}

/** The owner Appearance and peer PublicMemberInfo.customization shared shape. */
export interface CharacterCustomizationContainer extends OutfitCustomizationContainer {
  readonly hair?: HairCustomization;
}

export interface OutfitPresentation {
  readonly classRef: OutfitTreatment['classRef'];
  /** Stable treatment identity: intentionally excludes mutable color values. */
  readonly profileKey: string;
  readonly maskUrl: string;
  readonly maskSha256: string;
  readonly meshNames: readonly string[];
  readonly primaryColor: `#${string}` | undefined;
  readonly secondaryColor: `#${string}` | undefined;
  readonly usePrimary: boolean;
  readonly useSecondary: boolean;
}

export type OutfitPresentationDiagnostic =
  | {
      readonly code: 'unsupported-class';
      readonly requestedRef: string | undefined;
    }
  | {
      readonly code: 'invalid-color-srgb';
      readonly channel: 'primary' | 'secondary';
      readonly requestedValue: number;
    };

export type OutfitPresentationResolution =
  | OutfitPresentation
  | {
      readonly presentation: undefined;
      readonly diagnostic: OutfitPresentationDiagnostic;
    };

export interface ResolveOutfitPresentationInput {
  readonly classRefId?: string;
  readonly customization?: OutfitCustomizationContainer;
}

function normalizeRef(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return normalized || undefined;
}

function rgb24ToHex(value: number): `#${string}` {
  return `#${value.toString(16).padStart(6, '0').toUpperCase()}`;
}

function validRgb24(value: number | undefined): value is number {
  return (
    value !== undefined &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffff
  );
}

export function resolveOutfitPresentation({
  classRefId,
  customization,
}: ResolveOutfitPresentationInput): OutfitPresentationResolution {
  const requestedRef = normalizeRef(classRefId);
  if (
    !requestedRef ||
    !Object.hasOwn(CHARACTER_CUSTOMIZATION_CATALOG.outfits, requestedRef)
  ) {
    return {
      presentation: undefined,
      diagnostic: { code: 'unsupported-class', requestedRef },
    };
  }
  const treatment =
    CHARACTER_CUSTOMIZATION_CATALOG.outfits[
      requestedRef as keyof typeof CHARACTER_CUSTOMIZATION_CATALOG.outfits
    ];
  const outfit = customization?.outfit;
  const primary = outfit?.primaryColorSrgb;
  if (primary !== undefined && !validRgb24(primary)) {
    return {
      presentation: undefined,
      diagnostic: {
        code: 'invalid-color-srgb',
        channel: 'primary',
        requestedValue: primary,
      },
    };
  }
  const secondary = outfit?.secondaryColorSrgb;
  if (secondary !== undefined && !validRgb24(secondary)) {
    return {
      presentation: undefined,
      diagnostic: {
        code: 'invalid-color-srgb',
        channel: 'secondary',
        requestedValue: secondary,
      },
    };
  }
  return {
    classRef: treatment.classRef,
    profileKey: `${treatment.classRef}:${treatment.outfit}`,
    maskUrl: treatment.maskUrl,
    maskSha256: treatment.maskSha256,
    meshNames: treatment.meshNames,
    primaryColor: primary === undefined ? undefined : rgb24ToHex(primary),
    secondaryColor: secondary === undefined ? undefined : rgb24ToHex(secondary),
    usePrimary: primary !== undefined,
    useSecondary: secondary !== undefined,
  };
}

export function outfitDefaultColors(classRefId?: string) {
  const requestedRef = normalizeRef(classRefId);
  if (
    !requestedRef ||
    !Object.hasOwn(CHARACTER_CUSTOMIZATION_CATALOG.outfits, requestedRef)
  ) {
    return undefined;
  }
  const treatment =
    CHARACTER_CUSTOMIZATION_CATALOG.outfits[
      requestedRef as keyof typeof CHARACTER_CUSTOMIZATION_CATALOG.outfits
    ];
  return {
    primaryColor: rgb24ToHex(treatment.defaultPrimaryColorSrgb),
    secondaryColor: rgb24ToHex(treatment.defaultSecondaryColorSrgb),
  } as const;
}
