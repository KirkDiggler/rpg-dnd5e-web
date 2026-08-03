import type {
  Choice,
  ChoiceData,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import type { EquipmentChoice } from '../types/choices';

function equipmentIds(choiceData: ChoiceData): string[] {
  if (choiceData.selection?.case !== 'equipment') return [];

  return choiceData.selection.value.items.flatMap((item) => {
    if (item.equipment?.case === 'otherEquipmentId') {
      return [item.equipment.value];
    }
    if (item.equipment?.case && item.equipment.value !== undefined) {
      return [String(item.equipment.value)];
    }
    return [];
  });
}

/**
 * Persisted equipment selection items are flat on the wire. Their category is
 * implied by the selected bundle: category choices appear in declaration order
 * and each consumes `choose` consecutive items.
 */
export function reconstructEquipmentChoice(
  choice: Choice,
  choiceData: ChoiceData
): EquipmentChoice {
  const ids = equipmentIds(choiceData);
  const bundle =
    choice.options?.case === 'equipmentOptions'
      ? choice.options.value.bundles.find(
          (candidate) => candidate.id === choiceData.optionId
        )
      : undefined;
  let offset = 0;

  return {
    choiceId: choiceData.choiceId,
    bundleId: choiceData.optionId,
    categorySelections: (bundle?.categoryChoices ?? []).map(
      (category, categoryIndex) => {
        const choose = category.choose || 1;
        const selection = ids.slice(offset, offset + choose);
        offset += choose;
        return { categoryIndex, equipmentIds: selection };
      }
    ),
  };
}

/** Mirrors the server's per-category duplicate rule without conflating IDs
 * that are independently eligible in different category choices. */
export function isCompleteEquipmentChoice(
  choice: Choice,
  selection: EquipmentChoice | undefined
): boolean {
  if (!selection || choice.options?.case !== 'equipmentOptions') return false;

  const bundle = choice.options.value.bundles.find(
    (candidate) => candidate.id === selection.bundleId
  );
  if (!bundle) return false;

  return bundle.categoryChoices.every((category, categoryIndex) => {
    const ids =
      selection.categorySelections.find(
        (item) => item.categoryIndex === categoryIndex
      )?.equipmentIds ?? [];
    return (
      ids.length === (category.choose || 1) && new Set(ids).size === ids.length
    );
  });
}

/** Validates only authoritative equipment choices that are present in a draft. */
export function hasNoInvalidEquipmentChoices(
  declaredChoices: readonly Choice[],
  persistedChoices: readonly ChoiceData[]
): boolean {
  return persistedChoices
    .filter((choiceData) => choiceData.category === ChoiceCategory.EQUIPMENT)
    .every((choiceData) => {
      const declaredChoice = declaredChoices.find(
        (choice) => choice.id === choiceData.choiceId
      );
      return (
        declaredChoice !== undefined &&
        isCompleteEquipmentChoice(
          declaredChoice,
          reconstructEquipmentChoice(declaredChoice, choiceData)
        )
      );
    });
}
