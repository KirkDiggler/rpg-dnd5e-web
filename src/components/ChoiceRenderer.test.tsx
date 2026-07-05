import { create } from '@bufbuild/protobuf';
import {
  ChoiceCategory,
  ChoiceSchema,
  ExpertiseOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Skill } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});
