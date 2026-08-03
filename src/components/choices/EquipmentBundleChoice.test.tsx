import { create } from '@bufbuild/protobuf';
import {
  ChoiceCategory,
  ChoiceSchema,
  EquipmentBundleSchema,
  EquipmentCategoryChoiceSchema,
  EquipmentItemSchema,
  EquipmentOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  DamageType,
  WeaponCategory,
  WeaponProperty,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { EquipmentSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/equipment_types_pb';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ listEquipmentByType: vi.fn() }));

vi.mock('../../api/client', () => ({
  characterClient: { listEquipmentByType: hoisted.listEquipmentByType },
}));

import { ChoiceRenderer } from '../ChoiceRenderer';
import { EquipmentBundleChoice } from './EquipmentBundleChoice';

const CLUB = create(EquipmentItemSchema, {
  selectionId: 'club-selection',
  quantity: 1,
  equipmentDetail: create(EquipmentSchema, {
    id: 'club',
    name: 'Club',
    equipmentData: {
      case: 'weaponData',
      value: {
        weaponCategory: WeaponCategory.SIMPLE,
        damageDice: '1d4',
        damageType: DamageType.BLUDGEONING,
        properties: [WeaponProperty.LIGHT],
      },
    },
  }),
});

const DART = create(EquipmentItemSchema, {
  selectionId: 'dart-selection',
  quantity: 1,
  equipmentDetail: create(EquipmentSchema, {
    id: 'dart',
    name: 'Dart',
    equipmentData: {
      case: 'weaponData',
      value: {
        weaponCategory: WeaponCategory.SIMPLE,
        damageDice: '1d4',
        damageType: DamageType.PIERCING,
        normalRange: 20,
        longRange: 60,
      },
    },
  }),
});

function choice({ choose = 1, options = [CLUB, DART] } = {}) {
  return create(ChoiceSchema, {
    id: 'monk-equipment',
    description: 'Choose your equipment',
    choiceType: ChoiceCategory.EQUIPMENT,
    options: {
      case: 'equipmentOptions',
      value: create(EquipmentOptionsSchema, {
        bundles: [
          create(EquipmentBundleSchema, {
            id: 'bundle-a',
            label: 'A weapon',
            categoryChoices: [
              create(EquipmentCategoryChoiceSchema, {
                choose,
                label: 'Choose a simple weapon',
                // Metadata remains available for display, but category.options
                // is the sole selection source.
                weaponCategories: [WeaponCategory.SIMPLE],
                options,
              }),
            ],
          }),
        ],
      }),
    },
  });
}

describe('EquipmentBundleChoice — authoritative category options (#690)', () => {
  it('renders API options in their supplied order with rich details and makes no list request', () => {
    render(
      <EquipmentBundleChoice choice={choice()} onSelectionChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText('A weapon'));
    fireEvent.click(screen.getByRole('combobox'));

    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Club'),
      expect.stringContaining('Dart'),
    ]);
    within(screen.getByRole('listbox')).getByText('1d4 bludgeoning', {
      exact: false,
    });
    within(screen.getByRole('listbox')).getByText('Range: 20/60 ft');
    expect(hoisted.listEquipmentByType).not.toHaveBeenCalled();
  });

  it('submits the authoritative selection ID, not the equipment detail ID', () => {
    const onSelectionChange = vi.fn();
    render(
      <EquipmentBundleChoice
        choice={choice()}
        onSelectionChange={onSelectionChange}
      />
    );
    fireEvent.click(screen.getByText('A weapon'));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(
      within(screen.getByRole('listbox')).getByTestId(
        'equipment-category-0-slot-0-option-dart-selection'
      )
    );

    expect(onSelectionChange).toHaveBeenLastCalledWith(
      'bundle-a',
      new Map([[0, [DART]]])
    );
  });

  it('disables an already selected option in sibling slots to prevent pointer duplicates', () => {
    const onSelectionChange = vi.fn();
    render(
      <EquipmentBundleChoice
        choice={choice({ choose: 2 })}
        onSelectionChange={onSelectionChange}
      />
    );
    fireEvent.click(screen.getByText('A weapon'));

    const [first, second] = screen.getAllByRole('combobox');
    fireEvent.click(first);
    fireEvent.click(
      within(screen.getByRole('listbox')).getByTestId(
        'equipment-category-0-slot-0-option-club-selection'
      )
    );
    fireEvent.click(second);

    const duplicate = within(screen.getByRole('listbox')).getByTestId(
      'equipment-category-0-slot-1-option-club-selection'
    );
    expect(duplicate.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(duplicate);

    expect(onSelectionChange).toHaveBeenLastCalledWith(
      'bundle-a',
      new Map([[0, [CLUB]]])
    );
  });

  it('skips a sibling-held option when selected by keyboard', () => {
    const onSelectionChange = vi.fn();
    render(
      <EquipmentBundleChoice
        choice={choice({ choose: 2 })}
        onSelectionChange={onSelectionChange}
      />
    );
    fireEvent.click(screen.getByText('A weapon'));
    const [first, second] = screen.getAllByRole('combobox');

    fireEvent.click(first);
    fireEvent.click(
      within(screen.getByRole('listbox')).getByTestId(
        'equipment-category-0-slot-0-option-club-selection'
      )
    );

    second.focus();
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(second.getAttribute('aria-activedescendant')).toBe(
      'equipment-category-0-slot-1-option-dart-selection'
    );
    fireEvent.keyDown(second, { key: 'Enter' });

    expect(onSelectionChange).toHaveBeenLastCalledWith(
      'bundle-a',
      new Map([[0, [CLUB, DART]]])
    );
  });

  it('re-enables an old option after its sibling changes selection', () => {
    render(
      <EquipmentBundleChoice
        choice={choice({ choose: 2 })}
        onSelectionChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('A weapon'));
    const [first, second] = screen.getAllByRole('combobox');

    fireEvent.click(first);
    fireEvent.click(
      within(screen.getByRole('listbox')).getByTestId(
        'equipment-category-0-slot-0-option-club-selection'
      )
    );
    fireEvent.click(second);
    expect(
      within(screen.getByRole('listbox'))
        .getByTestId('equipment-category-0-slot-1-option-club-selection')
        .getAttribute('aria-disabled')
    ).toBe('true');
    fireEvent.keyDown(second, { key: 'Escape' });

    fireEvent.click(first);
    fireEvent.click(
      within(screen.getByRole('listbox')).getByTestId(
        'equipment-category-0-slot-0-option-dart-selection'
      )
    );
    fireEvent.click(second);
    expect(
      within(screen.getByRole('listbox'))
        .getByTestId('equipment-category-0-slot-1-option-club-selection')
        .getAttribute('aria-disabled')
    ).toBeNull();
  });

  it('surfaces legacy hydrated duplicate values and requires correction', () => {
    render(
      <EquipmentBundleChoice
        choice={choice({ choose: 2 })}
        initialBundleId="bundle-a"
        initialCategoryItemIds={
          new Map([[0, ['club-selection', 'club-selection']]])
        }
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByRole('alert').textContent).toMatch(/different item/i);
    expect(
      screen.getByText(/Please complete all category selections/)
    ).toBeTruthy();
  });

  it('hydrates a reopened selection by authoritative selection ID', () => {
    render(
      <EquipmentBundleChoice
        choice={choice()}
        initialBundleId="bundle-a"
        initialCategoryItemIds={new Map([[0, ['dart-selection']]])}
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox').textContent).toMatch(/Dart/);
    expect(screen.getByText(/Equipment selection complete/)).toBeTruthy();
  });

  it('rehydrates indexed multi-category selections into their matching categories', () => {
    const multiCategoryChoice = create(ChoiceSchema, {
      id: 'multi-category-equipment',
      choiceType: ChoiceCategory.EQUIPMENT,
      options: {
        case: 'equipmentOptions',
        value: create(EquipmentOptionsSchema, {
          bundles: [
            create(EquipmentBundleSchema, {
              id: 'bundle-a',
              label: 'Two categories',
              categoryChoices: [
                create(EquipmentCategoryChoiceSchema, {
                  choose: 1,
                  label: 'First weapon',
                  options: [CLUB],
                }),
                create(EquipmentCategoryChoiceSchema, {
                  choose: 1,
                  label: 'Second weapon',
                  // The toolkit scopes duplicate validation to each category
                  // requirement, so this independent category may also offer Club.
                  options: [CLUB],
                }),
              ],
            }),
          ],
        }),
      },
    });

    render(
      <ChoiceRenderer
        choice={multiCategoryChoice}
        currentSelections={[
          'bundle-a',
          'cat0:club-selection:Club',
          'cat1:club-selection:Club',
        ]}
        onSelectionChange={vi.fn()}
      />
    );

    // These separate category slots make a category-0 collapse observable:
    // the old hydration showed no saved item in the second category.
    expect(
      screen.getByRole('combobox', { name: 'First weapon' }).textContent
    ).toMatch(/Club/);
    expect(
      screen.getByRole('combobox', { name: 'Second weapon' }).textContent
    ).toMatch(/Club/);
    expect(screen.getByText(/Equipment selection complete/)).toBeTruthy();
  });
});
