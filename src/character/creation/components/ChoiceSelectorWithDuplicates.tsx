import { ChoiceSelector } from '@/components/ChoiceSelector';
import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';

interface ChoiceSelectorWithDuplicatesProps {
  choice: Choice;
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
  existingSelections?: Set<string>;
}

export function ChoiceSelectorWithDuplicates({
  choice,
  selected,
  onSelectionChange,
  existingSelections = new Set(),
}: ChoiceSelectorWithDuplicatesProps) {
  // Filter out options that already exist
  const filteredChoice = {
    ...choice,
    options:
      choice.options?.filter((option) => {
        if (typeof option === 'string') {
          const normalized = option
            .toLowerCase()
            .replace(/^skill[:-]\s*/i, 'skill:');
          return (
            !existingSelections.has(option) &&
            !existingSelections.has(normalized)
          );
        }
        return true; // Keep non-string options for now
      }) || [],
  };

  // If all options are filtered out, show a message
  if (filteredChoice.options.length === 0) {
    return (
      <div
        className="text-sm p-3 rounded"
        style={{
          backgroundColor: 'var(--card-bg)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-primary)',
        }}
      >
        All {choice.type || 'options'} are already selected from other sources
      </div>
    );
  }

  // Update the description to show how many are available
  const filteredCount = choice.options.length - filteredChoice.options.length;
  if (filteredCount > 0 && choice.from) {
    filteredChoice.from = `${choice.from} (${filteredCount} already selected)`;
  }

  return (
    <ChoiceSelector
      choice={filteredChoice}
      selected={selected}
      onSelectionChange={onSelectionChange}
    />
  );
}
