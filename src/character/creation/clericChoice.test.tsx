import { create } from '@bufbuild/protobuf';
import {
  ClassInfoSchema,
  SubclassInfoSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSchema,
  SpellOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  Class,
  Subclass,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassSelectionModal } from './ClassSelectionModal';

const api = vi.hoisted(() => ({ useListClasses: vi.fn() }));
vi.mock('../../api/hooks', () => ({ useListClasses: api.useListClasses }));

const refs = ['bless', 'cure-wounds', 'healing-word'].map(
  (id) => `dnd5e:spells:${id}`
);
const spellChoice = create(ChoiceSchema, {
  id: 'cleric-spells',
  description: 'Choose 3 spells',
  chooseCount: 3,
  choiceType: ChoiceCategory.SPELLS,
  options: {
    case: 'spellOptions',
    value: create(SpellOptionsSchema, { availableRefs: refs, spellLevel: 1 }),
  },
});
const life = create(SubclassInfoSchema, {
  subclassId: Subclass.LIFE_DOMAIN,
  name: 'Life Domain',
  level: 1,
});
const cleric = create(ClassInfoSchema, {
  classId: Class.CLERIC,
  name: 'Cleric',
  subclasses: [life],
  choices: [spellChoice],
});

beforeEach(() => {
  api.useListClasses.mockReturnValue({
    data: [cleric],
    loading: false,
    error: null,
  });
});

describe('Cleric acquisition and domain selection', () => {
  it('requires a domain and retains the provider base spell choices after selecting one', () => {
    const onSelect = vi.fn();
    render(
      <ClassSelectionModal isOpen onSelect={onSelect} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Select Cleric$/ }));
    expect(
      screen.getByText('Please select a subclass before continuing.')
    ).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /Choose Your Subclass/ })
    );
    fireEvent.click(screen.getByText('Life Domain'));
    for (const name of ['Bless', 'Cure Wounds', 'Healing Word'])
      fireEvent.click(screen.getByText(name));
    fireEvent.click(
      screen.getByRole('button', { name: /^Select Life Domain$/ })
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({
      classId: Class.CLERIC,
      selectedSubclass: { subclassId: Subclass.LIFE_DOMAIN },
    });
    expect(onSelect.mock.calls[0]![1].spells).toEqual([
      { choiceId: 'cleric-spells', spellRefs: refs },
    ]);
  });

  it('restores the saved domain and spell choices on reopening without selecting them again', () => {
    const onSelect = vi.fn();
    render(
      <ClassSelectionModal
        isOpen
        currentClass="Cleric"
        currentSubclass={Subclass.LIFE_DOMAIN}
        existingChoices={{
          spells: [{ choiceId: 'cleric-spells', spellRefs: refs }],
        }}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('(3/3 selected)')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /^Select Life Domain$/ })
    );
    expect(onSelect.mock.calls[0]![0].selectedSubclass.subclassId).toBe(
      Subclass.LIFE_DOMAIN
    );
    expect(onSelect.mock.calls[0]![1].spells).toEqual([
      { choiceId: 'cleric-spells', spellRefs: refs },
    ]);
  });
});
