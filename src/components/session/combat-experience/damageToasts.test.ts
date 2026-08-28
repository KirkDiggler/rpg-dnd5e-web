import { describe, expect, it } from 'vitest';
import { damageToastFor, damageToastText } from './damageToasts';
import type { CombatExperienceAttackOutcome } from './types';

function outcome(
  overrides: Partial<CombatExperienceAttackOutcome> = {}
): CombatExperienceAttackOutcome {
  return {
    attackId: '9:crypt-run:23',
    actor: 'Aldric',
    target: 'Skeleton Guard',
    action: 'Longsword',
    d20: 12,
    total: 17,
    against: 13,
    hit: true,
    critical: false,
    damage: 8,
    damageType: 'slashing',
    targetIsViewer: false,
    ...overrides,
  };
}

describe('damageToastFor', () => {
  it('announces a landed hit', () => {
    expect(damageToastFor(outcome())).toEqual({
      id: '9:crypt-run:23',
      amount: 8,
      damageType: 'slashing',
      target: 'Skeleton Guard',
      critical: false,
      toViewer: false,
    });
  });

  it('says nothing about a miss', () => {
    expect(
      damageToastFor(outcome({ hit: false, damage: undefined }))
    ).toBeNull();
  });

  it('says nothing when there is no damage to report', () => {
    // A "0 damage" toast reads as a bug, not as a beat.
    expect(damageToastFor(outcome({ damage: 0 }))).toBeNull();
    expect(damageToastFor(outcome({ damage: undefined }))).toBeNull();
  });

  it('says nothing at all when there is no result yet', () => {
    expect(damageToastFor(undefined)).toBeNull();
  });

  it('carries the viewer flag through from the projection, not from the name', () => {
    expect(damageToastFor(outcome({ targetIsViewer: true }))?.toViewer).toBe(
      true
    );
  });

  it('keeps the attack identity as the toast id, so a replay cannot double it', () => {
    expect(damageToastFor(outcome({ attackId: 'x' }))?.id).toBe('x');
  });
});

describe('damageToastText', () => {
  it('names the damage type when the event carried one', () => {
    expect(damageToastText(damageToastFor(outcome())!)).toBe(
      '8 slashing damage'
    );
  });

  it('stays honest when it did not', () => {
    expect(
      damageToastText(damageToastFor(outcome({ damageType: undefined }))!)
    ).toBe('8 damage');
  });
});
