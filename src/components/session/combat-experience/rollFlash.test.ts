import { describe, expect, it } from 'vitest';
import { rollFlashFor, rollFlashText } from './rollFlash';
import type { CombatExperienceAttackOutcome } from './types';

function outcome(
  overrides: Partial<CombatExperienceAttackOutcome> = {}
): CombatExperienceAttackOutcome {
  return {
    attackId: 'attack-1',
    actor: 'member-a',
    target: 'member-b',
    action: 'Attack',
    d20: 17,
    total: 22,
    against: 15,
    hit: true,
    critical: false,
    targetIsViewer: false,
    ...overrides,
  };
}

describe('rollFlashFor', () => {
  it('returns null when there is no result yet', () => {
    expect(rollFlashFor(undefined)).toBeNull();
  });

  it('fires on a MISS too — unlike damageToastFor, the roll flash is about the roll, not the damage', () => {
    const flash = rollFlashFor(outcome({ hit: false, total: 12 }));
    expect(flash).not.toBeNull();
    expect(flash?.hit).toBe(false);
  });

  it('fires on a hit for zero damage too', () => {
    const flash = rollFlashFor(outcome({ hit: true, damage: 0 }));
    expect(flash).not.toBeNull();
  });

  it('derives the modifier from total - d20, straight from server facts', () => {
    const flash = rollFlashFor(outcome({ d20: 17, total: 22 }));
    expect(flash?.modifier).toBe(5);
  });

  it('is keyed on attackId, matching the de-duplication key damageToastFor uses', () => {
    const flash = rollFlashFor(outcome({ attackId: 'attack-42' }));
    expect(flash?.id).toBe('attack-42');
  });

  it('flags a natural 20', () => {
    expect(rollFlashFor(outcome({ d20: 20 }))?.natural).toBe('nat20');
  });

  it('flags a natural 1', () => {
    expect(rollFlashFor(outcome({ d20: 1 }))?.natural).toBe('nat1');
  });

  it('flags everything else as normal', () => {
    expect(rollFlashFor(outcome({ d20: 11 }))?.natural).toBe('normal');
  });
});

describe('rollFlashText', () => {
  it('formats a positive modifier with a plus sign', () => {
    const flash = rollFlashFor(outcome({ d20: 17, total: 22 }))!;
    expect(rollFlashText(flash)).toBe('d20 17 + 5 = 22');
  });

  it('formats a negative modifier with a minus sign, not a double-negative', () => {
    const flash = rollFlashFor(outcome({ d20: 8, total: 6 }))!;
    expect(rollFlashText(flash)).toBe('d20 8 - 2 = 6');
  });

  it('formats a zero modifier with a plus sign', () => {
    const flash = rollFlashFor(outcome({ d20: 14, total: 14 }))!;
    expect(rollFlashText(flash)).toBe('d20 14 + 0 = 14');
  });
});
