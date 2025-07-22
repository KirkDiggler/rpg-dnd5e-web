import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { EquipmentType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useState } from 'react';
import { useListEquipmentByTypeConditional } from '../../api/hooks';

interface EquipmentChoiceProps {
  choice: Choice;
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

// Map category IDs to equipment types (from the guide)
function categoryIdToEquipmentType(categoryId: string): EquipmentType | null {
  const mapping: Record<string, EquipmentType> = {
    'simple-weapons': EquipmentType.SIMPLE_MELEE_WEAPON,
    'simple-melee-weapons': EquipmentType.SIMPLE_MELEE_WEAPON,
    'simple-ranged-weapons': EquipmentType.SIMPLE_RANGED_WEAPON,
    'martial-weapons': EquipmentType.MARTIAL_MELEE_WEAPON,
    'martial-melee-weapons': EquipmentType.MARTIAL_MELEE_WEAPON,
    'martial-ranged-weapons': EquipmentType.MARTIAL_RANGED_WEAPON,
    'light-armor': EquipmentType.LIGHT_ARMOR,
    'medium-armor': EquipmentType.MEDIUM_ARMOR,
    'heavy-armor': EquipmentType.HEAVY_ARMOR,
    shields: EquipmentType.SHIELD,
    'adventuring-gear': EquipmentType.ADVENTURING_GEAR,
    tools: EquipmentType.TOOLS,
    'artisan-tools': EquipmentType.ARTISAN_TOOLS,
    'gaming-sets': EquipmentType.GAMING_SET,
    'musical-instruments': EquipmentType.MUSICAL_INSTRUMENT,
    vehicles: EquipmentType.VEHICLE,
  };

  return mapping[categoryId.toLowerCase()] || null;
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
                        <div className="ml-6 mt-2 space-y-2">
                          {bundle.items.map((bundleItem, itemIndex) => {
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
                                    // Store bundle selection with nested choice
                                    handleSelection(
                                      optionId,
                                      `${itemIndex}:${selectedItem}`
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
                {option.optionType.case === 'nestedChoice' && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleNestedChoice(optionId)}
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
                        {expandedNestedChoices.has(optionId) ? '📂' : '📁'}
                      </span>
                      <div
                        style={{ flex: 1, textAlign: 'left' }}
                        className="font-medium"
                      >
                        {option.optionType.value.choice?.description ||
                          'Choose Item'}
                      </div>
                      {isSelected && (
                        <span style={{ fontSize: '16px' }}>✓</span>
                      )}
                    </button>

                    {expandedNestedChoices.has(optionId) && (
                      <div className="ml-6 mt-2">
                        <NestedEquipmentChoice
                          nestedChoice={option.optionType.value.choice!}
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
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Handle category reference
  if (choice.optionSet.case === 'categoryReference') {
    const category = choice.optionSet.value;
    const equipmentType = categoryIdToEquipmentType(category.categoryId);

    return (
      <CategoryEquipmentChoice
        choice={choice}
        equipmentType={equipmentType}
        excludeIds={category.excludeIds}
        onSelectionChange={onSelectionChange}
        currentSelections={currentSelections}
      />
    );
  }

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      Unsupported equipment choice type: {choice.optionSet.case}
    </div>
  );
}

// Component for handling nested equipment choices (like "any martial weapon")
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
  const [isExpanded, setIsExpanded] = useState(false);

  // Always call hooks at the top level
  const category =
    nestedChoice.optionSet.case === 'categoryReference'
      ? nestedChoice.optionSet.value
      : null;
  const equipmentType = category
    ? categoryIdToEquipmentType(category.categoryId)
    : null;

  const { data: equipment, loading } = useListEquipmentByTypeConditional(
    equipmentType || EquipmentType.UNSPECIFIED,
    isExpanded &&
      equipmentType !== null &&
      equipmentType !== EquipmentType.UNSPECIFIED,
    { pageSize: 100 }
  );

  if (nestedChoice.optionSet.case === 'categoryReference' && category) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--card-bg)',
            borderRadius: '6px',
            border: `2px solid ${currentSelection ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            width: '100%',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <span>
            {equipment?.find((item) => item.id === currentSelection)?.name ||
              currentSelection ||
              'Choose item'}
          </span>
          <span style={{ fontSize: '12px', opacity: 0.8 }}>
            {isExpanded ? '▼' : '▶'}
          </span>
        </button>

        {isExpanded && (
          <div
            className="max-h-48 overflow-y-auto border rounded p-2"
            style={{
              borderColor: 'var(--border-primary)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            {loading ? (
              <div
                className="text-center py-4"
                style={{ color: 'var(--text-muted)' }}
              >
                Loading equipment...
              </div>
            ) : (
              <div className="space-y-1">
                {equipment
                  ?.filter((item) => !category.excludeIds.includes(item.id))
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelection(item.id);
                        setIsExpanded(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        fontSize: '14px',
                        color: 'var(--text-primary)',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          'var(--accent-primary)20';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return <div>Unsupported nested choice type</div>;
}

// Component for category-based equipment choices
interface CategoryEquipmentChoiceProps {
  choice: Choice;
  equipmentType: EquipmentType | null;
  excludeIds: string[];
  onSelectionChange: (choiceId: string, selectedIds: string[]) => void;
  currentSelections: string[];
}

function CategoryEquipmentChoice({
  choice,
  equipmentType,
  excludeIds,
  onSelectionChange,
  currentSelections,
}: CategoryEquipmentChoiceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: equipment, loading } = useListEquipmentByTypeConditional(
    equipmentType || EquipmentType.UNSPECIFIED,
    isExpanded &&
      equipmentType !== null &&
      equipmentType !== EquipmentType.UNSPECIFIED,
    { pageSize: 100 }
  );

  const availableEquipment =
    equipment?.filter((item) => !excludeIds.includes(item.id)) || [];

  const handleItemToggle = (itemId: string) => {
    if (choice.chooseCount === 1) {
      onSelectionChange(choice.id, [itemId]);
    } else {
      const newSelections = currentSelections.includes(itemId)
        ? currentSelections.filter((id) => id !== itemId)
        : [...currentSelections, itemId].slice(0, choice.chooseCount);
      onSelectionChange(choice.id, newSelections);
    }
  };

  return (
    <div className="space-y-3">
      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
        {choice.description}
        {choice.chooseCount > 1 && (
          <span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>
            (Choose {choice.chooseCount})
          </span>
        )}
      </div>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-2 rounded border font-medium"
        style={{
          color: 'var(--text-primary)',
          borderColor: 'var(--border-primary)',
          backgroundColor: 'var(--card-bg)',
        }}
      >
        {currentSelections.length > 0
          ? `${currentSelections.length} selected`
          : 'Select equipment'}{' '}
        {isExpanded ? '▼' : '▶'}
      </button>

      {isExpanded && (
        <div
          className="border rounded p-4 max-h-64 overflow-y-auto"
          style={{
            borderColor: 'var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          {loading ? (
            <div
              className="text-center py-4"
              style={{ color: 'var(--text-muted)' }}
            >
              Loading equipment...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {availableEquipment.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center cursor-pointer"
                >
                  <input
                    type={choice.chooseCount === 1 ? 'radio' : 'checkbox'}
                    name={choice.chooseCount === 1 ? choice.id : undefined}
                    checked={currentSelections.includes(item.id)}
                    onChange={() => handleItemToggle(item.id)}
                    disabled={
                      !currentSelections.includes(item.id) &&
                      currentSelections.length >= choice.chooseCount
                    }
                    className="mr-3"
                  />
                  <span style={{ color: 'var(--text-primary)' }}>
                    {item.name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
