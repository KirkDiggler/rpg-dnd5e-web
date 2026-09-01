import { create } from '@bufbuild/protobuf';
import {
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSchema,
  ChoiceSource,
  EquipmentBundleSchema,
  EquipmentCategoryChoiceSchema,
  EquipmentItemSchema,
  EquipmentOptionsSchema,
  EquipmentSelectionItemSchema,
  EquipmentSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  Armor,
  Weapon,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import { convertEquipmentChoiceToProto } from './choiceConverter';
import {
  hasNoInvalidEquipmentChoices,
  isCompleteEquipmentChoice,
  reconstructEquipmentChoice,
} from './equipmentChoiceSelections';

const declaredChoice = create(ChoiceSchema, {
  id: 'fighter-starting-equipment',
  choiceType: ChoiceCategory.EQUIPMENT,
  options: {
    case: 'equipmentOptions',
    value: create(EquipmentOptionsSchema, {
      bundles: [
        create(EquipmentBundleSchema, {
          id: 'fighter-pack-a',
          categoryChoices: [
            create(EquipmentCategoryChoiceSchema, { choose: 2 }),
            create(EquipmentCategoryChoiceSchema, { choose: 1 }),
          ],
        }),
      ],
    }),
  },
});

function persistedDraftChoice(ids: string[]) {
  return create(ChoiceDataSchema, {
    choiceId: 'fighter-starting-equipment',
    optionId: 'fighter-pack-a',
    category: ChoiceCategory.EQUIPMENT,
    selection: {
      case: 'equipment',
      value: create(EquipmentSelectionSchema, {
        items: ids.map((id) =>
          create(EquipmentSelectionItemSchema, {
            equipment: { case: 'otherEquipmentId', value: id },
          })
        ),
      }),
    },
  });
}

describe('persisted equipment-choice hydration', () => {
  it('reconstructs declared category slices from the real flat persisted shape', () => {
    const persisted = persistedDraftChoice([
      'longsword-selection',
      'shield-selection',
      'longsword-selection',
    ]);

    const reconstructed = reconstructEquipmentChoice(declaredChoice, persisted);

    expect(reconstructed.categorySelections).toEqual([
      {
        categoryIndex: 0,
        equipmentIds: ['longsword-selection', 'shield-selection'],
      },
      { categoryIndex: 1, equipmentIds: ['longsword-selection'] },
    ]);
    // The same ID remains legitimate when the authoritative bundle declares it
    // in distinct category requirements.
    expect(isCompleteEquipmentChoice(declaredChoice, reconstructed)).toBe(true);
  });

  it('accepts a repeated same-category ID by declared count, including at final-submit gating', () => {
    const persisted = persistedDraftChoice([
      'longsword-selection',
      'longsword-selection',
      'shield-selection',
    ]);

    expect(
      isCompleteEquipmentChoice(
        declaredChoice,
        reconstructEquipmentChoice(declaredChoice, persisted)
      )
    ).toBe(true);
    expect(hasNoInvalidEquipmentChoices([declaredChoice], [persisted])).toBe(
      true
    );
  });
});

describe('persisted mixed-bundle round trip (fixed item + enum-backed categories)', () => {
  // The real wire shape from rpg-api: a fixed bundle item and toolkit-
  // enumerated category selections are never `other_equipment_id` — they
  // carry the same proto enum the API attaches to that item's `typeHint`
  // (rpg-api converters.go `setEquipmentItemTypeHint` /
  // `convertEquipmentSelectionToProto`). `shield`/`longsword`/`javelin` are
  // real toolkit equipment IDs; `Armor.SHIELD` / `Weapon.LONGSWORD` /
  // `Weapon.JAVELIN` are their real proto enum values.
  const mixedBundle = create(EquipmentBundleSchema, {
    id: 'fighter-pack-a',
    items: [
      create(EquipmentItemSchema, {
        selectionId: 'shield',
        typeHint: { case: 'armor', value: Armor.SHIELD },
      }),
    ],
    categoryChoices: [
      create(EquipmentCategoryChoiceSchema, {
        choose: 1,
        options: [
          create(EquipmentItemSchema, {
            selectionId: 'longsword',
            typeHint: { case: 'weapon', value: Weapon.LONGSWORD },
          }),
        ],
      }),
      create(EquipmentCategoryChoiceSchema, {
        choose: 1,
        options: [
          create(EquipmentItemSchema, {
            selectionId: 'javelin',
            typeHint: { case: 'weapon', value: Weapon.JAVELIN },
          }),
        ],
      }),
    ],
  });

  const declaredMixedChoice = create(ChoiceSchema, {
    id: 'fighter-starting-equipment',
    choiceType: ChoiceCategory.EQUIPMENT,
    options: {
      case: 'equipmentOptions',
      value: create(EquipmentOptionsSchema, { bundles: [mixedBundle] }),
    },
  });

  function persistedMixedChoice(
    trailingExtra: readonly ('weapon' | 'armor')[] = []
  ) {
    return create(ChoiceDataSchema, {
      choiceId: 'fighter-starting-equipment',
      optionId: 'fighter-pack-a',
      category: ChoiceCategory.EQUIPMENT,
      selection: {
        case: 'equipment',
        value: create(EquipmentSelectionSchema, {
          items: [
            // Fixed bundle item first — the toolkit's own build order.
            create(EquipmentSelectionItemSchema, {
              equipment: { case: 'armor', value: Armor.SHIELD },
            }),
            create(EquipmentSelectionItemSchema, {
              equipment: { case: 'weapon', value: Weapon.LONGSWORD },
            }),
            create(EquipmentSelectionItemSchema, {
              equipment: { case: 'weapon', value: Weapon.JAVELIN },
            }),
            ...trailingExtra.map((kind) =>
              create(EquipmentSelectionItemSchema, {
                equipment:
                  kind === 'weapon'
                    ? { case: 'weapon', value: Weapon.DAGGER }
                    : { case: 'armor', value: Armor.PADDED },
              })
            ),
          ],
        }),
      },
    });
  }

  it('offsets category slicing past the fixed item and resolves each enum-backed selection to its authoritative ID, at the declared category index', () => {
    const persisted = persistedMixedChoice();

    const reconstructed = reconstructEquipmentChoice(
      declaredMixedChoice,
      persisted
    );

    expect(reconstructed.categorySelections).toEqual([
      { categoryIndex: 0, equipmentIds: ['longsword'] },
      { categoryIndex: 1, equipmentIds: ['javelin'] },
    ]);
    expect(reconstructed.hasUnconsumedItems).toBe(false);
    expect(isCompleteEquipmentChoice(declaredMixedChoice, reconstructed)).toBe(
      true
    );
  });

  it('reserializes the hydrated selection back to submission wire format, category-only and index-correct', () => {
    const reconstructed = reconstructEquipmentChoice(
      declaredMixedChoice,
      persistedMixedChoice()
    );

    const resubmitted = convertEquipmentChoiceToProto(
      reconstructed,
      ChoiceSource.CLASS
    );

    expect(resubmitted.optionId).toBe('fighter-pack-a');
    expect(resubmitted.selection).toEqual({
      case: 'equipment',
      value: create(EquipmentSelectionSchema, {
        items: [
          create(EquipmentSelectionItemSchema, {
            equipment: { case: 'otherEquipmentId', value: 'longsword' },
            quantity: 1,
          }),
          create(EquipmentSelectionItemSchema, {
            equipment: { case: 'otherEquipmentId', value: 'javelin' },
            quantity: 1,
          }),
        ],
      }),
    });
  });

  it('rejects unconsumed trailing persisted items instead of silently finalizing invalid data', () => {
    const persisted = persistedMixedChoice(['weapon']);

    const reconstructed = reconstructEquipmentChoice(
      declaredMixedChoice,
      persisted
    );

    // The declared categories still resolve correctly — the corruption is
    // purely the extra trailing item this reconstruction can't account for.
    expect(reconstructed.categorySelections).toEqual([
      { categoryIndex: 0, equipmentIds: ['longsword'] },
      { categoryIndex: 1, equipmentIds: ['javelin'] },
    ]);
    expect(reconstructed.hasUnconsumedItems).toBe(true);
    expect(isCompleteEquipmentChoice(declaredMixedChoice, reconstructed)).toBe(
      false
    );
    expect(
      hasNoInvalidEquipmentChoices([declaredMixedChoice], [persisted])
    ).toBe(false);
  });
});
