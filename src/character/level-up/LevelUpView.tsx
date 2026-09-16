import { create } from '@bufbuild/protobuf';
import type { LevelGained } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  HitPointMethod,
  LevelUpRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { ChoiceData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { ChoiceSource } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { useState } from 'react';
import { useGetNextLevel, useLevelUp } from '../../api/hooks';
import { ChoiceRenderer } from '../../components/ChoiceRenderer';
import { Button, Card, useToast } from '../../components/ui';
import { ErrorDisplay } from '../../components/ui/Feedback';
import {
  isChoiceSatisfied,
  packChoiceSelection,
  type RenderedSelection,
} from '../../utils/choiceSelectionPacking';
import { getClassDisplayName } from '../../utils/displayNames';
import { LevelGainedPanel } from './LevelGainedPanel';

export interface LevelUpViewProps {
  /** The character taking the level */
  characterId: string;
  /** Leave without taking the level */
  onCancel: () => void;
  /** The level was taken; the sheet should be shown again, freshly loaded */
  onComplete: () => void;
}

/**
 * The level-up screen.
 *
 * NO CLASS IN IT, AND NO DRAFT BEHIND IT. Everything rendered here comes from
 * one GetNextLevel response: the level, the class it is taken in, the choices
 * that level requires, the features it grants and the hit die. There is no
 * class-specific branch and no per-kind filtering of the choice list — the
 * screen iterates whatever requirements the engine returned and hands each to
 * the same generic ChoiceRenderer character creation uses, so a class nobody
 * has written yet levels correctly the day its table is filled in.
 *
 * A LEVEL THAT ASKS NOTHING IS THE SAME SCREEN. Four of the five classes this
 * design starts with require no choice at level 2, and they get this view with
 * an empty choice list rather than a different component: the features, the
 * hit-point method and the confirm are what make a fighter read "Level 2:
 * Action Surge" instead of a bare button.
 *
 * There is no draft. The level is one atomic call, so the selections live in
 * local state until confirm sends them, and nothing is persisted on the way.
 */
export function LevelUpView({
  characterId,
  onCancel,
  onComplete,
}: LevelUpViewProps) {
  const {
    data: nextLevel,
    loading,
    error,
    refetch,
  } = useGetNextLevel(characterId);
  const { levelUp, loading: levelUpLoading } = useLevelUp();
  const { addToast } = useToast();

  const [selections, setSelections] = useState<
    Record<string, RenderedSelection>
  >({});
  const [hitPointMethod, setHitPointMethod] = useState<HitPointMethod>(
    HitPointMethod.UNSPECIFIED
  );
  const [gained, setGained] = useState<LevelGained | null>(null);

  if (gained) {
    return (
      <LevelUpFrame onBack={onComplete} backLabel="← Back to Character Sheet">
        <LevelGainedPanel gained={gained} />
        <div className="flex justify-end">
          <Button variant="commit" onClick={onComplete}>
            Done
          </Button>
        </div>
      </LevelUpFrame>
    );
  }

  if (loading) {
    return (
      <LevelUpFrame onBack={onCancel}>
        <Card className="p-8 text-center">
          <p style={{ color: 'var(--text-muted)' }}>Loading the next level…</p>
        </Card>
      </LevelUpFrame>
    );
  }

  if (error || !nextLevel) {
    return (
      <LevelUpFrame onBack={onCancel}>
        <ErrorDisplay
          title="Unable to load the next level"
          message={error?.message ?? 'No level was returned'}
          onRetry={() => void refetch()}
        />
      </LevelUpFrame>
    );
  }

  const choices = nextLevel.choices;
  const everyChoiceAnswered = choices.every((choice) =>
    isChoiceSatisfied(choice, selections[choice.id])
  );
  const canConfirm =
    everyChoiceAnswered &&
    hitPointMethod !== HitPointMethod.UNSPECIFIED &&
    !levelUpLoading;

  const handleConfirm = async () => {
    // THE CHOICES IT WAS ASKED FOR AND NOTHING ELSE: the request is built by
    // walking the response's own choice list, so a selection left behind by a
    // requirement that is no longer asked for cannot reach the wire.
    const packed: ChoiceData[] = [];
    for (const choice of choices) {
      const data = packChoiceSelection(
        choice,
        selections[choice.id] ?? [],
        ChoiceSource.CLASS
      );
      if (!data) {
        addToast({
          type: 'error',
          message: `This client cannot send a selection for "${choice.description || choice.id}"`,
        });
        return;
      }
      packed.push(data);
    }

    try {
      const response = await levelUp(
        create(LevelUpRequestSchema, {
          characterId,
          hitPointMethod,
          choices: packed,
        })
      );
      if (!response.gained) {
        addToast({
          type: 'error',
          message: 'The level was taken but nothing was reported',
        });
        return;
      }
      setGained(response.gained);
    } catch (err) {
      // The engine validates; the client never pre-judges a level. Whatever it
      // refused with is what the player is shown.
      addToast({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to take the level',
      });
    }
  };

  return (
    <LevelUpFrame onBack={onCancel}>
      <Card className="p-6 space-y-2">
        <h1
          data-testid="level-up-title"
          className="text-3xl font-bold"
          style={{ fontFamily: 'Cinzel, serif', color: 'var(--text-primary)' }}
        >
          Level {nextLevel.level} {getClassDisplayName(nextLevel.class)}
        </h1>
      </Card>

      {nextLevel.features.length > 0 && (
        <Card className="p-6 space-y-3">
          <h2
            className="text-lg font-bold"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--text-primary)',
            }}
          >
            What this level brings
          </h2>
          {nextLevel.features.map((feature) => (
            <div
              key={feature.id || feature.name}
              data-testid="level-up-feature"
            >
              <div
                className="font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {feature.name}
              </div>
              {feature.description && (
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {feature.description}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      <Card className="p-6 space-y-3">
        <h2
          className="text-lg font-bold"
          style={{ fontFamily: 'Cinzel, serif', color: 'var(--text-primary)' }}
        >
          Hit points
        </h2>
        <div className="flex gap-3">
          <HitPointMethodButton
            testId="hit-point-method-rolled"
            label={`Roll d${nextLevel.hitDie}`}
            selected={hitPointMethod === HitPointMethod.ROLLED}
            onSelect={() => setHitPointMethod(HitPointMethod.ROLLED)}
          />
          <HitPointMethodButton
            testId="hit-point-method-average"
            label={`Average of d${nextLevel.hitDie}`}
            selected={hitPointMethod === HitPointMethod.AVERAGE}
            onSelect={() => setHitPointMethod(HitPointMethod.AVERAGE)}
          />
        </div>
      </Card>

      {choices.map((choice) => (
        <Card key={choice.id} className="p-6" data-testid="level-up-choice">
          <ChoiceRenderer
            choice={choice}
            currentSelections={selections[choice.id] ?? []}
            onSelectionChange={(choiceId, choiceSelections) =>
              setSelections((previous) => ({
                ...previous,
                [choiceId]: choiceSelections as RenderedSelection,
              }))
            }
          />
        </Card>
      ))}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Not yet
        </Button>
        <Button
          data-testid="level-up-confirm"
          variant="commit"
          disabled={!canConfirm}
          onClick={() => void handleConfirm()}
        >
          Take Level {nextLevel.level}
        </Button>
      </div>
    </LevelUpFrame>
  );
}

function LevelUpFrame({
  children,
  onBack,
  backLabel = '← Back to Character Sheet',
}: {
  children: React.ReactNode;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div
      data-testid="level-up-view"
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-start">
          <Button variant="secondary" onClick={onBack}>
            {backLabel}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HitPointMethodButton({
  testId,
  label,
  selected,
  onSelect,
}: {
  testId: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        padding: '12px 16px',
        borderRadius: '6px',
        border: `2px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
        backgroundColor: selected ? 'var(--accent-primary)' : 'var(--card-bg)',
        color: selected ? 'white' : 'var(--text-primary)',
      }}
    >
      {label}
    </button>
  );
}
