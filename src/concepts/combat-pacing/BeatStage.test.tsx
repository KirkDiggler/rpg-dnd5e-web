import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BeatStage } from './BeatStage';
import type { BeatAttackView, BeatDamageView } from './beatStageTypes';

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
const nat1Attack: BeatAttackView = {
  ...hitAttack,
  hit: false,
  critical: false,
  attackRoll: 1,
};

const dmg: BeatDamageView = { amount: 7 };

describe('BeatStage', () => {
  it('renders the cue beat', () => {
    render(
      <BeatStage
        beat="cue"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.getByTestId('beat-cue')).toBeTruthy();
    expect(screen.queryByTestId('beat-verdict')).toBeNull();
  });

  it('renders a tumbling die during throw, unless reducedMotion', () => {
    render(
      <BeatStage
        beat="throw"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.getByTestId('beat-die').className).toContain(
      'beat-die--tumbling'
    );
  });

  it('renders a settled die during throw when reducedMotion is set', () => {
    render(
      <BeatStage
        beat="throw"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion
      />
    );
    expect(screen.getByTestId('beat-die').className).toContain(
      'beat-die--settled'
    );
  });

  it('renders a settled (not tumbling) die during armed', () => {
    render(
      <BeatStage
        beat="armed"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    const el = screen.getByTestId('beat-die');
    expect(el.className).toContain('beat-die--settled');
    expect(el.className).not.toContain('beat-die--tumbling');
  });

  it('marks the die as decorative (aria-hidden) so the verdict is the single announced signal', () => {
    render(
      <BeatStage
        beat="throw"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.getByTestId('beat-die').getAttribute('aria-hidden')).toBe(
      'true'
    );
  });

  it('renders no beat-specific content during idle', () => {
    render(
      <BeatStage
        beat="idle"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.queryByTestId('beat-cue')).toBeNull();
    expect(screen.queryByTestId('beat-die')).toBeNull();
    expect(screen.queryByTestId('beat-verdict')).toBeNull();
    expect(screen.queryByTestId('beat-damage')).toBeNull();
  });

  it('renders no beat-specific content during done', () => {
    render(
      <BeatStage
        beat="done"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.queryByTestId('beat-cue')).toBeNull();
    expect(screen.queryByTestId('beat-die')).toBeNull();
    expect(screen.queryByTestId('beat-verdict')).toBeNull();
    expect(screen.queryByTestId('beat-damage')).toBeNull();
  });

  it('shows HIT with the beat-verdict--hit class for a plain hit verdict', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    const el = screen.getByTestId('beat-verdict');
    expect(el.textContent).toContain('HIT');
    expect(el.className).toContain('beat-verdict--hit');
  });

  it('shows MISS with the beat-verdict--miss class for a miss verdict', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={{ ...hitAttack, hit: false }}
        reducedMotion={false}
      />
    );
    const el = screen.getByTestId('beat-verdict');
    expect(el.textContent).toContain('MISS');
    expect(el.className).toContain('beat-verdict--miss');
  });

  it('shows CRIT with the gold beat-verdict--crit class for a critical verdict', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={critAttack}
        reducedMotion={false}
      />
    );
    const el = screen.getByTestId('beat-verdict');
    expect(el.textContent).toContain('CRIT');
    expect(el.className).toContain('beat-verdict--crit');
  });

  it('shows NAT-1 with the red beat-verdict--nat1 class, distinct from CRIT and MISS', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={nat1Attack}
        reducedMotion={false}
      />
    );
    const el = screen.getByTestId('beat-verdict');
    expect(el.textContent).toContain('NAT-1');
    expect(el.className).toContain('beat-verdict--nat1');
    expect(el.className).not.toContain('beat-verdict--crit');
    expect(el.className).not.toContain('beat-verdict--miss');
  });

  it('announces the verdict politely by default (role=status, aria-live=polite, aria-atomic=true)', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    const el = screen.getByTestId('beat-verdict');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.getAttribute('aria-atomic')).toBe('true');
  });

  it('omits announcement attributes on the verdict when announce is false', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
        announce={false}
      />
    );
    const el = screen.getByTestId('beat-verdict');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.getAttribute('aria-live')).toBeNull();
    expect(el.getAttribute('aria-atomic')).toBeNull();
  });

  it('renders the damage number, oversized/gold (beat-damage--crit) only on a crit', () => {
    render(
      <BeatStage
        beat="impact"
        placement="token-anchored"
        attack={critAttack}
        damage={dmg}
        reducedMotion={false}
      />
    );
    const el = screen.getByTestId('beat-damage');
    expect(el.textContent).toContain('7');
    expect(el.className).toContain('beat-damage--crit');
  });

  it('renders a plain (non-crit) damage number without beat-damage--crit', () => {
    render(
      <BeatStage
        beat="impact"
        placement="token-anchored"
        attack={hitAttack}
        damage={dmg}
        reducedMotion={false}
      />
    );
    expect(screen.getByTestId('beat-damage').className).not.toContain(
      'beat-damage--crit'
    );
  });

  it('does not render damage during release', () => {
    render(
      <BeatStage
        beat="release"
        placement="token-anchored"
        attack={hitAttack}
        damage={dmg}
        reducedMotion={false}
      />
    );
    expect(screen.queryByTestId('beat-damage')).toBeNull();
  });

  it('a pure center-stage placement stays center-stage even on a plain hit', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="center-stage"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(
      screen.getByTestId('beat-stage').getAttribute('data-placement')
    ).toBe('center-stage');
  });

  it('token-anchored promotes to center-stage on a crit (design.md §2)', () => {
    render(
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
  });

  it('token-anchored promotes to center-stage on a nat-1 too', () => {
    render(
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

  it('token-anchored stays token-anchored on a plain hit (no promotion)', () => {
    render(
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
  });

  it('applies beat-stage--reduced-motion on the container when reducedMotion is set', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={critAttack}
        reducedMotion
      />
    );
    expect(screen.getByTestId('beat-stage').className).toContain(
      'beat-stage--reduced-motion'
    );
  });

  it('does not apply beat-stage--reduced-motion when reducedMotion is false', () => {
    render(
      <BeatStage
        beat="verdict"
        placement="token-anchored"
        attack={hitAttack}
        reducedMotion={false}
      />
    );
    expect(screen.getByTestId('beat-stage').className).not.toContain(
      'beat-stage--reduced-motion'
    );
  });
});
