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

            // Create unique key by combining optionId with index to handle duplicates
            const uniqueKey = `${optionId}_${index}`;

            const isSelected = currentSelections.some(
              (s) => s === optionId || s.startsWith(`${optionId}:`)
            );

            return (
              <div
                key={uniqueKey}
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
                {/* Simple Item */}
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
                          (item) =>
                            item.itemType?.case === 'choiceItem' ||
                            // Handle API bug: choice placeholders marked as concreteItem
                            (item.itemType?.case === 'concreteItem' &&
                              item.itemType.value.itemId.startsWith('choose-'))
                        );

                      if (hasChoices) {
                        toggleNestedChoice(optionId);
                      } else {
                        // For bundles with only concrete items, send all items as bundle references
                        // Format: "bundle_X:Y:item_id" where X=bundle index, Y=item index
                        const bundleSelections: string[] = [];
                        if (bundle && 'items' in bundle) {
                          bundle.items.forEach((bundleItem, itemIndex) => {
                            if (
                              bundleItem.itemType?.case === 'concreteItem' &&
                              !bundleItem.itemType.value.itemId.startsWith(
                                'choose-'
                              )
                            ) {
                              const item = bundleItem.itemType.value;
                              bundleSelections.push(
                                `${optionId}:${itemIndex}:${item.itemId}`
                              );
                            }
                          });
                        }

                        // Send all bundle items as selections
                        onSelectionChange(choice.id, bundleSelections);
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

                              // Handle choice placeholders marked as concreteItem (API bug workaround)
                              if (item.itemId.startsWith('choose-')) {
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
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      Choose martial weapon
                                    </span>
                                  </div>
                                );
                              }

                              // Regular concrete items
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
                                      fontStyle: 'italic',
                                    }}
                                  >
                                    {choice?.choice?.description ||
                                      'Choose equipment'}
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
                        (item) =>
                          item.itemType?.case === 'choiceItem' ||
                          // Handle API bug: choice placeholders marked as concreteItem
                          (item.itemType?.case === 'concreteItem' &&
                            item.itemType.value.itemId.startsWith('choose-'))
                      ) && (
                        <div className="mt-2 pl-6 space-y-2">
                          {bundle.items.map((bundleItem, itemIndex) => {
                            // Handle regular choiceItem
                            if (
                              bundleItem.itemType?.case === 'choiceItem' &&
                              bundleItem.itemType.value?.choice
                            ) {
                              return (
                                <NestedEquipmentChoice
                                  key={itemIndex}
                                  nestedChoice={
                                    bundleItem.itemType.value.choice
                                  }
                                  onSelection={(selectedItem) => {
                                    // For bundles with nested choices, we need to include:
                                    // 1. All concrete items in the bundle (formatted as bundle references)
                                    // 2. The selected nested choice item (formatted as bundle reference)
                                    const bundleSelections: string[] = [];

                                    // Process all bundle items to build proper selections
                                    bundle.items.forEach((bundleItem, idx) => {
                                      if (
                                        bundleItem.itemType?.case ===
                                        'concreteItem'
                                      ) {
                                        if (
                                          bundleItem.itemType.value.itemId.startsWith(
                                            'choose-'
                                          )
                                        ) {
                                          // This is a choice placeholder - replace with user's selection
                                          if (idx === itemIndex) {
                                            bundleSelections.push(
                                              `${optionId}:${idx}:${selectedItem}`
                                            );
                                          }
                                        } else {
                                          // This is a concrete item - include as-is
                                          const item =
                                            bundleItem.itemType.value;
                                          bundleSelections.push(
                                            `${optionId}:${idx}:${item.itemId}`
                                          );
                                        }
                                      } else if (
                                        bundleItem.itemType?.case ===
                                        'choiceItem'
                                      ) {
                                        // This is a proper choice item - replace with user's selection
                                        if (idx === itemIndex) {
                                          bundleSelections.push(
                                            `${optionId}:${idx}:${selectedItem}`
                                          );
                                        }
                                      }
                                    });

                                    // Debug logging to verify all selections are included
                                    console.log(
                                      '🎒 Bundle selections being sent:',
                                      bundleSelections
                                    );
                                    console.log(
                                      '🎯 Selected weapon at index',
                                      itemIndex,
                                      ':',
                                      selectedItem
                                    );
                                    console.log(
                                      '📦 Bundle items count:',
                                      bundle.items.length
                                    );

                                    // Send all selections
                                    onSelectionChange(
                                      choice.id,
                                      bundleSelections
                                    );
                                    setExpandedNestedChoices(new Set());
                                  }}
                                  currentSelection={
                                    currentSelections
                                      .find((s) => s.startsWith(`${optionId}:`))
                                      ?.split(':')
                                      .slice(1)
                                      .join(':') || ''
                                  }
                                />
                              );
                            }

                            // Handle choice placeholders marked as concreteItem (API bug workaround)
                            if (
                              bundleItem.itemType?.case === 'concreteItem' &&
                              bundleItem.itemType.value.itemId.startsWith(
                                'choose-'
                              )
                            ) {
                              // Create a fake choice for martial weapons
                              // TODO: This should be handled properly by the API
                              const fakeChoice = {
                                id: 'martial-weapons-choice',
                                description: 'Choose a martial weapon',
                                chooseCount: 1,
                                choiceType: 1, // EQUIPMENT
                                optionSet: {
                                  case: 'explicitOptions' as const,
                                  value: {
                                    options: [
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'longsword',
                                            name: 'Longsword',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'battleaxe',
                                            name: 'Battleaxe',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'flail',
                                            name: 'Flail',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'glaive',
                                            name: 'Glaive',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'greataxe',
                                            name: 'Greataxe',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'greatsword',
                                            name: 'Greatsword',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'halberd',
                                            name: 'Halberd',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'lance',
                                            name: 'Lance',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'maul',
                                            name: 'Maul',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'morningstar',
                                            name: 'Morningstar',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'pike',
                                            name: 'Pike',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'rapier',
                                            name: 'Rapier',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'scimitar',
                                            name: 'Scimitar',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'shortsword',
                                            name: 'Shortsword',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'trident',
                                            name: 'Trident',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'war-pick',
                                            name: 'War Pick',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'warhammer',
                                            name: 'Warhammer',
                                          },
                                        },
                                      },
                                      {
                                        optionType: {
                                          case: 'item' as const,
                                          value: {
                                            itemId: 'whip',
                                            name: 'Whip',
                                          },
                                        },
                                      },
                                    ],
                                  },
                                },
                              };

                              return (
                                <NestedEquipmentChoice
                                  key={itemIndex}
                                  nestedChoice={fakeChoice}
                                  onSelection={(selectedItem) => {
                                    // For bundles with nested choices, we need to include:
                                    // 1. All concrete items in the bundle (formatted as bundle references)
                                    // 2. The selected nested choice item (formatted as bundle reference)
                                    const bundleSelections: string[] = [];

                                    // Process all bundle items to build proper selections
                                    bundle.items.forEach((bundleItem, idx) => {
                                      if (
                                        bundleItem.itemType?.case ===
                                        'concreteItem'
                                      ) {
                                        if (
                                          bundleItem.itemType.value.itemId.startsWith(
                                            'choose-'
                                          )
                                        ) {
                                          // This is a choice placeholder - replace with user's selection
                                          if (idx === itemIndex) {
                                            bundleSelections.push(
                                              `${optionId}:${idx}:${selectedItem}`
                                            );
                                          }
                                        } else {
                                          // This is a concrete item - include as-is
                                          const item =
                                            bundleItem.itemType.value;
                                          bundleSelections.push(
                                            `${optionId}:${idx}:${item.itemId}`
                                          );
                                        }
                                      } else if (
                                        bundleItem.itemType?.case ===
                                        'choiceItem'
                                      ) {
                                        // This is a proper choice item - replace with user's selection
                                        if (idx === itemIndex) {
                                          bundleSelections.push(
                                            `${optionId}:${idx}:${selectedItem}`
                                          );
                                        }
                                      }
                                    });

                                    // Debug logging to verify all selections are included
                                    console.log(
                                      '🎒 Bundle selections being sent:',
                                      bundleSelections
                                    );
                                    console.log(
                                      '🎯 Selected weapon at index',
                                      itemIndex,
                                      ':',
                                      selectedItem
                                    );
                                    console.log(
                                      '📦 Bundle items count:',
                                      bundle.items.length
                                    );

                                    // Send all selections
                                    onSelectionChange(
                                      choice.id,
                                      bundleSelections
                                    );
                                    setExpandedNestedChoices(new Set());
                                  }}
                                  currentSelection={
                                    currentSelections
                                      .find((s) => s.startsWith(`${optionId}:`))
                                      ?.split(':')
                                      .slice(1)
                                      .join(':') || ''
                                  }
                                />
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
        {options.map((option, index) => {
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
            <option key={`${optionId}_${index}`} value={optionId}>
              {optionName}
            </option>
          ) : null;
        })}
      </select>
    );
  }

  return <div>Nested choice type not supported</div>;
}
