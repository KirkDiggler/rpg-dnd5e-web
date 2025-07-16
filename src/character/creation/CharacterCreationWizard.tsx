import type { CharacterDraft } from '@/api';
import { useCreateDraft, useFinalizeDraft } from '@/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { create } from '@bufbuild/protobuf';
import {
  CreateDraftRequestSchema,
  FinalizeDraftRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { AbilityScoresStep } from './steps/AbilityScoresStep';
import { BackgroundStep } from './steps/BackgroundStep';
import { ClassStep } from './steps/ClassStep';
import { NameStep } from './steps/NameStep';
import { RaceStep } from './steps/RaceStep';
import { ReviewStep } from './steps/ReviewStep';
import { SkillsStep } from './steps/SkillsStep';

export type WizardStep =
  | 'name'
  | 'race'
  | 'class'
  | 'ability-scores'
  | 'skills'
  | 'background'
  | 'review';

const WIZARD_STEPS: WizardStep[] = [
  'name',
  'race',
  'class',
  'ability-scores',
  'skills',
  'background',
  'review',
];

const STEP_TITLES: Record<WizardStep, string> = {
  name: 'Name Your Character',
  race: 'Choose Your Race',
  class: 'Select Your Class',
  'ability-scores': 'Set Ability Scores',
  skills: 'Choose Skills',
  background: 'Select Background',
  review: 'Review & Finalize',
};

interface CharacterCreationWizardProps {
  onComplete: (characterId: string) => void;
  onCancel: () => void;
}

export function CharacterCreationWizard({
  onComplete,
  onCancel,
}: CharacterCreationWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('name');
  const [draft, setDraft] = useState<CharacterDraft | null>(null);

  const { createDraft, loading: isCreatingDraft } = useCreateDraft();
  const { finalizeDraft, loading: isFinalizingDraft } = useFinalizeDraft();

  // Create draft on mount
  useEffect(() => {
    const request = create(CreateDraftRequestSchema, {});
    createDraft(request)
      .then((response) => {
        if (response.draft) {
          setDraft(response.draft);
        }
      })
      .catch((error) => {
        console.error('Failed to create draft:', error);
        onCancel();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentStepIndex = WIZARD_STEPS.indexOf(currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;

  const handleNext = () => {
    if (!isLastStep) {
      setCurrentStep(WIZARD_STEPS[currentStepIndex + 1]);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(WIZARD_STEPS[currentStepIndex - 1]);
    }
  };

  const handleFinalize = () => {
    if (!draft) return;

    const request = create(FinalizeDraftRequestSchema, {
      draftId: draft.id,
    });
    finalizeDraft(request)
      .then((response) => {
        if (response.character) {
          onComplete(response.character.id);
        }
      })
      .catch((error) => {
        console.error('Failed to finalize draft:', error);
      });
  };

  const updateDraft = (updates: Partial<CharacterDraft>) => {
    if (draft) {
      setDraft({ ...draft, ...updates });
    }
  };

  if (!draft || isCreatingDraft) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-muted">Preparing character creation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {WIZARD_STEPS.map((step, index) => (
            <div
              key={step}
              className={`flex-1 text-center text-sm ${
                index <= currentStepIndex ? 'text-accent' : 'text-muted'
              }`}
            >
              {index + 1}. {STEP_TITLES[step]}
            </div>
          ))}
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300 ease-out"
            style={{
              width: `${((currentStepIndex + 1) / WIZARD_STEPS.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Step Content */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">{STEP_TITLES[currentStep]}</h2>

        {currentStep === 'name' && (
          <NameStep draft={draft} onUpdate={updateDraft} onNext={handleNext} />
        )}

        {currentStep === 'race' && (
          <RaceStep draft={draft} onUpdate={updateDraft} onNext={handleNext} />
        )}

        {currentStep === 'class' && (
          <ClassStep draft={draft} onUpdate={updateDraft} onNext={handleNext} />
        )}

        {currentStep === 'ability-scores' && (
          <AbilityScoresStep
            draft={draft}
            onUpdate={updateDraft}
            onNext={handleNext}
          />
        )}

        {currentStep === 'skills' && (
          <SkillsStep
            draft={draft}
            onUpdate={updateDraft}
            onNext={handleNext}
          />
        )}

        {currentStep === 'background' && (
          <BackgroundStep
            draft={draft}
            onUpdate={updateDraft}
            onNext={handleNext}
          />
        )}

        {currentStep === 'review' && (
          <ReviewStep
            draft={draft}
            onUpdate={updateDraft}
            onFinalize={handleFinalize}
          />
        )}
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>

        <div className="flex gap-2">
          {!isFirstStep && (
            <Button variant="secondary" onClick={handlePrevious}>
              Previous
            </Button>
          )}

          {!isLastStep && currentStep !== 'name' && (
            <Button variant="primary" onClick={handleNext}>
              Next
            </Button>
          )}

          {isLastStep && (
            <Button
              variant="primary"
              onClick={handleFinalize}
              disabled={isFinalizingDraft}
            >
              {isFinalizingDraft ? 'Creating...' : 'Create Character'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
