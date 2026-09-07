/**
 * The class modal must ASK for the cantrips and spells the server requires,
 * and send the answers up with everything else.
 *
 * WHY THIS TEST EXISTS. The walk failed finalize with "Choose 2 cantrips
 * required" while the modal offered no control for it: the requirement was on
 * the wire and nothing rendered it, so the only way to see the gap was to try
 * to finish a character. A test that drives the modal from the class payload
 * catches the same gap without a running stack.
 *
 * IT IS DRIVEN BY THE PAYLOAD, NOT BY THE CLASS. The fighter case is here for
 * the other half of the rule: a class whose payload carries no spell
 * requirement must grow no spell section. Nothing keys on "is a bard".
 */
import { create } from '@bufbuild/protobuf';
import { ClassInfoSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSchema,
  ChoiceSource,
  SkillOptionsSchema,
  SpellOptionsSchema,
  ToolOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  Class,
  Skill,
  Spell,
  Tool,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { convertSpellChoiceToProto } from '../../utils/choiceConverter';
import { ClassSelectionModal } from './ClassSelectionModal';

const hoisted = vi.hoisted(() => ({ useListClasses: vi.fn() }));
vi.mock('../../api/hooks', () => ({ useListClasses: hoisted.useListClasses }));

const CANTRIPS = [
  Spell.MINOR_ILLUSION,
  Spell.PRESTIDIGITATION,
  Spell.MAGE_HAND,
  Spell.LIGHT,
  Spell.TOLL_THE_DEAD,
];
const SPELLS = [
  Spell.CURE_WOUNDS,
  Spell.HEALING_WORD,
  Spell.CHARM_PERSON,
  Spell.THUNDERWAVE,
  Spell.SLEEP,
  Spell.IDENTIFY,
];
const INSTRUMENTS = [Tool.LUTE, Tool.FLUTE, Tool.DRUM, Tool.LYRE];
const SKILLS = [Skill.DECEPTION, Skill.PERSUASION, Skill.PERFORMANCE];

/** The bard's class payload, in the shape rpg-api sends it. */
function bard() {
  return create(ClassInfoSchema, {
    classId: Class.BARD,
    name: 'Bard',
    choices: [
      create(ChoiceSchema, {
        id: 'bard-skills',
        description: 'Choose 3 skills',
        chooseCount: 3,
        choiceType: ChoiceCategory.SKILLS,
        options: {
          case: 'skillOptions',
          value: create(SkillOptionsSchema, { available: SKILLS }),
        },
      }),
      create(ChoiceSchema, {
        id: 'bard-instruments',
        description: 'Choose 3 musical instruments',
        chooseCount: 3,
        choiceType: ChoiceCategory.TOOLS,
        options: {
          case: 'toolOptions',
          value: create(ToolOptionsSchema, { available: INSTRUMENTS }),
        },
      }),
      create(ChoiceSchema, {
        id: 'bard-cantrips',
        description: 'Choose 2 cantrips',
        chooseCount: 2,
        choiceType: ChoiceCategory.CANTRIPS,
        options: {
          case: 'spellOptions',
          value: create(SpellOptionsSchema, { available: CANTRIPS }),
        },
      }),
      create(ChoiceSchema, {
        id: 'bard-spells',
        description: 'Choose 4 spells',
        chooseCount: 4,
        choiceType: ChoiceCategory.SPELLS,
        options: {
          case: 'spellOptions',
          value: create(SpellOptionsSchema, { available: SPELLS }),
        },
      }),
    ],
  });
}

/** A fighter: skills only, and no spell requirement anywhere. */
function fighter() {
  return create(ClassInfoSchema, {
    classId: Class.FIGHTER,
    name: 'Fighter',
    choices: [
      create(ChoiceSchema, {
        id: 'fighter-skills',
        description: 'Choose 2 skills',
        chooseCount: 2,
        choiceType: ChoiceCategory.SKILLS,
        options: {
          case: 'skillOptions',
          value: create(SkillOptionsSchema, { available: SKILLS }),
        },
      }),
    ],
  });
}

function open(classInfo: ReturnType<typeof bard>, onSelect = vi.fn()) {
  hoisted.useListClasses.mockReturnValue({
    data: [classInfo],
    loading: false,
    error: null,
  });
  const view = render(
    <ClassSelectionModal isOpen onClose={vi.fn()} onSelect={onSelect} />
  );
  fireEvent.click(screen.getAllByText(classInfo.name)[0]!);
  return { ...view, onSelect };
}

/** Click an option by its visible name, in whichever control drew it. */
function pick(name: string) {
  const control = screen.getByText(name).closest('button, label');
  if (!control) throw new Error(`no control for ${name}`);
  fireEvent.click(control);
}

describe('the class modal and the server’s spell requirements', () => {
  it('renders a counted grid per spell requirement, with the server’s counts', () => {
    open(bard());

    expect(screen.getByText('Choose Your Spells')).toBeTruthy();
    expect(screen.getByText('Choose 2 cantrips')).toBeTruthy();
    expect(screen.getByText('Choose 4 spells')).toBeTruthy();
    // The counts come from the requirement, never from a table here.
    expect(screen.getByText('(0/2 selected)')).toBeTruthy();
    expect(screen.getByText('(0/4 selected)')).toBeTruthy();
    // Every offered spell is on screen, named rather than left as an enum.
    expect(screen.getByText('Minor Illusion')).toBeTruthy();
    expect(screen.getByText('Healing Word')).toBeTruthy();
  });

  it('renders no spell section for a class whose payload has no spell requirement', () => {
    open(fighter());

    expect(screen.queryByText('Choose Your Spells')).toBeNull();
    expect(screen.queryByText(/cantrip/i)).toBeNull();
  });

  it('refuses to submit while a spell requirement is unmet, naming it', () => {
    const { onSelect } = open(bard());

    SKILLS.forEach((s) => pick(displayName(s, 'skill')));
    ['Lute', 'Flute', 'Drum'].forEach(pick);
    fireEvent.click(screen.getByRole('button', { name: /^Select Bard$/ }));

    expect(
      screen.getByText('Please select 2 cantrips: Choose 2 cantrips')
    ).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hands all six spell picks back with the rest of the choices', () => {
    const { onSelect } = open(bard());

    SKILLS.forEach((s) => pick(displayName(s, 'skill')));
    ['Lute', 'Flute', 'Drum'].forEach(pick);
    ['Minor Illusion', 'Prestidigitation'].forEach(pick);
    ['Cure Wounds', 'Healing Word', 'Charm Person', 'Sleep'].forEach(pick);

    fireEvent.click(screen.getByRole('button', { name: /^Select Bard$/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const choices = onSelect.mock.calls[0][1];
    // TWO SUBMISSIONS, SIX REFS. The two requirements stay apart, each under
    // the category the server asked with, so the server can tell which is
    // which without counting spell levels.
    expect(choices.spells).toHaveLength(2);
    const cantrips = choices.spells.find(
      (c: { choiceId: string }) => c.choiceId === 'bard-cantrips'
    );
    const spells = choices.spells.find(
      (c: { choiceId: string }) => c.choiceId === 'bard-spells'
    );
    expect(cantrips.category).toBe(ChoiceCategory.CANTRIPS);
    expect(spells.category).toBe(ChoiceCategory.SPELLS);
    expect(cantrips.spells).toEqual([
      Spell.MINOR_ILLUSION,
      Spell.PRESTIDIGITATION,
    ]);
    expect(spells.spells).toEqual([
      Spell.CURE_WOUNDS,
      Spell.HEALING_WORD,
      Spell.CHARM_PERSON,
      Spell.SLEEP,
    ]);
    expect(cantrips.spells.length + spells.spells.length).toBe(6);
  });

  it('refuses a third cantrip, because the count is two', () => {
    open(bard());

    ['Minor Illusion', 'Prestidigitation'].forEach(pick);
    expect(screen.getByText('(2/2 selected)')).toBeTruthy();

    const third = screen.getByText('Mage Hand').closest('button');
    expect(third!.hasAttribute('disabled')).toBe(true);
  });
});

/** The display spelling the modal uses, so the test asserts no spelling of its own. */
function displayName(value: Skill, kind: 'skill'): string {
  if (kind !== 'skill') throw new Error('unsupported');
  return (
    {
      [Skill.DECEPTION]: 'Deception',
      [Skill.PERSUASION]: 'Persuasion',
      [Skill.PERFORMANCE]: 'Performance',
    } as Record<number, string>
  )[value]!;
}

describe('what reaches UpdateClass', () => {
  it('sends each requirement back under its own category, as spell refs', () => {
    const cantrips = convertSpellChoiceToProto(
      {
        choiceId: 'bard-cantrips',
        category: ChoiceCategory.CANTRIPS,
        spells: [Spell.MINOR_ILLUSION, Spell.PRESTIDIGITATION],
      },
      ChoiceSource.CLASS
    );
    const spells = convertSpellChoiceToProto(
      {
        choiceId: 'bard-spells',
        category: ChoiceCategory.SPELLS,
        spells: [
          Spell.CURE_WOUNDS,
          Spell.HEALING_WORD,
          Spell.CHARM_PERSON,
          Spell.SLEEP,
        ],
      },
      ChoiceSource.CLASS
    );

    expect(cantrips.category).toBe(ChoiceCategory.CANTRIPS);
    expect(spells.category).toBe(ChoiceCategory.SPELLS);
    // THE CATEGORY IS ECHOED, NOT DERIVED. Both requirements are the same
    // shape on the wire; a converter that decided which was which would be a
    // second opinion about a fact the server already stated.
    expect(cantrips.source).toBe(ChoiceSource.CLASS);
    expect(cantrips.selection.case).toBe('spells');
    expect(spells.selection.case).toBe('spells');
    const sent = [
      ...(cantrips.selection.case === 'spells'
        ? cantrips.selection.value.spells
        : []),
      ...(spells.selection.case === 'spells'
        ? spells.selection.value.spells
        : []),
    ];
    expect(sent).toHaveLength(6);
  });
});
