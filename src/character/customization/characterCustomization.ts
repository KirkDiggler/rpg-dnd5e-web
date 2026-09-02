import { resolvePlayerCharacterModel } from '@/components/hex-grid/classCharacterModels';
import { CHARACTER_CUSTOMIZATION_CATALOG } from '@/generated/characterCustomizationCatalog';

const RACE_LABELS = {
  human: 'Human',
  elf: 'Elf',
  dwarf: 'Dwarf',
  'half-elf': 'Half-Elf',
  tiefling: 'Tiefling',
  halfling: 'Halfling',
  gnome: 'Gnome',
  'half-orc': 'Half-Orc',
} as const;

function normalizeRef(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export function getCharacterCustomizationProfile(raceRefId?: string) {
  const raceRef = normalizeRef(raceRefId);
  if (
    !raceRef ||
    !Object.hasOwn(CHARACTER_CUSTOMIZATION_CATALOG.profiles, raceRef)
  ) {
    return undefined;
  }
  return CHARACTER_CUSTOMIZATION_CATALOG.profiles[
    raceRef as keyof typeof CHARACTER_CUSTOMIZATION_CATALOG.profiles
  ];
}

export function characterCustomizationRaceLabel(raceRefId?: string) {
  const profile = getCharacterCustomizationProfile(raceRefId);
  return profile ? RACE_LABELS[profile.raceRef] : undefined;
}

export function resolveCharacterCustomizationModel(
  raceRefId?: string,
  classRefId?: string
) {
  const raceRef = normalizeRef(raceRefId);
  const classRef = normalizeRef(classRefId);
  if (!raceRef || !classRef) return undefined;
  const profile = getCharacterCustomizationProfile(raceRef);
  if (!profile) return undefined;
  if (!Object.hasOwn(profile.bodies, classRef)) return undefined;
  const resolution = resolvePlayerCharacterModel(raceRef, classRef, false);
  return resolution?.customizationProfileRef === profile.profileRef
    ? resolution
    : undefined;
}
