import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';

interface EquipmentChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

export function EquipmentChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: EquipmentChoiceProps) {
  const [expandedNestedChoices, setExpandedNestedChoices] = useState<
    Set<string>
  >(new Set());

  const handleSelection = (selectionKey: string, nestedSelection?: string) => {
    const fullKey = nestedSelection
      ? `${selectionKey}:${nestedSelection}`
      : selectionKey;

    if (choice.chooseCount === 1) {
      // Radio button behavior - replace selection
      onSelectionChange(choice.id, [fullKey]);
    } else {
      // Checkbox behavior - toggle selection
      const newSelections = currentSelections.includes(fullKey)
        ? currentSelections.filter((s) => s !== fullKey)
        : [...currentSelections, fullKey].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  const toggleNestedChoice = (optionId: string) => {
    const newExpanded = new Set(expandedNestedChoices);
    if (newExpanded.has(optionId)) {
      newExpanded.delete(optionId);
    } else {
      newExpanded.add(optionId);
    }
    setExpandedNestedChoices(newExpanded);
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
            // Get the option ID based on the option type
            let optionId = '';
            if (option.optionType.case === 'item') {
              optionId = option.optionType.value.itemId;
            } else if (option.optionType.case === 'countedItem') {
              optionId = option.optionType.value.itemId;
            } else if (option.optionType.case === 'bundle') {
              // For bundles, create a unique ID
              optionId = `bundle_${index}`;
            } else if (option.optionType.case === 'nestedChoice') {
              optionId =
                option.optionType.value.choice?.id || `nested_${index}`;
            }

            const isSelected = currentSelections.some(
              (s) => s === optionId || s.startsWith(`${optionId}:`)
            );

            return (
              <div
                key={optionId}
                className="border rounded-md p-3"
                style={{
                  borderColor: isSelected
                    ? 'var(--accent-primary)'
                    : 'var(--border-primary)',
                  backgroundColor: isSelected
                    ? 'var(--accent-primary)15'
                    : 'var(--card-bg)',
                }}
              >
                {/* Single Item */}
                {option.optionType.case === 'item' && (
                  <button
                    type="button"
                    onClick={() => handleSelection(optionId)}
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
                      ⚔️
                    </span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="font-medium">
                        {option.optionType.value.name}
                      </div>
                    </div>
                    {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                  </button>
                )}

                {/* Counted Item */}
                {option.optionType.case === 'countedItem' && (
                  <button
                    type="button"
                    onClick={() => handleSelection(optionId)}
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
                      ⚔️
                    </span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="font-medium">
                        {option.optionType.value.name}
                        {option.optionType.value.quantity > 1 && (
                          <span
                            className="ml-2 text-sm"
                            style={{
                              color: isSelected
                                ? 'rgba(255,255,255,0.9)'
                                : 'var(--text-muted)',
                            }}
                          >
                            ×{option.optionType.value.quantity}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                  </button>
                )}

                {/* Bundle */}
                {option.optionType.case === 'bundle' && (
                  <button
                    type="button"
                    onClick={() => {
                      // Check if bundle has any choices that need expansion
                      const bundle = option.optionType.value;
                      const hasChoices =
                        bundle &&
                        'items' in bundle &&
                        bundle.items.some(
                          (item) => item.itemType?.case === 'choiceItem'
                        );
                      if (hasChoices) {
                        toggleNestedChoice(optionId);
                      } else {
                        handleSelection(optionId);
                      }
                    }}
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
                      alignItems: 'flex-start',
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
                      📦
                    </span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="font-medium mb-2">Equipment Bundle</div>
                      <div className="pl-4 space-y-1">
                        {option.optionType.value.items.map(
                          (bundleItem, itemIndex) => {
                            // Handle new BundleItem oneof structure
                            if (bundleItem.itemType.case === 'concreteItem') {
                              const item = bundleItem.itemType.value;
                              return (
                                <div
                                  key={itemIndex}
                                  className="text-sm flex items-center gap-2"
                                >
                                  <span>•</span>
                                  <span
                                    style={{
                                      color: isSelected
                                        ? 'rgba(255,255,255,0.9)'
                                        : 'var(--text-primary)',
                                    }}
                                  >
                                    {item.name}
                                    {item.quantity > 1 && (
                                      <span
                                        className="ml-2"
                                        style={{
                                          color: isSelected
                                            ? 'rgba(255,255,255,0.7)'
                                            : 'var(--text-muted)',
                                        }}
                                      >
                                        ×{item.quantity}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              );
                            } else if (
                              bundleItem.itemType.case === 'choiceItem'
                            ) {
                              // Handle nested choice in bundle
                              const choice = bundleItem.itemType.value;
                              return (
                                <div
                                  key={itemIndex}
                                  className="text-sm flex items-center gap-2"
                                >
                                  <span>•</span>
                                  <span
                                    style={{
                                      color: isSelected
                                        ? 'rgba(255,255,255,0.9)'
                                        : 'var(--text-primary)',
                                    }}
                                  >
                                    {choice?.choice?.description || 'Choice'}
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          }
                        )}
                      </div>
                    </div>
                    {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                  </button>
                )}

                {/* Show expanded content for bundles with choices */}
                {expandedNestedChoices.has(optionId) &&
                  option.optionType.case === 'bundle' &&
                  (() => {
                    const bundle = option.optionType.value;
                    return (
                      bundle &&
                      'items' in bundle &&
                      bundle.items.some(
                        (item) => item.itemType?.case === 'choiceItem'
                      ) && (
                        <div className="mt-2 pl-6 space-y-2">
                          {bundle.items.map((bundleItem, itemIndex) => {
                            if (
                              bundleItem.itemType?.case === 'choiceItem' &&
                              bundleItem.itemType.value?.choice
                            ) {
                              return (
                                <div key={itemIndex}>
                                  <NestedEquipmentChoice
                                    nestedChoice={
                                      bundleItem.itemType.value.choice
                                    }
                                    onSelection={(selectedItem) => {
                                      // Store bundle selection with nested choice
                                      handleSelection(
                                        optionId,
                                        `${itemIndex}:${selectedItem}`
                                      );
                                      setExpandedNestedChoices(new Set());
                                    }}
                                    currentSelection={
                                      currentSelections
                                        .find((s) =>
                                          s.startsWith(`${optionId}:`)
                                        )
                                        ?.split(':')
                                        .slice(1)
                                        .join(':') || ''
                                    }
                                  />
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )
                    );
                  })()}

                {/* Nested Choice */}
                {option.optionType.case === 'nestedChoice' &&
                  option.optionType.value.choice && (
                    <div className="space-y-2">
                      <div
                        className="font-medium text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {option.optionType.value.choice.description ||
                          'Choose Item'}
                      </div>
                      <NestedEquipmentChoice
                        nestedChoice={option.optionType.value.choice}
                        onSelection={(selectedItem) =>
                          handleSelection(optionId, selectedItem)
                        }
                        currentSelection={
                          currentSelections
                            .find((s) => s.startsWith(`${optionId}:`))
                            ?.split(':')[1]
                        }
                      />
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // The API now provides complete lists, no need for category references

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      Unsupported equipment choice type: {choice.optionSet.case}
    </div>
  );
}

// Component for handling nested equipment choices
interface NestedEquipmentChoiceProps {
  nestedChoice: Choice;
  onSelection: (selectedItem: string) => void;
  currentSelection?: string;
}

function NestedEquipmentChoice({
  nestedChoice,
  onSelection,
  currentSelection,
}: NestedEquipmentChoiceProps) {
  // API now provides complete explicit options for nested choices
  if (nestedChoice.optionSet.case === 'explicitOptions') {
    const options = nestedChoice.optionSet.value.options;

    return (
      <select
        value={currentSelection || ''}
        onChange={(e) => onSelection(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: '6px',
          border: `2px solid ${currentSelection ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
          backgroundColor: 'var(--card-bg)',
          color: 'var(--text-primary)',
          fontSize: '14px',
          cursor: 'pointer',
        }}
      >
        <option value="">Choose {nestedChoice.description || 'item'}</option>
        {options.map((option) => {
          let optionId = '';
          let optionName = '';

          if (option.optionType.case === 'item') {
            optionId = option.optionType.value.itemId;
            optionName = option.optionType.value.name;
          } else if (option.optionType.case === 'countedItem') {
            optionId = option.optionType.value.itemId;
            optionName = `${option.optionType.value.name} ×${option.optionType.value.quantity}`;
          }

          return optionId ? (
            <option key={optionId} value={optionId}>
              {optionName}
            </option>
          ) : null;
        })}
      </select>
    );
  }

  return <div>Nested choice type not supported</div>;
}
