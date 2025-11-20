import type { Equipment } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  Choice,
  EquipmentCategoryChoice,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  EquipmentType,
  WeaponCategory,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import * as Select from '@radix-ui/react-select';
import { Package, Shield, Sword } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useListEquipmentByType } from '../../api/hooks';
import { useEquipmentBundleSelection } from '../../hooks/useEquipmentBundleSelection';

interface EquipmentBundleChoiceProps {
  choice: Choice;
  onSelectionChange: (
    bundleId: string | null,
    categorySelections: Map<number, Equipment[]>
  ) => void;
}

// Helper to get icon for equipment type
function getEquipmentIcon(equipment: Equipment): React.ReactNode {
  if (!equipment.equipmentData) {
    return <Package className="w-4 h-4" />;
  }

  switch (equipment.equipmentData.case) {
    case 'weaponData':
      return <Sword className="w-4 h-4" />;
    case 'armorData':
      return <Shield className="w-4 h-4" />;
    default:
      return <Package className="w-4 h-4" />;
  }
}

// Component for selecting from a category
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
  const [expanded, setExpanded] = useState(false);
  const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentSelections.map((e) => e.id))
  );

  // Determine equipment types to fetch based on category
  const equipmentTypes = useCallback((): EquipmentType[] => {
    const types: EquipmentType[] = [];

    if (category.weaponCategories && category.weaponCategories.length > 0) {
      // Map weapon categories to equipment types
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
      // Add armor types based on categories
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

  // Fetch equipment when expanded - use the primary type
  const types = equipmentTypes();
  const primaryType = types[0] || EquipmentType.UNSPECIFIED;
  const { data: equipment } = useListEquipmentByType({
    equipmentType: primaryType,
    enabled: expanded && types.length > 0,
  });

  useEffect(() => {
    if (expanded && equipment) {
      setAvailableEquipment(equipment);
    }
  }, [expanded, equipment]);

  const handleToggleItem = (item: Equipment) => {
    const newSelected = new Set(selectedIds);

    if (newSelected.has(item.id)) {
      newSelected.delete(item.id);
    } else {
      // Check if we've reached the limit
      if (newSelected.size >= category.choose) {
        // Remove the oldest selection
        const first = newSelected.values().next().value;
        if (first) {
          newSelected.delete(first);
        }
      }
      newSelected.add(item.id);
    }

    setSelectedIds(newSelected);

    // Update parent with full Equipment objects
    const selectedEquipment = availableEquipment.filter((e) =>
      newSelected.has(e.id)
    );
    onSelect(categoryIndex, selectedEquipment);
  };

  // Use Radix Select for single choice, dropdown for multi-select
  if (category.choose === 1) {
    const selectedItem = availableEquipment.find((e) => selectedIds.has(e.id));

    return (
      <Select.Root
        value={selectedItem?.id || ''}
        onValueChange={(value) => {
          const item = availableEquipment.find((e) => e.id === value);
          if (item) {
            setSelectedIds(new Set([item.id]));
            onSelect(categoryIndex, [item]);
          }
        }}
        onOpenChange={(open) => setExpanded(open)}
      >
        <Select.Trigger
          className="w-full inline-flex items-center justify-between rounded px-4 py-3 text-sm font-medium border transition-colors focus:outline-none focus:ring-2"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <Select.Value placeholder={category.label || 'Select item'}>
            {selectedItem ? selectedItem.name : category.label || 'Select item'}
          </Select.Value>
          <Select.Icon className="ml-2">
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75605 9.60753 8.75605 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75605 5.10753 8.75605 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.26618 11.9026 7.38064 11.95 7.49999 11.95C7.61933 11.95 7.73379 11.9026 7.81819 11.8182L10.0682 9.56819Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="overflow-hidden rounded-lg border shadow-lg z-50"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
              boxShadow: 'var(--shadow-modal)',
              maxWidth: '400px',
            }}
          >
            <Select.Viewport className="p-2 max-h-80 overflow-y-auto">
              {availableEquipment.map((item) => (
                <Select.Item
                  key={item.id}
                  value={item.id}
                  className="relative flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer select-none hover:outline-none focus:outline-none transition-colors"
                  style={{
                    color: 'var(--text-primary)',
                    backgroundColor: selectedIds.has(item.id)
                      ? 'var(--accent-primary)'
                      : 'transparent',
                  }}
                >
                  <Select.ItemText>
                    <div className="flex items-center gap-2">
                      {getEquipmentIcon(item)}
                      <span>{item.name}</span>
                    </div>
                  </Select.ItemText>
                  <Select.ItemIndicator className="ml-auto">
                    ✓
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    );
  }

  // Multi-select fallback (keep existing expand/collapse for now)
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <div className="font-medium">
            {category.label || `Choose ${category.choose} item(s)`}
          </div>
          <div className="text-sm text-gray-500">
            {selectedIds.size} of {category.choose} selected
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {availableEquipment.map((item) => (
            <button
              key={item.id}
              onClick={() => handleToggleItem(item)}
              className={`w-full flex items-center gap-2 p-2 rounded text-left transition-colors ${
                selectedIds.has(item.id)
                  ? 'bg-blue-100 border-blue-500 border'
                  : 'hover:bg-gray-100 border-transparent border'
              }`}
            >
              {getEquipmentIcon(item)}
              <span className="flex-1">{item.name}</span>
              {selectedIds.has(item.id) && (
                <span className="text-blue-600 text-sm">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
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
      <div className="space-y-2">
        {bundles.map((bundle) => (
          <button
            key={bundle.id}
            onClick={() => handleBundleSelect(bundle.id)}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
              selectedBundleId === bundle.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-medium">{bundle.label}</div>
            {bundle.items.length > 0 && (
              <div className="text-sm text-gray-600 mt-1">
                Includes:{' '}
                {bundle.items.map((item) => item.selectionId).join(', ')}
              </div>
            )}
            {bundle.categoryChoices.length > 0 && (
              <div className="text-sm text-gray-600 mt-1">
                Plus choices from categories
              </div>
            )}
          </button>
        ))}
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
