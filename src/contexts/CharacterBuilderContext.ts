import type { CharacterDraft } from '@/api';
import { type WizardStep } from '@/constants/wizard';
import { createContext } from 'react';

export type { WizardStep };

export interface StepState {
  id: WizardStep;
  title: string;
  status: 'pending' | 'current' | 'completed';
  isValid: boolean;
}

export interface CharacterBuilderState {
  currentStep: WizardStep;
  draft: CharacterDraft | null;
  steps: StepState[];
  previewMode: boolean;
  isLoading: boolean;
  selectedChoices: Record<string, unknown>;
}

export interface CharacterBuilderActions {
  setCurrentStep: (step: WizardStep) => void;
  updateDraft: (updates: Partial<CharacterDraft>) => void;
  setDraft: (draft: CharacterDraft | null) => void;
  togglePreviewMode: () => void;
  setLoading: (loading: boolean) => void;
  setSelectedChoice: (key: string, value: unknown) => void;
  clearSelectedChoice: (key: string) => void;
  markStepCompleted: (step: WizardStep) => void;
  markStepInvalid: (step: WizardStep) => void;
  navigateToStep: (step: WizardStep) => void;
  getStepStatus: (step: WizardStep) => 'pending' | 'current' | 'completed';
  canNavigateToStep: (step: WizardStep) => boolean;
}

export type CharacterBuilderContextType = CharacterBuilderState &
  CharacterBuilderActions;

export const CharacterBuilderContext =
  createContext<CharacterBuilderContextType | null>(null);
