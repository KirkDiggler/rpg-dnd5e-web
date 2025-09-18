import type {
  BackgroundInfo,
  CharacterDraft,
  ClassInfo,
  RaceInfo,
  SubclassInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  Choice,
  ChoiceData,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { createContext } from 'react';

export interface CharacterDraftState {
  draftId: string | null;
  draft: CharacterDraft | null;
  raceInfo: RaceInfo | null;
  classInfo: ClassInfo | SubclassInfo | null;
  backgroundInfo: BackgroundInfo | null;

  // Track all proficiencies from various sources
  allProficiencies: Set<string>;

  // Track all languages from various sources
  allLanguages: Set<string>;

  // Track choices made for each source
  raceChoices: ChoiceData[];
  classChoices: ChoiceData[];
  backgroundChoices: ChoiceData[];

  // Loading states
  loading: boolean;
  saving: boolean;
  error: Error | null;

  // Methods
  createDraft: (playerId: string, sessionId?: string) => Promise<void>;
  loadDraft: (draftId: string) => Promise<void>;
  setRace: (race: RaceInfo | null, choices?: ChoiceData[]) => Promise<void>;
  setClass: (
    classInfo: ClassInfo | SubclassInfo | null,
    choices?: ChoiceData[]
  ) => Promise<void>;
  setBackground: (
    background: BackgroundInfo | null,
    choices?: ChoiceData[]
  ) => Promise<void>;
  setName: (name: string) => Promise<void>;
  setAbilityScores: (scores: Record<string, number>) => Promise<void>;
  finalizeDraft: () => Promise<string>; // Returns character ID

  // Choice management
  addRaceChoice: (choice: ChoiceData) => void;
  addClassChoice: (choice: ChoiceData) => void;
  addBackgroundChoice: (choice: ChoiceData) => void;

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
