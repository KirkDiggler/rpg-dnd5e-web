import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Tool } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

interface ToolChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedTools: Tool[]) => void;
  currentSelections: Tool[];
}

// Helper to convert Tool enum to display name
function getToolDisplayName(tool: Tool): string {
  const name = Tool[tool];
  if (!name) return 'Unknown';

  // Convert enum name to display name (e.g., SMITH_TOOLS -> Smith's Tools)
  return name
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
    .replace('Tools', "'s Tools")
    .replace('Supplies', "'s Supplies")
    .replace('Utensils', ' Utensils');
}

export function ToolChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: ToolChoiceProps) {
  const handleToolToggle = (tool: Tool) => {
    if (choice.chooseCount === 1) {
      // Radio button behavior
      onSelectionChange(choice.id, [tool]);
    } else {
      // Checkbox behavior
      const newSelections = currentSelections.includes(tool)
        ? currentSelections.filter((t) => t !== tool)
        : [...currentSelections, tool].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Handle explicit tool options
  if (choice.options?.case === 'toolOptions') {
    const availableTools = choice.options.value.available;

    return (
      <div style={{ marginTop: '8px' }}>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            marginBottom: '8px',
          }}
        >
          {choice.description}
          <span style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}>
            (Choose {choice.chooseCount})
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {availableTools.map((toolEnum) => {
            const isSelected = currentSelections.includes(toolEnum);
            return (
              <label
                key={toolEnum}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: isSelected
                    ? 'var(--accent-primary)'
                    : 'var(--bg-secondary)',
                  border: `2px solid ${
                    isSelected
                      ? 'var(--accent-primary)'
                      : 'var(--border-primary)'
                  }`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  color: isSelected ? 'white' : 'var(--text-primary)',
                }}
              >
                <input
                  type={choice.chooseCount === 1 ? 'radio' : 'checkbox'}
                  checked={isSelected}
                  onChange={() => handleToolToggle(toolEnum)}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: '13px', fontWeight: '500' }}>
                  {getToolDisplayName(toolEnum)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback if no options available
  return (
    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
      No tool options available for this choice.
    </div>
  );
}
