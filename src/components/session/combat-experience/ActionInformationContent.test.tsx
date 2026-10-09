import { EffectState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActionInformationContent } from './ActionInformationContent';
import type { ActionEffectLine } from './actionTooltip';

const rage: ActionEffectLine = {
  id: 'actor:rage',
  name: 'Rage',
  description: 'Rage can add damage to a Strength-based melee weapon attack.',
  state: EffectState.APPLIES,
  tone: 'applies',
  stateWord: 'Applies',
  reason: 'This is a Strength-based melee weapon attack.',
  benefit: '+2 damage',
};

const baseDamage = '1d8 + STR modifier (+3) · Bludgeoning';

describe('ActionInformationContent', () => {
  it('keeps a zero-effect action description and its facts visible', () => {
    render(
      <ActionInformationContent
        description="Each target makes a Charisma save. On a failure, Bane subtracts 1d4 from its attack rolls and saving throws."
        lines={[{ label: 'Costs', value: 'Action, 1 spell slot' }]}
        effects={[]}
      />
    );
    expect(screen.getByText(/Each target makes a Charisma save/)).toBeVisible();
    expect(screen.getByText('Action, 1 spell slot')).toBeVisible();
    expect(
      screen.queryByRole('list', { name: 'Effects on this action' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no effects/i)).not.toBeInTheDocument();
  });

  it('places the assembled base facts before contextual effects, without folding them', () => {
    render(
      <ActionInformationContent
        description="Make a melee attack against a creature in reach."
        lines={[{ label: 'Base damage', value: baseDamage }]}
        effects={[rage]}
      />
    );
    const base = screen.getByText(baseDamage);
    const effect = screen.getByText('Rage');
    expect(
      base.compareDocumentPosition(effect) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText('+2 damage')).toBeVisible();
    expect(screen.queryByText(/1d8\s*\+\s*5/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('retains negative, dependent and later-choice effect answers', () => {
    render(
      <ActionInformationContent
        description="Make an attack."
        lines={[]}
        effects={[
          {
            ...rage,
            state: EffectState.DOES_NOT_APPLY,
            tone: 'does-not-apply',
            stateWord: 'Does not apply',
            reason: 'This attack uses Dexterity.',
            benefit: '',
          },
          {
            ...rage,
            id: 'depends',
            name: 'Sneak Attack',
            state: EffectState.DEPENDS,
            tone: 'depends',
            stateWord: 'Depends',
            reason: 'Choose a target.',
            benefit: '',
          },
          {
            ...rage,
            id: 'later',
            name: 'Bardic Inspiration',
            tone: 'later',
            stateWord: 'Available after the roll',
            reason: 'A later choice.',
            benefit: '1d6',
          },
        ]}
      />
    );
    expect(screen.getByText('Does not apply')).toBeVisible();
    expect(screen.getByText('Depends')).toBeVisible();
    expect(screen.getByText('Available after the roll')).toBeVisible();
    expect(screen.getByText('This attack uses Dexterity.')).toBeVisible();
  });

  it('identifies missing descriptions without inventing action behavior', () => {
    render(<ActionInformationContent description="" lines={[]} effects={[]} />);
    expect(screen.getByText('Description not provided.')).toBeVisible();
  });

  it('renders provider text literally and keeps repeated detail labels in order', () => {
    const { container } = render(
      <ActionInformationContent
        description={'<script>alert("not HTML")</script>'}
        lines={[
          { label: 'Base damage', value: '1d8 · Bludgeoning' },
          { label: 'Base damage', value: '1d4 · Fire' },
        ]}
        effects={[]}
      />
    );
    expect(
      screen.getByText('<script>alert("not HTML")</script>')
    ).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getAllByText('Base damage')).toHaveLength(2);
    expect(
      screen
        .getByText('1d8 · Bludgeoning')
        .compareDocumentPosition(screen.getByText('1d4 · Fire')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('names malformed blank detail fields without inventing game facts', () => {
    render(
      <ActionInformationContent
        description="An action."
        lines={[
          { label: ' ', value: '1d8 · Bludgeoning' },
          { label: 'Range', value: '' },
          { label: 'Remaining', value: '0' },
        ]}
        effects={[]}
      />
    );
    expect(screen.getByText('Detail label not provided')).toBeVisible();
    expect(screen.getByText('Value not provided')).toBeVisible();
    expect(screen.getByText('1d8 · Bludgeoning')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();
  });

  it('keeps target-held rows separate even when their ids match actor rows', () => {
    render(
      <ActionInformationContent
        description="Make an attack."
        lines={[]}
        effects={[rage]}
        targetName="Skeleton"
        targetEffects={[
          {
            ...rage,
            name: 'Faerie Fire',
            description: 'The target is outlined.',
            benefit: 'Advantage',
          },
        ]}
      />
    );
    expect(
      within(
        screen.getByRole('list', { name: 'Effects on this action' })
      ).getByText('Rage')
    ).toBeVisible();
    expect(
      within(
        screen.getByRole('list', { name: 'Effects on Skeleton' })
      ).getByText('Faerie Fire')
    ).toBeVisible();
  });
});
