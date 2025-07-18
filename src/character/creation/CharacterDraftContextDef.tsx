import type {
  CharacterDraft,
  Choice,
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { createContext } from 'react';

export interface CharacterDraftState {
  draft: CharacterDraft | null;

  // Track all proficiencies from various sources
  allProficiencies: Set<string>;

  // Track all languages from various sources
  allLanguages: Set<string>;

  // Track choices made for each source
  raceChoices: Record<string, string[]>;
  classChoices: Record<string, string[]>;

  // Methods
  setRace: (race: RaceInfo | null) => void;
  setClass: (classInfo: ClassInfo | null) => void;
  setName: (name: string) => void;
  setAbilityScores: (scores: Record<string, number>) => void;

  // Choice management
  addRaceChoice: (choiceKey: string, selection: string[]) => void;
  addClassChoice: (choiceKey: string, selection: string[]) => void;

  // Get available choices (filtering out already selected)
  getAvailableChoices: (
    choices: Choice[],
    existingSelections: Set<string>
  ) => Choice[];

  // Check if a proficiency is already gained
  hasProficiency: (proficiencyIndex: string) => boolean;
  hasLanguage: (languageIndex: string) => boolean;

  // Reset
  reset: () => void;
}

export const CharacterDraftContext = createContext<CharacterDraftState | null>(
  null
);
