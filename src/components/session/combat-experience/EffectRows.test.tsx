import { EffectState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActionEffectLine } from './actionTooltip';
import { EffectRows } from './EffectRows';

const line = (overrides: Partial<ActionEffectLine>): ActionEffectLine => ({
  id: 'row',
  name: 'Fixture Effect',
  description: 'What it does.',
  state: EffectState.APPLIES,
  tone: 'applies',
  stateWord: 'Applies',
  reason: 'Because the rule said so',
  benefit: '',
  ...overrides,
});

describe('EffectRows', () => {
  it('renders all four states with reasons', () => {
    render(
      <EffectRows
        lines={[
          line({ id: 'a', name: 'Alpha', benefit: '+2 damage' }),
          line({
            id: 'b',
            name: 'Beta',
            state: EffectState.DOES_NOT_APPLY,
            tone: 'does-not-apply',
            stateWord: 'Does not apply',
            reason: 'Needs a melee weapon',
            description: 'Beta adds to melee hits.',
          }),
          line({
            id: 'c',
            name: 'Gamma',
            state: EffectState.DEPENDS,
            tone: 'depends',
            stateWord: 'Depends',
            reason: 'Depends on the target',
          }),
          line({
            id: 'd',
            name: 'Delta',
            state: EffectState.UNAVAILABLE,
            tone: 'unavailable',
            stateWord: 'Unavailable',
            reason: 'This effect cannot yet say whether it applies',
            description: 'Delta, from the catalog.',
          }),
        ]}
      />
    );
    const rows = within(screen.getByRole('list', { name: 'Effects' }))
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(rows).toEqual([
      expect.stringMatching(
        /Alpha.*Applies.*Because the rule said so.*\+2 damage.*What it does\./
      ),
      expect.stringMatching(
        /Beta.*Does not apply.*Needs a melee weapon.*Beta adds to melee hits\./
      ),
      expect.stringMatching(/Gamma.*Depends.*Depends on the target/),
      expect.stringMatching(
        /Delta.*Unavailable.*cannot yet say.*Delta, from the catalog\./
      ),
    ]);
    // A row that does not apply is styled quieter, never removed.
    expect(
      screen.getByText('Beta').closest('[role="listitem"]')
    ).toHaveAttribute('data-effect-tone', 'does-not-apply');
  });

  it('shows an unknown state rather than hiding the row', () => {
    render(
      <EffectRows
        lines={[
          line({
            state: EffectState.UNSPECIFIED,
            tone: 'unknown',
            stateWord: 'State unknown',
          }),
        ]}
      />
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('State unknown');
  });

  it('flags an applying row of unknown timing instead of showing it as added', () => {
    render(
      <EffectRows
        lines={[
          line({
            tone: 'unknown',
            stateWord: 'Applies, timing unknown',
            benefit: '+1d6 after the roll',
          }),
        ]}
      />
    );
    const row = screen.getByRole('listitem');
    expect(row).toHaveAttribute('data-effect-tone', 'unknown');
    expect(row).toHaveTextContent('Applies, timing unknown');
    expect(row).toHaveTextContent('+1d6 after the roll');
    expect(row.textContent).not.toMatch(/✓/);
  });

  it('renders nothing for no rows', () => {
    const { container } = render(<EffectRows lines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
