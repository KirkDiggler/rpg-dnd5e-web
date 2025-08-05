import type {
  CharacterDraft,
  Choice,
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { createContext } from 'react';

export interface CharacterDraftState {
  draftId: string | null;
  draft: CharacterDraft | null;
  raceInfo: RaceInfo | null;
  classInfo: ClassInfo | null;

  // Track all proficiencies from various sources
  allProficiencies: Set<string>;

  // Track all languages from various sources
  allLanguages: Set<string>;

  // Track choices made for each source
  raceChoices: Record<string, string[]>;
  classChoices: Record<string, string[]>;

  // Loading states
  loading: boolean;
  saving: boolean;
  error: Error | null;

  // Methods
  createDraft: (playerId: string, sessionId?: string) => Promise<void>;
  loadDraft: (draftId: string) => Promise<void>;
  setRace: (
    race: RaceInfo | null,
    choices?: Record<string, string[]>
  ) => Promise<void>;
  setClass: (
    classInfo: ClassInfo | null,
    choices?: Record<string, string[]>
  ) => Promise<void>;
  setName: (name: string) => Promise<void>;
  setAbilityScores: (scores: Record<string, number>) => Promise<void>;
  finalizeDraft: () => Promise<string>; // Returns character ID

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
