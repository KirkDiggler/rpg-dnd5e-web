import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';

// Display info for any enum value
export interface EnumDisplayInfo {
  name: string;
  description?: string;
}

// Layout options - implement 'rows' and 'grouped' now, others later
export type ChoiceLayout = 'rows' | 'grid' | 'chips' | 'grouped';

export interface EnumChoiceProps<T extends number> {
  // Core data
  choice: Choice;
  available: T[];
  currentSelections: T[];

  // Display - function that returns display info for each enum value
  getDisplayInfo: (value: T) => EnumDisplayInfo;

  // Optional grouping - when provided, items are grouped under headers
  getGroup?: (value: T) => string;
  groupOrder?: string[]; // Optional ordering of group headers

  // Layout hint (defaults to 'rows', auto-uses 'grouped' if getGroup provided)
  layout?: ChoiceLayout;

  // Callback
  onSelectionChange: (choiceId: string, selections: T[]) => void;
}

export function EnumChoice<T extends number>({
  choice,
  available,
  currentSelections,
  getDisplayInfo,
  getGroup,
  groupOrder,
  layout,
  onSelectionChange,
}: EnumChoiceProps<T>) {
  // Filter out UNSPECIFIED values (value 0) - these should never be displayed to users
  const filteredAvailable = available.filter((item) => item !== 0);

  // Auto-detect layout
  const effectiveLayout = layout || (getGroup ? 'grouped' : 'rows');

  const handleToggle = (value: T) => {
    if (choice.chooseCount === 1) {
      // Radio button behavior
      onSelectionChange(choice.id, [value]);
    } else {
      // Checkbox behavior
      const newSelections = currentSelections.includes(value)
        ? currentSelections.filter((s) => s !== value)
        : [...currentSelections, value].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  // Render grouped layout
  if (effectiveLayout === 'grouped' && getGroup) {
    // Group items by the group function
    const itemsByGroup: Record<string, T[]> = {};

    filteredAvailable.forEach((item) => {
      const group = getGroup(item);
      if (!itemsByGroup[group]) {
        itemsByGroup[group] = [];
      }
      itemsByGroup[group].push(item);
    });

    // Order groups if specified
    const groups = groupOrder || Object.keys(itemsByGroup);

    return (
      <div className="space-y-4">
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {choice.description}
          {choice.chooseCount > 1 && (
            <span
              className="text-sm ml-2"
              style={{ color: 'var(--text-muted)' }}
            >
              ({currentSelections.length}/{choice.chooseCount} selected)
            </span>
          )}
        </div>

        {groups.map((group) => {
          const items = itemsByGroup[group];
          if (!items || items.length === 0) return null;

          return (
            <div
              key={group}
              className="border rounded-lg p-4"
              style={{
                borderColor: 'var(--border-primary)',
                backgroundColor: 'var(--card-bg)',
              }}
            >
              <div
                className="font-medium mb-3 text-sm"
                style={{ color: 'var(--accent-primary)' }}
              >
                {group}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((item) => {
                  const isSelected = currentSelections.includes(item);
                  const isDisabled =
                    !isSelected &&
                    currentSelections.length >= choice.chooseCount;
                  const info = getDisplayInfo(item);

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={
                        isDisabled ? undefined : () => handleToggle(item)
                      }
                      disabled={isDisabled}
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
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        outline: 'none',
                        opacity: isDisabled ? 0.5 : 1,
                      }}
                      className="hover:transform hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius:
                            choice.chooseCount === 1 ? '50%' : '4px',
                          border: `2px solid ${isSelected ? 'white' : 'var(--border-primary)'}`,
                          backgroundColor: isSelected
                            ? 'white'
                            : 'var(--bg-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isSelected && (
                          <div
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius:
                                choice.chooseCount === 1 ? '50%' : '2px',
                              backgroundColor: 'var(--accent-primary)',
                            }}
                          />
                        )}
                      </div>
                      <span>{info.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Render rows layout (default)
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
        {choice.chooseCount > 1 && (
          <span style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}>
            ({currentSelections.length}/{choice.chooseCount} selected)
          </span>
        )}
        {choice.chooseCount === 1 && (
          <span style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}>
            (Choose {choice.chooseCount})
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredAvailable.map((item) => {
          const isSelected = currentSelections.includes(item);
          const isDisabled =
            !isSelected && currentSelections.length >= choice.chooseCount;
          const info = getDisplayInfo(item);

          return (
            <label
              key={item}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: isSelected
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
                border: `2px solid ${
                  isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'
                }`,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                color: isSelected ? 'white' : 'var(--text-primary)',
                opacity: isDisabled ? 0.5 : 1,
              }}
            >
              <input
                type={choice.chooseCount === 1 ? 'radio' : 'checkbox'}
                checked={isSelected}
                onChange={() => !isDisabled && handleToggle(item)}
                disabled={isDisabled}
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '600' }}>
                {info.name}
              </span>
              {info.description && (
                <span
                  style={{
                    fontSize: '12px',
                    marginTop: '4px',
                    opacity: isSelected ? 0.9 : 0.7,
                  }}
                >
                  {info.description}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
