import type { CharacterDraft } from '@/api';
import { STEP_TITLES, WIZARD_STEPS, type WizardStep } from '@/constants/wizard';
import {
  CharacterBuilderContext,
  type CharacterBuilderContextType,
  type StepState,
} from '@/contexts/CharacterBuilderContext';
import { useCallback, useState } from 'react';

export type { CharacterBuilderContextType, StepState, WizardStep };

interface CharacterBuilderProviderProps {
  children: React.ReactNode;
}

export function CharacterBuilderProvider({
  children,
}: CharacterBuilderProviderProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('name');
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChoices, setSelectedChoices] = useState<
    Record<string, unknown>
  >({});
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(
    new Set()
  );
  const [invalidSteps, setInvalidSteps] = useState<Set<WizardStep>>(new Set());

  const getStepStatus = useCallback(
    (step: WizardStep): 'pending' | 'current' | 'completed' => {
      if (completedSteps.has(step)) return 'completed';
      if (step === currentStep) return 'current';
      return 'pending';
    },
    [completedSteps, currentStep]
  );

  const canNavigateToStep = useCallback(
    (step: WizardStep): boolean => {
      const stepIndex = WIZARD_STEPS.indexOf(step);
      const currentIndex = WIZARD_STEPS.indexOf(currentStep);

      // Can always go back to previous steps
      if (stepIndex <= currentIndex) return true;

      // Can go forward if all previous steps are completed
      for (let i = 0; i < stepIndex; i++) {
        if (!completedSteps.has(WIZARD_STEPS[i])) return false;
      }

      return true;
    },
    [currentStep, completedSteps]
  );

  const steps: StepState[] = WIZARD_STEPS.map((step) => ({
    id: step,
    title: STEP_TITLES[step],
    status: getStepStatus(step),
    isValid: !invalidSteps.has(step),
  }));

  const updateDraft = useCallback(
    (updates: Partial<CharacterDraft>) => {
      if (draft) {
        setDraft({ ...draft, ...updates });
      }
    },
    [draft]
  );

  const togglePreviewMode = useCallback(() => {
    setPreviewMode((prev) => !prev);
  }, []);

  const setSelectedChoice = useCallback((key: string, value: unknown) => {
    setSelectedChoices((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearSelectedChoice = useCallback((key: string) => {
    setSelectedChoices((prev) => {
      const newChoices = { ...prev };
      delete newChoices[key];
      return newChoices;
    });
  }, []);

  const markStepCompleted = useCallback((step: WizardStep) => {
    setCompletedSteps((prev) => new Set(prev).add(step));
    setInvalidSteps((prev) => {
      const newSet = new Set(prev);
      newSet.delete(step);
      return newSet;
    });
  }, []);

  const markStepInvalid = useCallback((step: WizardStep) => {
    setInvalidSteps((prev) => new Set(prev).add(step));
    setCompletedSteps((prev) => {
      const newSet = new Set(prev);
      newSet.delete(step);
      return newSet;
    });
  }, []);

  const navigateToStep = useCallback(
    (step: WizardStep) => {
      if (canNavigateToStep(step)) {
        setCurrentStep(step);
      }
    },
    [canNavigateToStep]
  );

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const contextValue: CharacterBuilderContextType = {
    // State
    currentStep,
    draft,
    steps,
    previewMode,
    isLoading,
    selectedChoices,

    // Actions
    setCurrentStep,
    updateDraft,
    setDraft,
    togglePreviewMode,
    setLoading,
    setSelectedChoice,
    clearSelectedChoice,
    markStepCompleted,
    markStepInvalid,
    navigateToStep,
    getStepStatus,
    canNavigateToStep,
  };

  return (
    <CharacterBuilderContext.Provider value={contextValue}>
      {children}
    </CharacterBuilderContext.Provider>
  );
}
