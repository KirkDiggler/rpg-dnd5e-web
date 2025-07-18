import type {
  CharacterDraft,
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { ReactNode, useCallback, useState } from 'react';
import {
  CharacterDraftContext,
  type CharacterDraftState,
} from './CharacterDraftContextDef';

export function CharacterDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
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

      // Add base languages
      if (race.languages) {
        race.languages.forEach((l) => languages.add(l));
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
      // Update draft
      setDraft(
        (prev) =>
          ({
            ...prev,
            race: race || undefined,
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
    setDraft(
      (prev) =>
        ({
          ...prev,
          class: classInfo || undefined,
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

      // Recalculate proficiencies/languages
      setRace(draft?.race || null);
    },
    [draft?.race, setRace]
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
    setDraft(
      (prev) =>
        ({
          ...prev,
          abilityScores: scores,
        }) as CharacterDraft
    );
  }, []);

  const reset = useCallback(() => {
    setDraft(null);
    setAllProficiencies(new Set());
    setAllLanguages(new Set());
    setRaceChoices({});
    setClassChoices({});
  }, []);

  const value: CharacterDraftState = {
    draft,
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
