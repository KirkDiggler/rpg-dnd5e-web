import { create } from '@bufbuild/protobuf';
import { ClassInfoSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSchema,
  EquipmentBundleSchema,
  EquipmentCategoryChoiceSchema,
  EquipmentOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClassSelectionModal } from './ClassSelectionModal';

const hoisted = vi.hoisted(() => ({
  useListClasses: vi.fn(),
}));

vi.mock('../../api/hooks', () => ({
  useListClasses: hoisted.useListClasses,
}));

vi.mock('../../components/ChoiceRenderer', () => ({
  ChoiceRenderer: () => null,
}));

describe('ClassSelectionModal equipment validation', () => {
  it('asks for complete categories without claiming selections must differ', () => {
    const equipmentChoice = create(ChoiceSchema, {
      id: 'fighter-starting-equipment',
      description: 'Choose two weapons',
      choiceType: ChoiceCategory.EQUIPMENT,
      options: {
        case: 'equipmentOptions',
        value: create(EquipmentOptionsSchema, {
          bundles: [
            create(EquipmentBundleSchema, {
              id: 'fighter-pack-a',
              categoryChoices: [
                create(EquipmentCategoryChoiceSchema, { choose: 2 }),
              ],
            }),
          ],
        }),
      },
    });
    hoisted.useListClasses.mockReturnValue({
      data: [
        create(ClassInfoSchema, {
          classId: Class.FIGHTER,
          name: 'Fighter',
          choices: [equipmentChoice],
        }),
      ],
      loading: false,
      error: null,
    });

    render(<ClassSelectionModal isOpen onClose={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Select Fighter$/ }));

    expect(
      screen.getByText(
        'Please complete each equipment category: Choose two weapons'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/different items/i)).toBeNull();
  });
});
