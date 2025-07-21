import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

interface GenericChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

/**
 * Generic choice renderer for choice types that don't have specialized components yet.
 * Handles basic explicit options with item references.
 */
export function GenericChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: GenericChoiceProps) {
  const handleSelection = (optionIndex: number) => {
    const selectionKey = `${optionIndex}`;

    if (choice.chooseCount === 1) {
      // Radio button behavior - replace selection
      onSelectionChange(choice.id, [selectionKey]);
    } else {
      // Checkbox behavior - toggle selection
      const newSelections = currentSelections.includes(selectionKey)
        ? currentSelections.filter((s) => s !== selectionKey)
        : [...currentSelections, selectionKey].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Handle explicit options
  if (choice.optionSet.case === 'explicitOptions') {
    const options = choice.optionSet.value.options;

    return (
      <div className="space-y-3">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
          {choice.chooseCount > 1 && (
            <span
              className="text-sm ml-2"
              style={{ color: 'var(--text-muted)' }}
            >
              (Choose {choice.chooseCount})
            </span>
          )}
        </div>

        <div className="space-y-2">
          {options.map((option, index) => {
            const isSelected = currentSelections.includes(`${index}`);

            return (
              <div key={index}>
                {/* Handle item references */}
                {option.optionType.case === 'item' && (
                  <button
                    type="button"
                    onClick={() => handleSelection(index)}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: isSelected
                        ? 'var(--accent-primary)'
                        : 'var(--card-bg)',
                      borderRadius: '6px',
                      border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      fontSize: '13px',
                      color: isSelected ? 'white' : 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      outline: 'none',
                      transform: 'translateY(0)',
                      boxShadow: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor =
                          'var(--accent-primary)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow =
                          '0 4px 12px rgba(0,0,0,0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor =
                          'var(--border-primary)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <span style={{ fontSize: '18px', lineHeight: '1' }}>
                      🔧
                    </span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="font-medium">
                        {option.optionType.value.name}
                      </div>
                    </div>
                    {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                  </button>
                )}

                {/* Handle other option types with basic display */}
                {option.optionType.case !== 'item' && (
                  <button
                    type="button"
                    onClick={() => handleSelection(index)}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: isSelected
                        ? 'var(--accent-primary)'
                        : 'var(--card-bg)',
                      borderRadius: '6px',
                      border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      fontSize: '13px',
                      color: isSelected ? 'white' : 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      outline: 'none',
                      transform: 'translateY(0)',
                      boxShadow: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor =
                          'var(--accent-primary)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow =
                          '0 4px 12px rgba(0,0,0,0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor =
                          'var(--border-primary)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <span style={{ fontSize: '18px', lineHeight: '1' }}>
                      🎯
                    </span>
                    <div
                      style={{ flex: 1, textAlign: 'left' }}
                      className="font-medium"
                    >
                      {option.optionType.case} (Option {index + 1})
                    </div>
                    {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Handle category reference with basic display
  if (choice.optionSet.case === 'categoryReference') {
    const category = choice.optionSet.value;

    return (
      <div className="space-y-3">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
        </div>
        <div
          className="p-4 border rounded"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--card-bg)',
          }}
        >
          <div style={{ color: 'var(--text-muted)' }}>
            Category reference choice: {category.categoryId}
            <br />
            <span className="text-xs">
              This choice type needs a specialized renderer for category:{' '}
              {category.categoryId}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-4 border rounded"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'var(--card-bg)',
      }}
    >
      <div style={{ color: 'var(--text-primary)' }}>
        Unsupported choice structure: {choice.optionSet.case}
      </div>
      <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
        Choice ID: {choice.id}
        <br />
        Description: {choice.description}
      </div>
    </div>
  );
}
