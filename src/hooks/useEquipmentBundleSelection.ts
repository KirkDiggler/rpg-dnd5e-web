import { create } from '@bufbuild/protobuf';
import type {
  Choice,
  ChoiceData,
  EquipmentBundle,
  EquipmentItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSource,
  EquipmentItemSchema,
  EquipmentSelectionItemSchema,
  EquipmentSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { useCallback, useState } from 'react';

export function useEquipmentBundleSelection(
  choice: Choice,
  initialBundleId?: string | null,
  initialCategoryItemIds?: ReadonlyMap<number, string[]>
) {
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(
    initialBundleId ?? null
  );
  // Reopened drafts encode each selection's category index. Preserve that
  // partition rather than collapsing every restored item into category 0.
  const [categorySelections, setCategorySelections] = useState<
    Map<number, EquipmentItem[]>
  >(
    () =>
      new Map(
        [...(initialCategoryItemIds ?? new Map<number, string[]>())].map(
          ([categoryIndex, selectionIds]) => [
            categoryIndex,
            selectionIds.map((selectionId) =>
              create(EquipmentItemSchema, { selectionId })
            ),
          ]
        )
      )
  );

  // When user selects a bundle
  const selectBundle = useCallback((bundleId: string) => {
    setSelectedBundleId(bundleId);
    setCategorySelections(new Map()); // Reset category selections when bundle changes
  }, []);

  // When user selects items from a category
  const selectCategoryItems = useCallback(
    (categoryIndex: number, items: EquipmentItem[]) => {
      setCategorySelections((prev) => {
        const updated = new Map(prev);
        updated.set(categoryIndex, items);
        return updated;
      });
    },
    []
  );

  // Helper to create EquipmentSelectionItem from an authoritative option.
  const createEquipmentSelectionItem = (equipment: EquipmentItem) => {
    // Since Weapon, Armor, etc. are enums (not message types),
    // we use otherEquipmentId for all equipment items
    // The backend knows what they are from the ID
    return create(EquipmentSelectionItemSchema, {
      equipment: {
        case: 'otherEquipmentId',
        value: equipment.selectionId,
      },
    });
  };

  // Convert to proto submission - only includes category selections!
  const toProtoSubmission = useCallback(
    (source: ChoiceSource): ChoiceData | null => {
      if (!selectedBundleId) {
        console.warn('No bundle selected for equipment choice');
        return null;
      }

      // Flatten all category selections into a single array
      const allSelectedItems: EquipmentItem[] = [];
      categorySelections.forEach((items) => {
        allSelectedItems.push(...items);
      });

      // Convert to proto items
      const protoItems = allSelectedItems.map(createEquipmentSelectionItem);

      return create(ChoiceDataSchema, {
        choiceId: choice.id,
        optionId: selectedBundleId, // Which bundle was selected
        category: ChoiceCategory.EQUIPMENT,
        source,
        selection: {
          case: 'equipment',
          value: create(EquipmentSelectionSchema, {
            items: protoItems,
          }),
        },
      });
    },
    [choice.id, selectedBundleId, categorySelections]
  );

  // Get the selected bundle object
  const getSelectedBundle = useCallback((): EquipmentBundle | null => {
    if (
      !selectedBundleId ||
      !choice.options ||
      choice.options.case !== 'equipmentOptions'
    ) {
      return null;
    }
    return (
      choice.options.value.bundles.find((b) => b.id === selectedBundleId) ||
      null
    );
  }, [choice, selectedBundleId]);

  // Check if all required category selections are made
  const isComplete = useCallback((): boolean => {
    const bundle = getSelectedBundle();
    if (!bundle) return false;

    // Check each category choice has the required selections
    return bundle.categoryChoices.every((category, index) => {
      const selections = categorySelections.get(index) || [];
      return selections.length >= category.choose;
    });
  }, [getSelectedBundle, categorySelections]);

  return {
    selectedBundleId,
    categorySelections,
    selectBundle,
    selectCategoryItems,
    toProtoSubmission,
    getSelectedBundle,
    isComplete,
  };
}
