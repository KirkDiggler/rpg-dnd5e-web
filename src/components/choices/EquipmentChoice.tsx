import { create } from '@bufbuild/protobuf';
import type {
  Choice,
  ItemBundle,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceOptionSchema,
  ChoiceSchema,
  ExplicitOptionsSchema,
  ItemReferenceSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Backpack,
  ChevronDown,
  Package,
  ScrollText,
  Shield,
  Sword,
} from 'lucide-react';
import { useState } from 'react';

interface EquipmentChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

// Helper function to get icon based on item type
function getItemIcon(itemName: string): React.ReactNode {
  const name = itemName.toLowerCase();
  if (
    name.includes('sword') ||
    name.includes('axe') ||
    name.includes('hammer') ||
    name.includes('weapon')
  ) {
    return <Sword className="w-4 h-4" />;
  }
  if (
    name.includes('shield') ||
    name.includes('armor') ||
    name.includes('mail')
  ) {
    return <Shield className="w-4 h-4" />;
  }
  if (name.includes('pack') || name.includes('kit')) {
    return <Backpack className="w-4 h-4" />;
  }
  if (
    name.includes('scroll') ||
    name.includes('book') ||
    name.includes('component')
  ) {
    return <ScrollText className="w-4 h-4" />;
  }
  return <Package className="w-4 h-4" />;
}

// Helper function to build bundle selections - avoids code duplication
function buildBundleSelections(
  bundle: ItemBundle,
  optionId: string,
  selectedItemIndex: number,
  selectedItem: string
): string[] {
  const bundleSelections: string[] = [];

  bundle.items.forEach((bundleItem, idx: number) => {
    if (bundleItem.itemType?.case === 'concreteItem') {
      if (bundleItem.itemType.value?.itemId?.startsWith('choose-')) {
        // This is a choice placeholder - replace with user's selection
        if (idx === selectedItemIndex) {
          // Use the selected item ID directly (server-provided)
          bundleSelections.push(`${optionId}:${idx}:${selectedItem}`);
        }
      } else if (bundleItem.itemType.value?.itemId) {
        // This is a concrete item - include as-is (should already be properly formatted)
        const item = bundleItem.itemType.value;
        bundleSelections.push(`${optionId}:${idx}:${item.itemId}`);
      }
    } else if (bundleItem.itemType?.case === 'choiceItem') {
      // This is a proper choice item - replace with user's selection
      if (idx === selectedItemIndex) {
        // Use the selected item ID directly (server-provided)
        bundleSelections.push(`${optionId}:${idx}:${selectedItem}`);
      }
    }
  });

  return bundleSelections;
}

