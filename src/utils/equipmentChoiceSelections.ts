import type {
  Choice,
  ChoiceData,
  EquipmentItem,
  EquipmentSelectionItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import type { EquipmentChoice } from '../types/choices';

function persistedEquipmentItems(
  choiceData: ChoiceData
): readonly EquipmentSelectionItem[] {
  return choiceData.selection?.case === 'equipment'
    ? choiceData.selection.value.items
    : [];
}

/**
 * Resolves one persisted wire item back to the authoritative `selectionId`
 * a category's `options` declare for it.
 *
 * The wire has two shapes (see rpg-api `convertEquipmentSelectionToProto` /
 * `setEquipmentItemTypeHint`): an item the toolkit can't enumerate is sent as
 * `other_equipment_id`, the raw toolkit SelectionID string, used as-is. An
 * item the toolkit *does* enumerate (weapon/armor/tool/pack/ammunition) is
 * sent as that proto enum value instead — which is not the selection ID
 * (e.g. `Weapon.LONGSWORD` on the wire, not the string `"longsword"`). The
 * only place that enum reliably maps back to a selection ID is this
 * category's own authoritative `options`: each option's `typeHint` was
 * populated server-side by the exact same ID -> enum tables used to build
 * the persisted item, so matching (case, value) against `options` recovers
 * the real ID without the client duplicating those tables. An item that
 * matches nothing in `options` is unresolved and dropped, which correctly
 * leaves the category incomplete rather than fabricating a selection.
 */
function resolveCategorySelectionId(
  item: EquipmentSelectionItem,
  options: readonly EquipmentItem[]
): string | undefined {
  if (!item.equipment?.case) return undefined;
  if (item.equipment.case === 'otherEquipmentId') {
    return item.equipment.value;
  }
  const match = options.find(
    (option) =>
      option.typeHint.case === item.equipment.case &&
      option.typeHint.value === item.equipment.value
  );
  return match?.selectionId;
}

/**
 * Persisted equipment selection items are flat on the wire, and that flat
 * order is the toolkit's own build order (`Draft.buildEquipmentList`): the
 * selected bundle's fixed `items` first, then each category's selections in
 * category-declaration order (`Draft.validateCategorySelections`). Hydration
 * must skip past the fixed-item count before slicing category selections —
 * starting the slice at zero silently reads shifted data on any bundle that
 * has fixed items in addition to a category choice.
 *
 * Anything left over after the fixed items and every declared category have
 * consumed their slice is data this reconstruction can't account for (a
 * stale bundle/category mismatch, schema drift, or corruption) and is
 * surfaced via `hasUnconsumedItems` rather than silently dropped.
 */
export function reconstructEquipmentChoice(
  choice: Choice,
  choiceData: ChoiceData
): EquipmentChoice {
  const items = persistedEquipmentItems(choiceData);
  const bundle =
    choice.options?.case === 'equipmentOptions'
      ? choice.options.value.bundles.find(
          (candidate) => candidate.id === choiceData.optionId
        )
      : undefined;

  let offset = bundle?.items.length ?? 0;

  const categorySelections = (bundle?.categoryChoices ?? []).map(
    (category, categoryIndex) => {
      const choose = category.choose || 1;
      const slice = items.slice(offset, offset + choose);
      offset += choose;
      const equipmentIds = slice
        .map((item) => resolveCategorySelectionId(item, category.options))
        .filter((id): id is string => id !== undefined);
      return { categoryIndex, equipmentIds };
    }
  );

  return {
    choiceId: choiceData.choiceId,
    bundleId: choiceData.optionId,
    categorySelections,
    hasUnconsumedItems: offset < items.length,
  };
}

/** Requires each equipment category's declared count. Repeated authoritative
 * selection IDs remain ordered, valid entries in that count. */
export function isCompleteEquipmentChoice(
  choice: Choice,
  selection: EquipmentChoice | undefined
): boolean {
  if (!selection || choice.options?.case !== 'equipmentOptions') return false;
  // Persisted data this reconstruction couldn't fully account for must never
  // read as a legitimately-complete choice.
  if (selection.hasUnconsumedItems) return false;

  const bundle = choice.options.value.bundles.find(
    (candidate) => candidate.id === selection.bundleId
  );
  if (!bundle) return false;

  return bundle.categoryChoices.every((category, categoryIndex) => {
    const ids =
      selection.categorySelections.find(
        (item) => item.categoryIndex === categoryIndex
      )?.equipmentIds ?? [];
    return ids.length === (category.choose || 1);
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
