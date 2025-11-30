import type { Equipment } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  Choice,
  EquipmentCategoryChoice,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  EquipmentType,
  WeaponCategory,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Package } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useListEquipmentByType } from '../../api/hooks';
import { useEquipmentBundleSelection } from '../../hooks/useEquipmentBundleSelection';

interface EquipmentBundleChoiceProps {
  choice: Choice;
  onSelectionChange: (
    bundleId: string | null,
    categorySelections: Map<number, Equipment[]>
  ) => void;
}

// Component for selecting from a category - supports multiple selections when choose > 1
function CategorySelector({
  category,
  categoryIndex,
  onSelect,
  currentSelections,
}: {
  category: EquipmentCategoryChoice;
  categoryIndex: number;
  onSelect: (categoryIndex: number, items: Equipment[]) => void;
  currentSelections: Equipment[];
}) {
  const chooseCount = category.choose || 1;

  // Track selections for each slot (when choose > 1)
  const [selectedBySlot, setSelectedBySlot] = useState<(string | null)[]>(() =>
    Array.from(
      { length: chooseCount },
      (_, i) => currentSelections[i]?.id ?? null
    )
  );

  // Determine equipment types to fetch based on category
  const equipmentTypes = useCallback((): EquipmentType[] => {
    const types: EquipmentType[] = [];

    if (category.weaponCategories && category.weaponCategories.length > 0) {
      category.weaponCategories.forEach((cat) => {
        if (cat === WeaponCategory.SIMPLE) {
          types.push(EquipmentType.SIMPLE_MELEE_WEAPON);
          types.push(EquipmentType.SIMPLE_RANGED_WEAPON);
        } else if (cat === WeaponCategory.MARTIAL) {
          types.push(EquipmentType.MARTIAL_MELEE_WEAPON);
          types.push(EquipmentType.MARTIAL_RANGED_WEAPON);
        }
      });
    }

    if (category.armorCategories && category.armorCategories.length > 0) {
      types.push(EquipmentType.LIGHT_ARMOR);
      types.push(EquipmentType.MEDIUM_ARMOR);
      types.push(EquipmentType.HEAVY_ARMOR);
      types.push(EquipmentType.SHIELD);
    }

    if (category.toolCategories && category.toolCategories.length > 0) {
      types.push(EquipmentType.TOOLS);
    }

    return types;
  }, [category]);

  // Fetch equipment - always enabled since we're not using expand/collapse
  const types = equipmentTypes();
  const primaryType = types[0] || EquipmentType.UNSPECIFIED;
  const { data: equipment } = useListEquipmentByType({
    equipmentType: primaryType,
    enabled: types.length > 0,
  });

  const handleSlotChange = (slotIndex: number, value: string) => {
    if (!equipment) return;

    const newSelectedBySlot = [...selectedBySlot];
    newSelectedBySlot[slotIndex] = value || null;
    setSelectedBySlot(newSelectedBySlot);

    // Gather all selected items and report back
    const selectedItems = newSelectedBySlot
      .filter((id): id is string => id !== null)
      .map((id) => equipment.find((e) => e.id === id))
      .filter((item): item is Equipment => item !== undefined);

    onSelect(categoryIndex, selectedItems);
  };

  const selectStyle = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-primary)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <label
        style={{
          display: 'block',
          marginBottom: '8px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontWeight: 'bold',
        }}
      >
        {category.label || `Choose ${chooseCount} item(s)`}:
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Array.from({ length: chooseCount }, (_, slotIndex) => (
          <select
            key={slotIndex}
            value={selectedBySlot[slotIndex] || ''}
            onChange={(e) => handleSlotChange(slotIndex, e.target.value)}
            style={selectStyle}
          >
            <option value="">
              -- Select {chooseCount > 1 ? `item ${slotIndex + 1}` : 'item'} --
            </option>
            {equipment?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}

export function EquipmentBundleChoice({
  choice,
  onSelectionChange,
}: EquipmentBundleChoiceProps) {
  const {
    selectedBundleId,
    categorySelections,
    selectBundle,
    selectCategoryItems,
    getSelectedBundle,
    isComplete,
  } = useEquipmentBundleSelection(choice);

  // Extract bundles from choice
  const bundles =
    choice.options?.case === 'equipmentOptions'
      ? choice.options.value.bundles
      : [];

  const selectedBundle = getSelectedBundle();

  // Handle bundle selection
  const handleBundleSelect = useCallback(
    (bundleId: string) => {
      selectBundle(bundleId);
      // Note: We only send the bundleId here, not the fixed items
      // The backend will look up bundle.items based on the bundleId
      onSelectionChange(bundleId, new Map());
    },
    [selectBundle, onSelectionChange]
  );

  // Handle category item selection
  const handleCategorySelect = useCallback(
    (categoryIndex: number, items: Equipment[]) => {
      selectCategoryItems(categoryIndex, items);
      const updatedSelections = new Map(categorySelections);
      updatedSelections.set(categoryIndex, items);
      onSelectionChange(selectedBundleId, updatedSelections);
    },
    [
      selectCategoryItems,
      onSelectionChange,
      selectedBundleId,
      categorySelections,
    ]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Package className="w-5 h-5 mt-0.5 text-amber-500" />
        <div className="flex-1">
          <h4 className="font-semibold text-base">
            {choice.description || 'Choose your equipment'}
          </h4>
        </div>
      </div>

      {/* Bundle selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {bundles.map((bundle, index) => {
          const isSelected = selectedBundleId === bundle.id;
          return (
            <button
              key={bundle.id}
              type="button"
              onClick={() => handleBundleSelect(bundle.id)}
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
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow =
                    '0 4px 12px rgba(0,0,0,0.2)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: '1' }}>
                {index === 0 ? '⚔️' : '🛡️'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold' }}>{bundle.label}</div>
                {bundle.items.length > 0 && (
                  <div
                    style={{
                      fontSize: '11px',
                      marginTop: '4px',
                      opacity: 0.8,
                    }}
                  >
                    Includes:{' '}
                    {bundle.items.map((item) => item.selectionId).join(', ')}
                  </div>
                )}
                {bundle.categoryChoices.length > 0 && (
                  <div
                    style={{
                      fontSize: '11px',
                      marginTop: '4px',
                      opacity: 0.8,
                    }}
                  >
                    Plus choices from categories
                  </div>
                )}
              </div>
              {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
            </button>
          );
        })}
      </div>

      {/* Category selections for selected bundle */}
      {selectedBundle && selectedBundle.categoryChoices.length > 0 && (
        <div className="space-y-3">
          <div className="font-medium">Complete your selection:</div>
          {selectedBundle.categoryChoices.map((category, index) => (
            <CategorySelector
              key={index}
              category={category}
              categoryIndex={index}
              onSelect={handleCategorySelect}
              currentSelections={categorySelections.get(index) || []}
            />
          ))}
        </div>
      )}

      {/* Completion status */}
      {selectedBundleId && (
        <div
          className={`p-3 rounded-lg text-sm ${
            isComplete()
              ? 'bg-green-100 text-green-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {isComplete()
            ? '✓ Equipment selection complete'
            : 'Please complete all category selections'}
        </div>
      )}
    </div>
  );
}
