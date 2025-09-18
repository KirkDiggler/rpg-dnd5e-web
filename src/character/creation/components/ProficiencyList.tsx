import type {
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Ability,
  ArmorProficiencyCategory,
  Language,
  WeaponProficiencyCategory,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import {
  getArmorProficiencyDisplay,
  getToolProficiencyDisplay,
  getWeaponProficiencyDisplay,
} from '../../../utils/enumDisplay';

interface ProficiencyListProps {
  selectedRace: RaceInfo | null;
  selectedClass: ClassInfo | null;
  raceChoices: Record<string, string[]>;
  classChoices: Record<string, string[]>;
}

export function ProficiencyList({
  selectedRace,
  selectedClass,
  raceChoices,
  classChoices,
}: ProficiencyListProps) {
  // Collect all proficiencies with their sources
  const proficiencyGroups: Record<string, { source: string; items: string[] }> =
    {};

  // Add race proficiencies
  if (selectedRace) {
    // Base race proficiencies - these now come through choices only
    // RaceInfo no longer has a proficiencies field

    // Race choice proficiencies
    const raceChoiceProfs = Object.values(raceChoices)
      .flat()
      .filter((p) => !p.startsWith('language:'));
    if (raceChoiceProfs.length > 0) {
      proficiencyGroups['race-choice'] = {
        source: `${selectedRace.name} (Chosen)`,
        items: raceChoiceProfs,
      };
    }
  }

  // Add class proficiencies
  if (selectedClass) {
    // Base class proficiencies
    const classProfs: string[] = [];

    // Armor proficiencies
    if (selectedClass.armorProficiencyCategories?.length) {
      classProfs.push(
        ...selectedClass.armorProficiencyCategories.map(
          (p: ArmorProficiencyCategory) =>
            `Armor: ${getArmorProficiencyDisplay(String(p))}`
        )
      );
    }

    // Weapon proficiencies
    if (selectedClass.weaponProficiencyCategories?.length) {
      classProfs.push(
        ...selectedClass.weaponProficiencyCategories.map(
          (p: WeaponProficiencyCategory) =>
            `Weapon: ${getWeaponProficiencyDisplay(String(p))}`
        )
      );
    }

    // Tool proficiencies
    if (selectedClass.toolProficiencies?.length) {
      classProfs.push(
        ...selectedClass.toolProficiencies.map(
          (p) => `Tool: ${getToolProficiencyDisplay(p)}`
        )
      );
    }

    // Saving throw proficiencies
    if (selectedClass.savingThrowProficiencies?.length) {
      classProfs.push(
        ...selectedClass.savingThrowProficiencies.map(
          (p: Ability) => `Save: ${String(p)}`
        )
      );
    }

    if (classProfs.length > 0) {
      proficiencyGroups['class-base'] = {
        source: `${selectedClass.name} (Base)`,
        items: classProfs,
      };
    }

    // Class choice proficiencies
    const classChoiceProfs = Object.values(classChoices).flat();
    if (classChoiceProfs.length > 0) {
      proficiencyGroups['class-choice'] = {
        source: `${selectedClass.name} (Chosen)`,
        items: classChoiceProfs,
      };
    }
  }

  // Collect all languages
  const languageGroups: Record<string, { source: string; items: string[] }> =
    {};

  if (selectedRace) {
    // Base languages
    if (selectedRace.languages && selectedRace.languages.length > 0) {
      // Convert Language enums to strings
      const languageStrings = selectedRace.languages.map((lang) => {
        // Find the enum name from the value
        const languageName = Object.entries(Language).find(
          ([, value]) => value === lang
        )?.[0];
        // Convert ENUM_NAME to readable format (e.g., DEEP_SPEECH -> Deep Speech)
        return languageName
          ? languageName
              .split('_')
              .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
              .join(' ')
          : 'Unknown';
      });

      languageGroups['race-base'] = {
        source: `${selectedRace.name} (Base)`,
        items: languageStrings,
      };
    }

    // Chosen languages
    const chosenLangs = Object.values(raceChoices)
      .flat()
      .filter((l) => l.startsWith('language:'))
      .map((l) => l.replace('language:', ''));
    if (chosenLangs.length > 0) {
      languageGroups['race-choice'] = {
        source: `${selectedRace.name} (Chosen)`,
        items: chosenLangs,
      };
    }
  }

  if (
    Object.keys(proficiencyGroups).length === 0 &&
    Object.keys(languageGroups).length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Proficiencies Section */}
      {Object.keys(proficiencyGroups).length > 0 && (
        <div>
          <h4
            className="text-sm font-bold mb-3"
            style={{ color: 'var(--text-primary)' }}
          >
            Proficiencies
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(proficiencyGroups).map(([key, group]) => (
              <div
                key={key}
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--border-primary)',
                }}
              >
                <h5
                  className="text-xs font-semibold mb-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {group.source}
                </h5>
                <ul className="space-y-1">
                  {group.items.map((item, idx) => (
                    <li
                      key={`${key}-${idx}`}
                      className="text-sm flex items-center gap-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        ▸
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Languages Section */}
      {Object.keys(languageGroups).length > 0 && (
        <div>
          <h4
            className="text-sm font-bold mb-3"
            style={{ color: 'var(--text-primary)' }}
          >
            Languages
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(languageGroups).map(([key, group]) => (
              <div
                key={key}
                className="p-3 rounded-lg border"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--border-primary)',
                }}
              >
                <h5
                  className="text-xs font-semibold mb-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {group.source}
                </h5>
                <ul className="space-y-1">
                  {group.items.map((item, idx) => (
                    <li
                      key={`${key}-${idx}`}
                      className="text-sm flex items-center gap-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        ▸
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
