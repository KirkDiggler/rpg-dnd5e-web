import type { CharacterDraft } from '@/api';
import { createContext } from 'react';

// TODO: Define CharacterCreationStep type when steps are implemented
interface CharacterCreationStep {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'upcoming' | 'disabled';
}

export interface CharacterBuilderState {
  currentStepId: string;
  draft: CharacterDraft | null;
  steps: CharacterCreationStep[];
  previewMode: boolean;
  isLoading: boolean;
  selectedChoices: Record<string, unknown>;
  selectedClass?: string;
  selectedRace?: string;
}

export interface CharacterBuilderActions {
  setCurrentStepId: (stepId: string) => void;
  updateDraft: (updates: Partial<CharacterDraft>) => void;
  setDraft: (draft: CharacterDraft | null) => void;
  togglePreviewMode: () => void;
  setLoading: (loading: boolean) => void;
  setSelectedChoice: (key: string, value: unknown) => void;
  clearSelectedChoice: (key: string) => void;
  markStepCompleted: (stepId: string) => void;
  markStepInvalid: (stepId: string) => void;
  navigateToStep: (stepId: string) => void;
  getStepStatus: (
    stepId: string
  ) => 'completed' | 'current' | 'upcoming' | 'disabled';
  canNavigateToStep: (stepId: string) => boolean;
  setSelectedClass: (classId: string) => void;
  setSelectedRace: (raceId: string) => void;
  updateSteps: (steps: CharacterCreationStep[]) => void;
}

export type CharacterBuilderContextType = CharacterBuilderState &
  CharacterBuilderActions;

export const CharacterBuilderContext =
  createContext<CharacterBuilderContextType | null>(null);
