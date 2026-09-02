import { DWARF_CUSTOMIZATION_CATALOG } from '@/generated/dwarfCustomizationCatalog';
import type {
  HairCustomization,
  StyleSelection,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import { rgb24ToHex } from './hairCustomization';

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
  slot: CatalogSlot,
  selection: StyleSelection | undefined
): string {
  const slotCatalog = DWARF_CUSTOMIZATION_CATALOG.slots[slot];
  if (!selection) {
    const defaultOption = slotCatalog.options.find(
      (option) => option.styleRef === slotCatalog.defaultStyleRef
    );
    return `Default (${defaultOption?.label ?? slotCatalog.defaultStyleRef})`;
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
  hair: HairCustomization | undefined
): HairSummary {
  const colorIsDefault = hair?.colorSrgb === undefined;
  const roughnessIsDefault = hair?.roughness === undefined;
  return {
    scalp: selectionLabel('scalp', hair?.scalp),
    facialHair: selectionLabel('facialHair', hair?.facialHair),
    colorHex: rgb24ToHex(
      hair?.colorSrgb ?? DWARF_CUSTOMIZATION_CATALOG.surface.defaultColorSrgb
    ),
    roughness:
      hair?.roughness ?? DWARF_CUSTOMIZATION_CATALOG.surface.defaultRoughness,
    colorIsDefault,
    roughnessIsDefault,
  };
}
