import { resolvePlayerCharacterModel } from '@/components/hex-grid/classCharacterModels';
import { CHARACTER_CUSTOMIZATION_CATALOG } from '@/generated/characterCustomizationCatalog';

function normalizeRef(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export function resolveCharacterCustomizationModel(
  raceRefId?: string,
  classRefId?: string
) {
  const raceRef = normalizeRef(raceRefId);
  const classRef = normalizeRef(classRefId);
  if (
    !raceRef ||
    !classRef ||
    !Object.hasOwn(CHARACTER_CUSTOMIZATION_CATALOG.profiles, raceRef)
  ) {
    return undefined;
  }
  const profile =
    CHARACTER_CUSTOMIZATION_CATALOG.profiles[
      raceRef as keyof typeof CHARACTER_CUSTOMIZATION_CATALOG.profiles
    ];
  if (!Object.hasOwn(profile.bodies, classRef)) return undefined;
  const resolution = resolvePlayerCharacterModel(raceRef, classRef, false);
  return resolution?.customizationProfileRef === profile.profileRef
    ? resolution
    : undefined;
}
