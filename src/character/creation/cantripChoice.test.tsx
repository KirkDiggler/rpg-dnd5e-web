/**
 * The cantrip picker, from the grid to the submitted refs.
 *
 * THE SAME CONTROL THE SKILLS USE. A choose-2 cantrip requirement gets the
 * grouped checkbox grid because the COUNT picks the layout, not the category
 * (`EnumChoice`) — the fix slice one made after a working choose-three read as
 * a single-select on Kirk's walk. There is no cantrip modal and no second
 * save: the refs ride the one UpdateClass call every other class choice rides
 * (design rpg-project#405, §10).
 *
 * REFS, NEVER THE ENUM. `SpellOptions.available` is deprecated and no producer
 * writes it; `available_refs` is read and `spell_refs` is written (R8).
 */
import { create } from '@bufbuild/protobuf';
import { ClassInfoSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSchema,
  SpellOptionsSchema,
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

/** The eleven bard cantrips, as the toolkit's own catalog spells them. */
const BARD_CANTRIP_REFS = [
  'dnd5e:spells:blade-ward',
  'dnd5e:spells:dancing-lights',
  'dnd5e:spells:friends',
  'dnd5e:spells:light',
  'dnd5e:spells:mage-hand',
  'dnd5e:spells:mending',
  'dnd5e:spells:message',
  'dnd5e:spells:minor-illusion',
  'dnd5e:spells:prestidigitation',
  'dnd5e:spells:true-strike',
  'dnd5e:spells:vicious-mockery',
];

function cantripChoice() {
  return create(ChoiceSchema, {
    id: 'bard-cantrips-1',
    description: 'Choose 2 cantrips',
    chooseCount: 2,
    choiceType: ChoiceCategory.CANTRIPS,
    options: {
      case: 'spellOptions',
      value: create(SpellOptionsSchema, {
        availableRefs: BARD_CANTRIP_REFS,
        spellLevel: 0,
      }),
    },
  });
}

function renderBard(onSelect = vi.fn()) {
  hoisted.useListClasses.mockReturnValue({
    data: [
      create(ClassInfoSchema, {
        classId: Class.BARD,
        name: 'Bard',
        choices: [cantripChoice()],
      }),
    ],
    loading: false,
    error: null,
  });
  render(<ClassSelectionModal isOpen onClose={vi.fn()} onSelect={onSelect} />);
  // The carousel names the class in more than one place; the card is the
  // first, and clicking it is what selects the class.
  fireEvent.click(screen.getAllByText('Bard')[0]!);
  return onSelect;
}

describe('the cantrip grid', () => {
  it('offers every cantrip, titled from its ref', () => {
    renderBard();

    expect(screen.getByText('Choose Your Cantrips')).toBeTruthy();
    expect(screen.getByText('Vicious Mockery')).toBeTruthy();
    expect(screen.getByText('True Strike')).toBeTruthy();
    expect(screen.getByText('Minor Illusion')).toBeTruthy();
  });

  it('counts the picks, and is a multi-pick rather than a single-select', () => {
    renderBard();

    // The choose-many affordance the count drives: a running tally, and a
    // second pick that ADDS rather than replaces the first.
    expect(screen.getByText('(0/2 selected)')).toBeTruthy();

    fireEvent.click(screen.getByText('Vicious Mockery'));
    expect(screen.getByText('(1/2 selected)')).toBeTruthy();

    fireEvent.click(screen.getByText('True Strike'));
    expect(screen.getByText('(2/2 selected)')).toBeTruthy();
  });

  it('refuses a third pick once the count is met', () => {
    renderBard();

    fireEvent.click(screen.getByText('Vicious Mockery'));
    fireEvent.click(screen.getByText('True Strike'));
    fireEvent.click(screen.getByText('Mage Hand'));

    expect(screen.getByText('(2/2 selected)')).toBeTruthy();
  });
});

describe('submitting the class', () => {
  it('hands back the two chosen refs on the one class choice', () => {
    const onSelect = renderBard();

    fireEvent.click(screen.getByText('Vicious Mockery'));
    fireEvent.click(screen.getByText('True Strike'));
    fireEvent.click(screen.getByRole('button', { name: /^Select Bard$/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![1].cantrips).toEqual([
      {
        choiceId: 'bard-cantrips-1',
        spellRefs: ['dnd5e:spells:vicious-mockery', 'dnd5e:spells:true-strike'],
      },
    ]);
  });

  it('refuses to finish with one cantrip chosen', () => {
    const onSelect = renderBard();

    fireEvent.click(screen.getByText('Vicious Mockery'));
    fireEvent.click(screen.getByRole('button', { name: /^Select Bard$/ }));

    expect(
      screen.getByText('Please select 2 cantrips: Choose 2 cantrips')
    ).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('refuses to finish with none chosen', () => {
    const onSelect = renderBard();

    fireEvent.click(screen.getByRole('button', { name: /^Select Bard$/ }));

    expect(
      screen.getByText('Please select 2 cantrips: Choose 2 cantrips')
    ).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
