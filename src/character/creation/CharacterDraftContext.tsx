import { create } from '@bufbuild/protobuf';
import type {
  CharacterDraft,
  Choice,
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { AbilityScoresSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Language,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import {
  CharacterDraftContext,
  type CharacterDraftState,
} from './CharacterDraftContextDef';

// Helper to convert RaceInfo name to Race enum
function getRaceEnum(raceName: string): Race {
  const raceMap: Record<string, Race> = {
    Human: Race.HUMAN,
    Elf: Race.ELF,
    Dwarf: Race.DWARF,
    Halfling: Race.HALFLING,
    Dragonborn: Race.DRAGONBORN,
    Gnome: Race.GNOME,
    'Half-Elf': Race.HALF_ELF,
    'Half-Orc': Race.HALF_ORC,
    Tiefling: Race.TIEFLING,
  };
  return raceMap[raceName] || Race.UNSPECIFIED;
}

// Helper to convert ClassInfo name to Class enum
function getClassEnum(className: string): Class {
  const classMap: Record<string, Class> = {
    Barbarian: Class.BARBARIAN,
    Bard: Class.BARD,
    Cleric: Class.CLERIC,
    Druid: Class.DRUID,
    Fighter: Class.FIGHTER,
    Monk: Class.MONK,
    Paladin: Class.PALADIN,
    Ranger: Class.RANGER,
    Rogue: Class.ROGUE,
    Sorcerer: Class.SORCERER,
    Warlock: Class.WARLOCK,
    Wizard: Class.WIZARD,
  };
  return classMap[className] || Class.UNSPECIFIED;
}

export function CharacterDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [currentRaceInfo, setCurrentRaceInfo] = useState<RaceInfo | null>(null);
  const [currentClassInfo, setCurrentClassInfo] = useState<ClassInfo | null>(
    null
  );
  const [allProficiencies, setAllProficiencies] = useState<Set<string>>(
    new Set()
  );
  const [allLanguages, setAllLanguages] = useState<Set<string>>(new Set());
  const [raceChoices, setRaceChoices] = useState<Record<string, string[]>>({});
  const [classChoices, setClassChoices] = useState<Record<string, string[]>>(
    {}
  );

  // Helper to collect all proficiencies from a race
  const collectRaceProficiencies = useCallback(
    (race: RaceInfo | null): Set<string> => {
      const proficiencies = new Set<string>();
      if (!race) return proficiencies;

      // Add base proficiencies - these come automatically with the race
      if (race.proficiencies && Array.isArray(race.proficiencies)) {
        race.proficiencies.forEach((p) => {
          // Normalize the proficiency index
          // API might return "skill-intimidation" or "Skill: Intimidation"
          const normalized = p
            .toLowerCase()
            .replace(/^skill[:-]\s*/i, 'skill:');
          proficiencies.add(normalized);
          proficiencies.add(p); // Also add original format
        });
      }

      // Add chosen proficiencies from race choices
      Object.values(raceChoices)
        .flat()
        .forEach((p) => {
          proficiencies.add(p);
          // Also add normalized version
          const normalized = p
            .toLowerCase()
            .replace(/^skill[:-]\s*/i, 'skill:');
          proficiencies.add(normalized);
        });

      return proficiencies;
    },
    [raceChoices]
  );

  // Helper to collect all languages from a race
  const collectRaceLanguages = useCallback(
    (race: RaceInfo | null): Set<string> => {
      const languages = new Set<string>();
      if (!race) return languages;

      // Add base languages (these are now Language enums from RaceInfo)
      if (race.languages) {
        race.languages.forEach((l) => {
          // Convert enum value to string representation
          const languageName = Object.entries(Language).find(
            ([, value]) => value === l
          )?.[0];
          if (languageName) {
            languages.add(languageName.replace(/_/g, ' '));
          }
        });
      }

      // Add chosen languages
      Object.values(raceChoices)
        .flat()
        .forEach((l) => {
          if (l.startsWith('language:')) {
            languages.add(l);
          }
        });

      return languages;
    },
    [raceChoices]
  );

  const setRace = useCallback(
    (race: RaceInfo | null) => {
      // Store the full RaceInfo
      setCurrentRaceInfo(race);

      // Update draft with enum value
      setDraft(
        (prev) =>
          ({
            ...prev,
            race: race ? getRaceEnum(race.name) : Race.UNSPECIFIED,
          }) as CharacterDraft
      );

      // Recalculate all proficiencies and languages
      const raceProficiencies = collectRaceProficiencies(race);
      const raceLanguages = collectRaceLanguages(race);

      setAllProficiencies(new Set([...raceProficiencies]));
      setAllLanguages(new Set([...raceLanguages]));
    },
    [collectRaceProficiencies, collectRaceLanguages]
  );

  const setClass = useCallback((classInfo: ClassInfo | null) => {
    // Store the full ClassInfo
    setCurrentClassInfo(classInfo);

    setDraft(
      (prev) =>
        ({
          ...prev,
          class: classInfo ? getClassEnum(classInfo.name) : Class.UNSPECIFIED,
        }) as CharacterDraft
    );

    // TODO: Add class proficiencies when we understand the structure
  }, []);

  const hasProficiency = useCallback(
    (proficiencyIndex: string): boolean => {
      return allProficiencies.has(proficiencyIndex);
    },
    [allProficiencies]
  );

  const hasLanguage = useCallback(
    (languageIndex: string): boolean => {
      return allLanguages.has(languageIndex);
    },
    [allLanguages]
  );

  const getAvailableChoices = useCallback((choices: Choice[]) => {
    // This will filter out choices that are already selected
    // We'll implement this once we understand the choice structure better
    return choices;
  }, []);

  const addRaceChoice = useCallback(
    (choiceKey: string, selection: string[]) => {
      setRaceChoices((prev) => ({
        ...prev,
        [choiceKey]: selection,
      }));

      // Recalculate proficiencies/languages using stored RaceInfo
      if (currentRaceInfo) {
        const raceProficiencies = collectRaceProficiencies(currentRaceInfo);
        const raceLanguages = collectRaceLanguages(currentRaceInfo);
        setAllProficiencies(new Set([...raceProficiencies]));
        setAllLanguages(new Set([...raceLanguages]));
      }
    },
    [currentRaceInfo, collectRaceProficiencies, collectRaceLanguages]
  );

  const addClassChoice = useCallback(
    (choiceKey: string, selection: string[]) => {
      setClassChoices((prev) => ({
        ...prev,
        [choiceKey]: selection,
      }));

      // TODO: Recalculate when we understand class proficiencies
    },
    []
  );

  const setName = useCallback((name: string) => {
    setDraft(
      (prev) =>
        ({
          ...prev,
          name,
        }) as CharacterDraft
    );
  }, []);

  const setAbilityScores = useCallback((scores: Record<string, number>) => {
    // Create AbilityScores message from the scores object
    const abilityScores = create(AbilityScoresSchema, {
      strength: scores.strength || 10,
      dexterity: scores.dexterity || 10,
      constitution: scores.constitution || 10,
      intelligence: scores.intelligence || 10,
      wisdom: scores.wisdom || 10,
      charisma: scores.charisma || 10,
    });

    setDraft(
      (prev) =>
        ({
          ...prev,
          abilityScores,
        }) as CharacterDraft
    );
  }, []);

  const reset = useCallback(() => {
    setDraft(null);
    setCurrentRaceInfo(null);
    setCurrentClassInfo(null);
    setAllProficiencies(new Set());
    setAllLanguages(new Set());
    setRaceChoices({});
    setClassChoices({});
  }, []);

  const value: CharacterDraftState = {
    draft,
    raceInfo: currentRaceInfo,
    classInfo: currentClassInfo,
    allProficiencies,
    allLanguages,
    raceChoices,
    classChoices,
    setRace,
    setClass,
    setName,
    setAbilityScores,
    addRaceChoice,
    addClassChoice,
    getAvailableChoices,
    hasProficiency,
    hasLanguage,
    reset,
  };

  return (
    <CharacterDraftContext.Provider value={value}>
      {children}
    </CharacterDraftContext.Provider>
  );
}
