// DEPRECATED: This component uses old Choice properties (type, from, choose, options)
// Should be replaced with UnifiedChoiceSelector - see issue #93
/* eslint-disable */
// @ts-nocheck
import { ChoiceCard } from '@/components/ChoiceCard';
import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

interface ChoiceSectionProps {
  title: string;
  choices: Choice[];
  selectedChoices: Record<string, string[]>;
  onChoiceSelect: (choiceKey: string, optionId: string) => void;
  existingSelections?: Set<string>; // For duplicate prevention
}

export function ChoiceSection({
  title,
  choices,
  selectedChoices,
  onChoiceSelect,
  existingSelections = new Set(),
}: ChoiceSectionProps) {
  if (!choices || choices.length === 0) return null;

  return (
    <div className="mb-6">
      <h3
        className="text-lg font-semibold mb-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </h3>

      {choices.map((choice, index) => {
        const choiceKey = `${choice.type}_${index}`;
        const selected = selectedChoices[choiceKey] || [];

        // Check if choice has the expected structure - now using options array
        if (!choice.options || !Array.isArray(choice.options)) {
          return (
            <div
              key={choiceKey}
              className="mb-4 p-3 rounded"
              style={{
                backgroundColor: 'var(--bg-error)',
                color: 'var(--text-error)',
              }}
            >
              Error: Invalid choice data structure
            </div>
          );
        }

        return (
          <div key={choiceKey} className="mb-4">
            <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
              {choice.from || `Choose ${choice.choose} from:`}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {choice.options.map((option, optionIndex) => {
                // Handle string options (simple case)
                if (typeof option === 'string') {
                  const optionId = option;
                  const normalized = option
                    .toLowerCase()
                    .replace(/^skill[:-]\s*/i, 'skill:');
                  const isAlreadyHave =
                    existingSelections.has(optionId) ||
                    existingSelections.has(normalized);
                  const isSelected = selected.includes(optionId);
                  const isDisabled =
                    isAlreadyHave ||
                    (!isSelected && selected.length >= choice.choose);

                  return (
                    <ChoiceCard
                      key={`${choiceKey}_${optionIndex}`}
                      id={optionId}
                      title={option}
                      description={
                        isAlreadyHave
                          ? 'Already have this proficiency'
                          : `${choice.type} choice`
                      }
                      selected={isSelected}
                      disabled={isDisabled}
                      onSelect={() => {
                        if (isAlreadyHave) return; // Prevent selecting duplicates

                        if (isSelected) {
                          // Deselect
                          onChoiceSelect(choiceKey, optionId);
                        } else if (selected.length < choice.choose) {
                          // Select
                          onChoiceSelect(choiceKey, optionId);
                        }
                      }}
                    />
                  );
                }

                // Options are now always strings in the new API
                return null;
              })}
            </div>

            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Selected: {selected.length} / {choice.choose}
            </p>
          </div>
        );
      })}
    </div>
  );
}
