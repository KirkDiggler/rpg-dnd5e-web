import type {
  Choice,
  EquipmentCategoryChoice,
  EquipmentItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Package } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useEquipmentBundleSelection } from '../../hooks/useEquipmentBundleSelection';
import { EquipmentCard } from '../equipment/EquipmentCard';
import { EquipmentCategoryDropdown } from '../equipment/EquipmentCategoryDropdown';

interface EquipmentBundleChoiceProps {
  choice: Choice;
  onSelectionChange: (
    bundleId: string | null,
    categorySelections: Map<number, EquipmentItem[]>
  ) => void;
  initialBundleId?: string | null;
  /** Reopened selections, partitioned by their persisted category index. */
  initialCategoryItemIds?: ReadonlyMap<number, string[]>;
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
  onSelect: (categoryIndex: number, items: EquipmentItem[]) => void;
  currentSelections: EquipmentItem[];
}) {
  const chooseCount = category.choose || 1;
  const options = category.options;

  // Track selections for each slot (when choose > 1).
  const [selectedBySlot, setSelectedBySlot] = useState<(string | null)[]>(() =>
    Array.from(
      { length: chooseCount },
      (_, i) => currentSelections[i]?.selectionId ?? null
    )
  );

  const handleSlotChange = (slotIndex: number, value: string) => {
    const newSelectedBySlot = [...selectedBySlot];
    newSelectedBySlot[slotIndex] = value || null;
    setSelectedBySlot(newSelectedBySlot);

    // Keep the API's selection IDs and ordered option objects intact.
    const selectedItems = newSelectedBySlot
      .filter((id): id is string => id !== null)
      .map((id) => options.find((option) => option.selectionId === id))
      .filter((item): item is EquipmentItem => item !== undefined);

    onSelect(categoryIndex, selectedItems);
  };

  // Check for duplicate selections across slots
  const hasDuplicates = (() => {
    const selectedIds = selectedBySlot.filter(
      (id): id is string => id !== null
    );
    return new Set(selectedIds).size !== selectedIds.length;
  })();

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
        {Array.from({ length: chooseCount }, (_, slotIndex) => {
          const selectedItem = selectedBySlot[slotIndex]
            ? options.find(
                (option) => option.selectionId === selectedBySlot[slotIndex]
              )
            : undefined;
          const slotLabel =
            chooseCount > 1
              ? `${category.label || 'equipment'} — item ${slotIndex + 1}`
              : category.label || 'Choose item';

          return (
            <div key={slotIndex}>
              <EquipmentCategoryDropdown
                id={`equipment-category-${categoryIndex}-slot-${slotIndex}`}
                ariaLabel={slotLabel}
                placeholder={`-- Select ${
                  chooseCount > 1 ? `item ${slotIndex + 1}` : 'item'
                } --`}
                options={options}
                selectedId={selectedBySlot[slotIndex]}
                onChange={(value) => handleSlotChange(slotIndex, value)}
              />
              {selectedItem && (
                <div style={{ marginTop: '6px' }}>
                  <EquipmentCard
                    equipment={selectedItem.equipmentDetail!}
                    compact
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hasDuplicates && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid var(--border-primary)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          ⚠️ Same item selected multiple times (allowed for dual-wielding)
        </div>
      )}
    </div>
  );
}

export function EquipmentBundleChoice({
  choice,
  onSelectionChange,
  initialBundleId,
  initialCategoryItemIds,
}: EquipmentBundleChoiceProps) {
  const {
    selectedBundleId,
    categorySelections,
    selectBundle,
    selectCategoryItems,
    getSelectedBundle,
    isComplete,
  } = useEquipmentBundleSelection(
    choice,
    initialBundleId,
    initialCategoryItemIds
  );

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
    (categoryIndex: number, items: EquipmentItem[]) => {
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
                    {bundle.items
                      .map(
                        (item) => item.equipmentDetail?.name ?? item.selectionId
                      )
                      .join(', ')}
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

      {/* Equipment details for selected bundle's fixed items */}
      {selectedBundle &&
        selectedBundle.items.some((item) => item.equipmentDetail) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {selectedBundle.items.map(
              (item) =>
                item.equipmentDetail && (
                  <EquipmentCard
                    key={item.selectionId}
                    equipment={item.equipmentDetail}
                    compact
                  />
                )
            )}
          </div>
        )}

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
