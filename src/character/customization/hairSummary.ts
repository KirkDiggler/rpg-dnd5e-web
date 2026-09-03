import { getCharacterCustomizationProfile } from '@/character/customization/characterCustomization';
import type { CharacterCustomizationProfile } from '@/generated/characterCustomizationCatalog';
import type {
  HairCustomization,
  StyleSelection,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  resolveHairColorSrgb,
  resolveHairRoughness,
  rgb24ToHex,
} from './hairCustomization';

export interface HairSummary {
  scalp: string;
  facialHair: string;
  colorHex: `#${string}`;
  roughness: number;
  colorIsDefault: boolean;
  roughnessIsDefault: boolean;
}

type CatalogSlot = 'scalp' | 'facialHair';

function selectionLabel(
  profile: CharacterCustomizationProfile,
  slot: CatalogSlot,
  selection: StyleSelection | undefined
): string {
  const slotCatalog = profile.slots[slot];
  if (!selection) {
    const defaultSelection = slotCatalog.defaultSelection;
    if (defaultSelection.kind === 'none') return 'Default (None)';
    const defaultOption = slotCatalog.options.find(
      (option) => option.styleRef === defaultSelection.styleRef
    );
    return `Default (${defaultOption?.label ?? defaultSelection.styleRef})`;
  }
  if (selection.selection.case === 'none') return 'None';
  if (selection.selection.case === 'styleRef') {
    const option = slotCatalog.options.find(
      (candidate) => candidate.styleRef === selection.selection.value
    );
    return option?.label ?? selection.selection.value;
  }
  return 'Unavailable';
}

export function summarizeHair(
  hair: HairCustomization | undefined,
  raceRefId: string | undefined
): HairSummary | undefined {
  const profile = getCharacterCustomizationProfile(raceRefId);
  if (!profile) return undefined;
  const colorSrgb = resolveHairColorSrgb(hair?.colorSrgb);
  const roughness = resolveHairRoughness(hair?.roughness);
  const colorIsDefault =
    hair?.colorSrgb === undefined || colorSrgb !== hair.colorSrgb;
  const roughnessIsDefault =
    hair?.roughness === undefined || roughness !== hair.roughness;
  return {
    scalp: selectionLabel(profile, 'scalp', hair?.scalp),
    facialHair: selectionLabel(profile, 'facialHair', hair?.facialHair),
    colorHex: rgb24ToHex(colorSrgb),
    roughness,
    colorIsDefault,
    roughnessIsDefault,
  };
}
