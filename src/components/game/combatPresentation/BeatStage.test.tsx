import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BeatStage } from './BeatStage';
import type { BeatAttackView } from './beatStageTypes';

const hitAttack: BeatAttackView = {
  attackerEntityId: 'char-aldric',
  hit: true,
  critical: false,
  attackRoll: 14,
  attackBonus: 5,
  targetAc: 16,
};
const critAttack: BeatAttackView = {
  ...hitAttack,
  critical: true,
  attackRoll: 20,
};
const nat1Attack: BeatAttackView = { ...hitAttack, hit: false, attackRoll: 1 };

describe('BeatStage', () => {
  it('renders the cue beat without an embedded die', () => {
    render(
      <BeatStage
        beat="cue"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.getByTestId('beat-cue')).toBeTruthy();
    expect(screen.queryByTestId('beat-die')).toBeNull();
    expect(screen.queryByTestId('dice-tray')).toBeNull();
  });

  it('does not render its own die during throw because DiceTray is the only die presentation', () => {
    render(
      <BeatStage
        beat="throw"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.queryByTestId('beat-die')).toBeNull();
    expect(screen.queryByTestId('d20-die')).toBeNull();
  });

  it.each([
    ['HIT', hitAttack, 'hit'],
    ['MISS', { ...hitAttack, hit: false }, 'miss'],
    ['CRIT', critAttack, 'crit'],
    ['NAT-1', nat1Attack, 'nat1'],
  ] as const)(
    'renders the %s verdict with its visual modifier',
    (label, attack, modifier) => {
      render(
        <BeatStage
          beat="verdict"
          placement="token-anchored"
          attack={attack}
          reducedMotion={false}
        />
      );
      const verdict = screen.getByTestId('beat-verdict');
      expect(verdict.textContent).toContain(label);
      expect(verdict.className).toContain(`beat-verdict--${modifier}`);
    }
  );

  it('announces the verdict politely by default and can suppress a duplicate announcement', () => {
    const { rerender } = render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.getByTestId('beat-verdict').getAttribute('role')).toBe(
      'status'
    );
    expect(screen.getByTestId('beat-verdict').getAttribute('aria-live')).toBe(
      'polite'
    );
    rerender(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
        announce={false}
      />
    );
    expect(screen.getByTestId('beat-verdict').getAttribute('role')).toBeNull();
  });

  it('uses caller-supplied qualitative impact metadata rather than exact damage', () => {
    render(
      <BeatStage
        beat="impact"
        placement="center-stage"
        attack={critAttack}
        impactTier="DEVASTATING"
        reducedMotion={false}
      />
    );
    const impact = screen.getByTestId('beat-impact');
    expect(impact.textContent).toBe('DEVASTATING');
    expect(impact.className).toContain('beat-impact--crit');
    expect(screen.queryByText('-14')).toBeNull();
  });

  it('keeps qualitative impact under reduced motion without rendering a die', () => {
    render(
      <BeatStage
        beat="impact"
        placement="center-stage"
        attack={critAttack}
        impactTier="HEAVY"
        reducedMotion
      />
    );
    expect(screen.getByTestId('beat-impact').textContent).toBe('HEAVY');
    expect(screen.getByTestId('beat-stage').className).toContain(
      'beat-stage--reduced-motion'
    );
    expect(screen.queryByTestId('beat-die')).toBeNull();
  });

  it('promotes token-anchored crits and nat-1s to center-stage while routine hits remain anchored', () => {
    const { rerender } = render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(
      screen.getByTestId('beat-stage').getAttribute('data-placement')
    ).toBe('token-anchored');
    rerender(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={critAttack}
        reducedMotion={false}
      />
    );
    expect(
      screen.getByTestId('beat-stage').getAttribute('data-placement')
    ).toBe('center-stage');
    rerender(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={nat1Attack}
        reducedMotion={false}
      />
    );
    expect(
      screen.getByTestId('beat-stage').getAttribute('data-placement')
    ).toBe('center-stage');
  });

  it('persists an Instant verdict and qualitative impact at done without cue theater', () => {
    render(
      <BeatStage
        beat="done"
        placement="token-anchored"
        attack={hitAttack}
        impactTier="SOLID"
        reducedMotion={false}
        persistResult
      />
    );
    expect(screen.getByTestId('beat-verdict').textContent).toContain('HIT');
    expect(screen.getByTestId('beat-impact').textContent).toBe('SOLID');
    expect(screen.queryByTestId('beat-cue')).toBeNull();
    expect(screen.queryByTestId('beat-die')).toBeNull();
  });

  it('renders damage inside the verdict live-region at impact, not before, and never for a miss', () => {
    const { rerender } = render(
      <BeatStage
        beat="verdict"
        placement="center-stage"
        attack={hitAttack}
        reducedMotion={false}
        damageAmount={16}
      />
    );
    expect(screen.queryByTestId('beat-damage')).toBeNull();

    rerender(
      <BeatStage
        beat="impact"
        placement="center-stage"
        attack={hitAttack}
        reducedMotion={false}
        damageAmount={16}
      />
    );
    const damage = screen.getByTestId('beat-damage');
    expect(damage.textContent).toContain('16 damage');
    expect(screen.getByTestId('beat-verdict').contains(damage)).toBe(true);
    expect(screen.getAllByRole('status')).toHaveLength(1);

    rerender(
      <BeatStage
        beat="release"
        placement="center-stage"
        attack={hitAttack}
        reducedMotion={false}
        damageAmount={16}
      />
    );
    expect(screen.getByTestId('beat-damage').textContent).toContain(
      '16 damage'
    );

    rerender(
      <BeatStage
        beat="impact"
        placement="center-stage"
        attack={{ ...hitAttack, hit: false }}
        reducedMotion={false}
      />
    );
    expect(screen.queryByTestId('beat-damage')).toBeNull();
  });
});
