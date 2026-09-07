import { create } from '@bufbuild/protobuf';
import {
  ChoiceCategory,
  ChoiceSchema,
  ExpertiseOptionsSchema,
  ToolOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  Skill,
  Tool,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getToolInfo } from '../utils/enumRegistry';
import { ChoiceRenderer } from './ChoiceRenderer';

describe('ChoiceRenderer - EXPERTISE', () => {
  const expertiseChoice = create(ChoiceSchema, {
    id: 'rogue-expertise-1',
    description: 'Choose 2 skills or thieves’ tools for expertise',
    chooseCount: 2,
    choiceType: ChoiceCategory.EXPERTISE,
    options: {
      case: 'expertiseOptions',
      value: create(ExpertiseOptionsSchema, {
        availableSkills: [
          Skill.STEALTH,
          Skill.PERCEPTION,
          Skill.SLEIGHT_OF_HAND,
        ],
      }),
    },
  });

  it('renders expertise skill options instead of falling back to SimpleChoice', () => {
    render(
      <ChoiceRenderer
        choice={expertiseChoice}
        currentSelections={[]}
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByText('Stealth')).toBeTruthy();
    expect(screen.getByText('Perception')).toBeTruthy();
    expect(screen.getByText('Sleight of Hand')).toBeTruthy();
  });

  it('reports selected skills as Skill enum values via onSelectionChange', () => {
    const onSelectionChange = vi.fn();

    render(
      <ChoiceRenderer
        choice={expertiseChoice}
        currentSelections={[]}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.click(screen.getByText('Stealth'));

    expect(onSelectionChange).toHaveBeenCalledWith('rogue-expertise-1', [
      Skill.STEALTH,
    ]);
  });

  it('allows choosing up to chooseCount skills', () => {
    const onSelectionChange = vi.fn();

    render(
      <ChoiceRenderer
        choice={expertiseChoice}
        currentSelections={[Skill.STEALTH]}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.click(screen.getByText('Perception'));

    expect(onSelectionChange).toHaveBeenCalledWith('rogue-expertise-1', [
      Skill.STEALTH,
      Skill.PERCEPTION,
    ]);
  });

  it('lets a single-pick choice be changed after it is made', () => {
    // The GROUPED layout's own copy of the limit rule. Expertise is the only
    // grouped choice that can arrive with a count of one, and it locked the
    // same way the ungrouped ones did.
    const onSelectionChange = vi.fn();
    const single = create(ChoiceSchema, {
      ...expertiseChoice,
      chooseCount: 1,
    });

    render(
      <ChoiceRenderer
        choice={single}
        currentSelections={[Skill.STEALTH]}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.click(screen.getByText('Perception'));

    expect(onSelectionChange).toHaveBeenCalledWith('rogue-expertise-1', [
      Skill.PERCEPTION,
    ]);
  });
});

/**
 * A CHOOSE-N REQUIREMENT IS A MULTI-PICK, whatever it is a requirement FOR.
 *
 * The bard's "choose 3 musical instruments" is the case that provoked this
 * (rpg-project#397): a tool requirement whose count is three and whose ten
 * options are the instruments. Nothing about it is bard-shaped — the control
 * follows from the requirement's count and its option kind, so any choose-N
 * tool or language requirement gets the same view, and a choose-1 one keeps
 * the single-pick control it should have.
 */
describe('ChoiceRenderer - TOOLS by count', () => {
  const INSTRUMENTS = [
    Tool.BAGPIPES,
    Tool.DRUM,
    Tool.DULCIMER,
    Tool.FLUTE,
    Tool.LUTE,
    Tool.LYRE,
    Tool.HORN,
    Tool.PAN_FLUTE,
    Tool.SHAWM,
    Tool.VIOL,
  ];

  /** The shape the live server sends, read off rpg-api's ListClasses. */
  function instrumentChoice(chooseCount: number) {
    return create(ChoiceSchema, {
      id: 'bard-instruments',
      description: `Choose ${chooseCount} musical instruments`,
      chooseCount,
      choiceType: ChoiceCategory.TOOLS,
      options: {
        case: 'toolOptions',
        value: create(ToolOptionsSchema, { available: INSTRUMENTS }),
      },
    });
  }

  it('renders all ten instruments as a counted multi-pick, never a dropdown', () => {
    const { container } = render(
      <ChoiceRenderer
        choice={instrumentChoice(3)}
        currentSelections={[]}
        onSelectionChange={vi.fn()}
      />
    );

    INSTRUMENTS.forEach((tool) => {
      expect(screen.getByText(toolName(tool))).toBeTruthy();
    });
    expect(screen.getByText('(0/3 selected)')).toBeTruthy();
    // A SINGLE-SELECT CONTROL WOULD PASS EVERY OTHER ASSERTION HERE while
    // making three picks impossible, so the control itself is asserted.
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      INSTRUMENTS.length
    );
  });

  it('adds each pick to the ones already made, up to the count', () => {
    const onSelectionChange = vi.fn();

    render(
      <ChoiceRenderer
        choice={instrumentChoice(3)}
        currentSelections={[Tool.LUTE, Tool.FLUTE]}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.getByText('(2/3 selected)')).toBeTruthy();
    fireEvent.click(screen.getByText('Drum'));

    // ALL THREE GO UP TOGETHER. The caller submits this array whole in the one
    // UpdateClass call; a control that replaced instead of added would send
    // one ref and lose two.
    expect(onSelectionChange).toHaveBeenCalledWith('bard-instruments', [
      Tool.LUTE,
      Tool.FLUTE,
      Tool.DRUM,
    ]);
  });

  it('refuses a fourth once three are held', () => {
    const onSelectionChange = vi.fn();

    render(
      <ChoiceRenderer
        choice={instrumentChoice(3)}
        currentSelections={[Tool.LUTE, Tool.FLUTE, Tool.DRUM]}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.getByText('(3/3 selected)')).toBeTruthy();
    fireEvent.click(screen.getByText('Viol'));

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('keeps the single-pick control when the count is one', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <ChoiceRenderer
        choice={instrumentChoice(1)}
        currentSelections={[Tool.LUTE]}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(
      INSTRUMENTS.length
    );
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      0
    );
    expect(screen.queryByText(/selected\)/)).toBeNull();

    // One replaces the other rather than joining it.
    fireEvent.click(screen.getByText('Viol'));
    expect(onSelectionChange).toHaveBeenCalledWith('bard-instruments', [
      Tool.VIOL,
    ]);
  });
});

/** The registry's own name, so the test never asserts a spelling of its own. */
function toolName(tool: Tool): string {
  return getToolInfo(tool).name;
}
