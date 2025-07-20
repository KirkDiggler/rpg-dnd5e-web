import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useCallback } from 'react';
import { ChoiceRenderer } from './ChoiceRenderer';
import { useChoices } from './hooks/useChoices';
import type { ChoiceSelections } from './hooks/useChoiceSelection';
import { useChoiceSelection } from './hooks/useChoiceSelection';

export interface UnifiedChoiceSelectorProps {
  choices: Choice[];
  choiceType?: ChoiceType;
  selections?: ChoiceSelections;
  onSelectionsChange?: (selections: ChoiceSelections) => void;
  disabled?: boolean;
}

/**
 * Base component for rendering and managing any type of choices
 */
export function UnifiedChoiceSelector({
  choices,
  choiceType,
  selections: externalSelections,
  onSelectionsChange,
  disabled = false,
}: UnifiedChoiceSelectorProps) {
  const { filteredChoices, hasChoices } = useChoices({
    choices,
    type: choiceType,
  });

  const { selections, setSelection, getSelection, isValidSelection } =
    useChoiceSelection({ initialSelections: externalSelections });

  const handleSelectionChange = useCallback(
    (choiceId: string, values: string[]) => {
      setSelection(choiceId, values);

      // Notify parent if callback provided
      if (onSelectionsChange) {
        const newSelections = {
          ...selections,
          [choiceId]: values,
        };
        onSelectionsChange(newSelections);
      }
    },
    [selections, setSelection, onSelectionsChange]
  );

  if (!hasChoices) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No choices available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {filteredChoices.map((choice) => {
        const selectedValues = getSelection(choice.id);
        const isValid = isValidSelection(choice, selectedValues);

        return (
          <div
            key={choice.id}
            className={`
              p-4 rounded-lg border
              ${
                isValid
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-red-300 dark:border-red-700'
              }
            `}
          >
            <ChoiceRenderer
              choice={choice}
              selectedValues={selectedValues}
              onSelectionChange={(values) =>
                handleSelectionChange(choice.id, values)
              }
              disabled={disabled}
            />

            {!isValid && selectedValues.length > 0 && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                Please select exactly {choice.chooseCount} option
                {choice.chooseCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
