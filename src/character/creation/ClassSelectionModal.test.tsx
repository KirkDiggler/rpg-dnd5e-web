import { create } from '@bufbuild/protobuf';
import {
  ClassInfoSchema,
  SubclassInfoSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSchema,
  EquipmentBundleSchema,
  EquipmentCategoryChoiceSchema,
  EquipmentOptionsSchema,
  SpellOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  Class,
  Subclass,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
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

describe('which classes the modal offers', () => {
  /** The server returns every class; the modal shows the ones with behaviour
   * at level 1. */
  function withClasses() {
    hoisted.useListClasses.mockReturnValue({
      data: [
        create(ClassInfoSchema, { classId: Class.FIGHTER, name: 'Fighter' }),
        create(ClassInfoSchema, { classId: Class.BARD, name: 'Bard' }),
        create(ClassInfoSchema, { classId: Class.WIZARD, name: 'Wizard' }),
      ],
      loading: false,
      error: null,
    });
  }

  it('offers the bard, and still withholds a class with nothing to do', () => {
    withClasses();
    render(<ClassSelectionModal isOpen onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByText('Bard')).toBeTruthy();
    expect(screen.queryByText('Wizard')).toBeNull();
  });

  it('selects the bard and hands its class id back', () => {
    withClasses();
    const onSelect = vi.fn();
    render(
      <ClassSelectionModal isOpen onClose={vi.fn()} onSelect={onSelect} />
    );

    fireEvent.click(screen.getByText('Bard'));
    fireEvent.click(screen.getByRole('button', { name: /^Select Bard$/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].classId).toBe(Class.BARD);
  });
});

describe('Nature separate cantrip choices', () => {
  function renderNature(
    bonus: string[],
    base = ['guidance', 'light', 'sacred-flame']
  ) {
    const refs = (ids: string[]) => ids.map((id) => `dnd5e:spells:${id}`);
    const main = create(ChoiceSchema, {
      id: 'cleric-cantrips',
      description: 'Cleric cantrips',
      choiceType: ChoiceCategory.CANTRIPS,
      chooseCount: 3,
      options: {
        case: 'spellOptions',
        value: create(SpellOptionsSchema, { availableRefs: refs(base) }),
      },
    });
    const extra = create(ChoiceSchema, {
      id: 'nature-cantrip',
      description: 'Druid cantrip',
      choiceType: ChoiceCategory.CANTRIPS,
      chooseCount: 1,
      options: {
        case: 'spellOptions',
        value: create(SpellOptionsSchema, {
          availableRefs: refs(['guidance', 'thorn-whip']),
        }),
      },
    });
    hoisted.useListClasses.mockReturnValue({
      data: [
        create(ClassInfoSchema, {
          classId: Class.CLERIC,
          name: 'Cleric',
          choices: [main],
          subclasses: [
            create(SubclassInfoSchema, {
              subclassId: Subclass.NATURE_DOMAIN,
              name: 'Nature Domain',
              additionalChoices: [extra],
            }),
          ],
        }),
      ],
      loading: false,
      error: null,
    });
    const onSelect = vi.fn();
    render(
      <ClassSelectionModal
        isOpen
        currentClass="Cleric"
        currentSubclass={Subclass.NATURE_DOMAIN}
        existingChoices={{
          cantrips: [
            { choiceId: main.id, spellRefs: refs(base) },
            { choiceId: extra.id, spellRefs: refs(bonus) },
          ],
        }}
        onClose={vi.fn()}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Select / }));
    return onSelect;
  }
  it('preserves both requirement IDs on submission', () => {
    const onSelect = renderNature(['thorn-whip']);
    expect(onSelect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cantrips: [
          {
            choiceId: 'cleric-cantrips',
            spellRefs: [
              'dnd5e:spells:guidance',
              'dnd5e:spells:light',
              'dnd5e:spells:sacred-flame',
            ],
          },
          {
            choiceId: 'nature-cantrip',
            spellRefs: ['dnd5e:spells:thorn-whip'],
          },
        ],
      })
    );
  });
  it('rejects a duplicate shared spell restored from a draft', () => {
    expect(renderNature(['guidance'])).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Each cantrip can only be selected once/)
    ).toBeTruthy();
  });
  it('requires the separate bonus choice', () => {
    expect(renderNature([])).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Please select 1 cantrip: Druid cantrip/)
    ).toBeTruthy();
  });
});
