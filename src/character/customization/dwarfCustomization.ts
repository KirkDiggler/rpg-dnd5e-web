import { resolvePlayerCharacterModel } from '@/components/hex-grid/classCharacterModels';
import { DWARF_CUSTOMIZATION_CATALOG } from '@/generated/dwarfCustomizationCatalog';

export function resolveDwarfCustomizationModel(
  raceRefId?: string,
  classRefId?: string
) {
  const resolution = resolvePlayerCharacterModel(raceRefId, classRefId, false);
  return resolution?.customizationProfileRef ===
    DWARF_CUSTOMIZATION_CATALOG.profileRef
    ? resolution
    : undefined;
}
