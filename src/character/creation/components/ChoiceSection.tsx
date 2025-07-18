import { ChoiceCard } from '@/components/ChoiceCard';
import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';

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

        // Check if choice has the expected structure
        if (!choice.from || !Array.isArray(choice.from)) {
          console.error(
            'Invalid choice structure - missing or invalid "from" property:',
            choice
          );
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
              Choose {choice.choose} from:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {choice.from.map((option) => {
                // Handle different option types
                if (option.optionType === 'reference' && option.item) {
                  const optionId = option.item.index;
                  // Check multiple formats for duplicates
                  const normalized = optionId
                    .toLowerCase()
                    .replace(/^skill[:-]\s*/i, 'skill:');
                  const isAlreadyHave =
                    existingSelections.has(optionId) ||
                    existingSelections.has(normalized) ||
                    existingSelections.has(option.item.name);
                  const isSelected = selected.includes(optionId);
                  const isDisabled =
                    isAlreadyHave ||
                    (!isSelected && selected.length >= choice.choose);

                  return (
                    <ChoiceCard
                      key={optionId}
                      id={optionId}
                      title={option.item.name}
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

                // TODO: Handle other option types (counted_reference, choice, etc.)
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