export function EquipmentChoice({
  choice,
  onSelectionChange,
  currentSelections,
}: EquipmentChoiceProps) {
  const [expandedNestedChoices, setExpandedNestedChoices] = useState<
    Set<string>
  >(new Set());
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const handleSelection = (selectionKey: string, nestedSelection?: string) => {
    const fullKey = nestedSelection
      ? `${selectionKey}:${nestedSelection}`
      : selectionKey;

    console.log('Equipment handleSelection called:', {
      selectionKey,
      nestedSelection,
      fullKey,
      choiceId: choice.id,
    });

    if (choice.chooseCount === 1) {
      // Radio button behavior - replace selection
      console.log('Equipment selection (single):', [fullKey]);
      onSelectionChange(choice.id, [fullKey]);
    } else {
      // Checkbox behavior - toggle selection
      const newSelections = currentSelections.includes(fullKey)
        ? currentSelections.filter((s) => s !== fullKey)
        : [...currentSelections, fullKey].slice(0, choice.chooseCount);
      console.log('Equipment selection (multiple):', newSelections);
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

    // Prepare options for enhanced UI
    const selectOptions = options.map((option, index) => {
      let optionId = '';
      let displayName = '';
      let hasNestedChoice = false;

      if (option.optionType.case === 'item') {
        optionId = option.optionType.value.itemId;
        displayName = option.optionType.value.name;
      } else if (option.optionType.case === 'bundle') {
        const bundle = option.optionType.value;
        optionId = `bundle_${index}`;
        const itemNames = bundle.items
          .map((item) => {
            if (item.itemType?.case === 'concreteItem') {
              const concreteItem = item.itemType.value;
              if (concreteItem.itemId?.startsWith('choose-')) {
                hasNestedChoice = true;
                return concreteItem.name || 'choice';
              }
              return concreteItem.name;
            } else if (item.itemType?.case === 'choiceItem') {
              hasNestedChoice = true;
              const choiceItem = item.itemType.value;
              return choiceItem.choice?.description || 'choice';
            }
            return '';
          })
          .filter(Boolean);
        displayName = itemNames.join(' + ');
      } else if (option.optionType.case === 'nestedChoice') {
        const nestedChoice = option.optionType.value;
        optionId = `choice_${index}`;
        displayName = nestedChoice.choice?.description || 'Make a choice';
        hasNestedChoice = true;
      }

      return {
        optionId,
        displayName,
        hasNestedChoice,
        originalOption: option,
        index,
      };
    });

    const selectedOption = selectOptions.find((opt) =>
      currentSelections.some(
        (s) => s === opt.optionId || s.startsWith(`${opt.optionId}:`)
      )
    );

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Package className="w-5 h-5 mt-0.5 text-amber-500" />
          <div className="flex-1">
            <h4
              className="font-semibold text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              Equipment Choice
            </h4>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {choice.description || 'Select your equipment'}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          {selectOptions.map((opt) => {
            const isSelected = selectedOption?.optionId === opt.optionId;
            const isExpanded = expandedNestedChoices.has(opt.optionId);
            const isHovered = hoveredOption === opt.optionId;

            return (
              <div key={`${opt.optionId}_${opt.index}`}>
                <button
                  onClick={() => {
                    if (opt.hasNestedChoice) {
                      toggleNestedChoice(opt.optionId);
                      // Clear previous selection when expanding nested choices
                      onSelectionChange(choice.id, []);
                    } else if (
                      opt.originalOption.optionType.case === 'bundle'
                    ) {
                      // For bundles without choices, send all items
                      const bundle = opt.originalOption.optionType.value;
                      const bundleSelections: string[] = [];
                      bundle.items.forEach((bundleItem, itemIndex) => {
                        if (
                          bundleItem.itemType?.case === 'concreteItem' &&
                          !bundleItem.itemType.value.itemId.startsWith(
                            'choose-'
                          )
                        ) {
                          const item = bundleItem.itemType.value;
                          bundleSelections.push(
                            `${opt.optionId}:${itemIndex}:${item.itemId}`
                          );
                        }
                      });
                      onSelectionChange(choice.id, bundleSelections);
                    } else {
                      // For direct item selection, use the server-provided option ID
                      if (opt.originalOption.optionType.case === 'item') {
                        const item = opt.originalOption.optionType.value;
                        console.log('Direct equipment selection:', {
                          itemId: item.itemId,
                        });
                        handleSelection(item.itemId);
                      } else {
                        handleSelection(opt.optionId);
                      }
                    }
                  }}
                  onMouseEnter={() => setHoveredOption(opt.optionId)}
                  onMouseLeave={() => setHoveredOption(null)}
                  className="w-full text-left transition-all duration-200"
                  style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    border: `2px solid ${
                      isSelected
                        ? 'var(--accent-primary)'
                        : isHovered
                          ? 'var(--accent-hover)'
                          : 'var(--border-primary)'
                    }`,
                    backgroundColor: isSelected
                      ? 'rgba(var(--accent-primary-rgb), 0.1)'
                      : isHovered
                        ? 'rgba(var(--accent-primary-rgb), 0.05)'
                        : 'var(--card-bg)',
                    transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                    boxShadow: isSelected
                      ? '0 4px 12px rgba(0, 0, 0, 0.15)'
                      : isHovered
                        ? '0 2px 8px rgba(0, 0, 0, 0.1)'
                        : 'none',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="p-2 rounded-full"
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--accent-primary)'
                            : 'rgba(var(--accent-primary-rgb), 0.2)',
                          color: isSelected ? 'white' : 'var(--accent-primary)',
                        }}
                      >
                        {getItemIcon(opt.displayName)}
                      </div>
                      <div>
                        <div
                          className="font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {opt.displayName}
                        </div>
                        {isSelected && (
                          <div
                            className="text-xs mt-0.5"
                            style={{ color: 'var(--accent-primary)' }}
                          >
                            Selected
                          </div>
                        )}
                      </div>
                    </div>
                    {opt.hasNestedChoice && (
                      <div
                        className="transition-transform duration-200"
                        style={{
                          transform: isExpanded
                            ? 'rotate(180deg)'
                            : 'rotate(0deg)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </button>

                {/* Show nested choices if expanded */}
                {isExpanded && opt.hasNestedChoice && (
                  <div
                    className="mt-2 ml-12 p-3 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(var(--card-bg-rgb), 0.5)',
                      borderLeft: '3px solid var(--accent-primary)',
                    }}
                  >
                    {opt.originalOption.optionType.case === 'bundle' && (
                      <RenderBundleNestedChoices
                        bundle={opt.originalOption.optionType.value}
                        optionId={opt.optionId}
                        onSelection={onSelectionChange}
                        choiceId={choice.id}
                        currentSelections={currentSelections}
                      />
                    )}
                    {opt.originalOption.optionType.case === 'nestedChoice' && (
                      <NestedEquipmentChoice
                        nestedChoice={
                          opt.originalOption.optionType.value.choice ||
                          create(ChoiceSchema, {})
                        }
                        onSelection={(selectedItem) => {
                          handleSelection(opt.optionId, selectedItem);
                        }}
                        currentSelection={
                          currentSelections
                            .find((s) => s.startsWith(`${opt.optionId}:`))
                            ?.split(':')[1] || ''
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Handle different option sets (reference options, tag filters)
  if (choice.optionSet.case === 'categoryReference') {
    const refOptions = choice.optionSet.value;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Package className="w-5 h-5 mt-0.5 text-amber-500" />
          <div className="flex-1">
            <h4
              className="font-semibold text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              Equipment Reference
            </h4>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {choice.description || 'Reference options available'}
            </p>
          </div>
        </div>
        <div
          className="text-sm p-3 rounded-lg"
          style={{
            backgroundColor: 'var(--card-bg)',
            color: 'var(--text-muted)',
          }}
        >
          Category: {refOptions.categoryId}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
      Unsupported equipment choice type: {choice.optionSet.case}
    </div>
  );
}

// Component for handling bundle nested choices
interface BundleNestedChoicesProps {
  bundle: ItemBundle;
  optionId: string;
  choiceId: string;
  onSelection: (choiceId: string, selections: string[]) => void;
  currentSelections: string[];
}

function RenderBundleNestedChoices({
  bundle,
  optionId,
  choiceId,
  onSelection,
  currentSelections,
}: BundleNestedChoicesProps) {
  return (
    <div className="space-y-3">
      {bundle.items.map((bundleItem, itemIndex) => {
        if (
          bundleItem.itemType?.case === 'concreteItem' &&
          bundleItem.itemType.value.itemId?.startsWith('choose-')
        ) {
          // This is a placeholder for a nested choice
          const fakeChoice = create(ChoiceSchema, {
            id: `nested_${itemIndex}`,
            description: bundleItem.itemType.value.name || 'Choose an item',
            chooseCount: 1,
            optionSet: {
              case: 'explicitOptions',
              value: create(ExplicitOptionsSchema, {
                options: bundleItem.itemType.value.itemId
                  .replace('choose-', '')
                  .split('-or-')
                  .map((itemId) => {
                    // Use the item ID as-is (server should provide proper format)
                    const displayName = itemId.replace(/-/g, ' ');

                    return create(ChoiceOptionSchema, {
                      optionType: {
                        case: 'item',
                        value: create(ItemReferenceSchema, {
                          itemId: itemId, // Use server-provided ID directly
                          name: displayName, // Keep user-friendly display name
                        }),
                      },
                    });
                  }),
              }),
            },
          });

          return (
            <NestedEquipmentChoice
              key={itemIndex}
              nestedChoice={fakeChoice}
              onSelection={(selectedItem) => {
                const selections = buildBundleSelections(
                  bundle,
                  optionId,
                  itemIndex,
                  selectedItem
                );
                onSelection(choiceId, selections);
              }}
              currentSelection={
                currentSelections
                  .find((s) => s.startsWith(`${optionId}:${itemIndex}:`))
                  ?.split(':')[2] || ''
              }
            />
          );
        } else if (bundleItem.itemType?.case === 'choiceItem') {
          return (
            <NestedEquipmentChoice
              key={itemIndex}
              nestedChoice={
                bundleItem.itemType.value.choice || create(ChoiceSchema, {})
              }
              onSelection={(selectedItem) => {
                const selections = buildBundleSelections(
                  bundle,
                  optionId,
                  itemIndex,
                  selectedItem
                );
                onSelection(choiceId, selections);
              }}
              currentSelection={
                currentSelections
                  .find((s) => s.startsWith(`${optionId}:${itemIndex}:`))
                  ?.split(':')[2] || ''
              }
            />
          );
        }
        return null;
      })}
    </div>
  );
}

// Component for handling nested equipment choices
interface NestedEquipmentChoiceProps {
  nestedChoice: Choice;
  onSelection: (selectedItem: string) => void;
  currentSelection: string;
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
      <div className="space-y-2">
        <p
          className="text-sm font-medium mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {nestedChoice.description}
        </p>
        <div className="grid gap-1">
          {options.map((option, idx) => {
            if (option.optionType.case === 'item') {
              const item = option.optionType.value;
              const isSelected = currentSelection === item.itemId;

              return (
                <button
                  key={`${item.itemId}_${idx}`}
                  onClick={() => {
                    // Ensure we're sending the proper option ID, not just the display name
                    // The itemId should already be the correct format (e.g., "martial_weapon_warhammer")
                    // but we need to verify this is preserved through the selection chain
                    console.log(
                      'Equipment selection - sending itemId:',
                      item.itemId,
                      'for item name:',
                      item.name
                    );
                    onSelection(item.itemId);
                  }}
                  className="text-left p-2 rounded transition-all duration-150"
                  style={{
                    backgroundColor: isSelected
                      ? 'rgba(var(--accent-primary-rgb), 0.2)'
                      : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'transparent'}`,
                    color: isSelected
                      ? 'var(--accent-primary)'
                      : 'var(--text-primary)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4">{getItemIcon(item.name)}</div>
                    <span className="text-sm">{item.name}</span>
                  </div>
                </button>
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  }

  // Fallback for other types
  return (
    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
      Nested choice type: {nestedChoice.optionSet.case}
    </div>
  );
}
