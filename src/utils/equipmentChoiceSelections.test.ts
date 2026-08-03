import { create } from '@bufbuild/protobuf';
import {
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSchema,
  EquipmentBundleSchema,
  EquipmentCategoryChoiceSchema,
  EquipmentOptionsSchema,
  EquipmentSelectionItemSchema,
  EquipmentSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { describe, expect, it } from 'vitest';
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

  it('keeps a legacy same-category duplicate invalid, including at final-submit gating', () => {
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
    ).toBe(false);
    expect(hasNoInvalidEquipmentChoices([declaredChoice], [persisted])).toBe(
      false
    );
  });
});
