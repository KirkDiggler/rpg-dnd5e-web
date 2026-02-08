import { create } from '@bufbuild/protobuf';
import { DiceRollSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/dice_pb';
import { describe, expect, it } from 'vitest';
import {
  areDiceRollsEqual,
  calculateAbilityScoreValue,
  calculateDiceTotal,
  formatModifier,
  getAbilityModifier,
  getDroppedDiceIndices,
} from './diceCalculations';

/** Helper to create a DiceRoll proto message */
function makeDiceRoll(overrides: {
  dice?: number[];
  dropped?: number[];
  total?: number;
  rollId?: string;
}) {
  return create(DiceRollSchema, {
    dice: overrides.dice ?? [],
    dropped: overrides.dropped ?? [],
    total: overrides.total ?? 0,
    rollId: overrides.rollId ?? '',
  });
}

describe('diceCalculations', () => {
  describe('calculateDiceTotal', () => {
    it('uses server total when available', () => {
      const roll = makeDiceRoll({ dice: [4, 6, 4], total: 14 });
      expect(calculateDiceTotal(roll)).toBe(14);
    });

    it('sums dice array when total is 0', () => {
      const roll = makeDiceRoll({ dice: [4, 6, 4], total: 0 });
      expect(calculateDiceTotal(roll)).toBe(14);
    });

    it('returns 0 for empty dice and 0 total', () => {
      const roll = makeDiceRoll({ dice: [], total: 0 });
      expect(calculateDiceTotal(roll)).toBe(0);
    });
  });

  describe('getAbilityModifier', () => {
    it('returns correct modifier for standard scores', () => {
      expect(getAbilityModifier(10)).toBe(0);
      expect(getAbilityModifier(11)).toBe(0);
      expect(getAbilityModifier(12)).toBe(1);
      expect(getAbilityModifier(13)).toBe(1);
      expect(getAbilityModifier(14)).toBe(2);
      expect(getAbilityModifier(15)).toBe(2);
      expect(getAbilityModifier(16)).toBe(3);
      expect(getAbilityModifier(18)).toBe(4);
      expect(getAbilityModifier(20)).toBe(5);
    });

    it('returns negative modifiers for low scores', () => {
      expect(getAbilityModifier(8)).toBe(-1);
      expect(getAbilityModifier(9)).toBe(-1);
      expect(getAbilityModifier(6)).toBe(-2);
      expect(getAbilityModifier(7)).toBe(-2);
      expect(getAbilityModifier(1)).toBe(-5);
    });

    it('handles edge case score of 1 (minimum)', () => {
      expect(getAbilityModifier(1)).toBe(-5);
    });
  });

  describe('formatModifier', () => {
    it('adds + prefix for positive modifiers', () => {
      expect(formatModifier(1)).toBe('+1');
      expect(formatModifier(3)).toBe('+3');
      expect(formatModifier(5)).toBe('+5');
    });

    it('adds + prefix for zero', () => {
      expect(formatModifier(0)).toBe('+0');
    });

    it('keeps - prefix for negative modifiers', () => {
      expect(formatModifier(-1)).toBe('-1');
      expect(formatModifier(-3)).toBe('-3');
    });
  });

  describe('getDroppedDiceIndices', () => {
    it('returns indices of dropped dice', () => {
      // 4d6 drop lowest: [3, 4, 6, 4] → dropped [3] at index 0
      const indices = getDroppedDiceIndices([3, 4, 6, 4], [3]);
      expect(indices.has(0)).toBe(true);
      expect(indices.size).toBe(1);
    });

    it('handles multiple dropped dice', () => {
      const indices = getDroppedDiceIndices([1, 2, 3, 4], [1, 2]);
      expect(indices.has(0)).toBe(true);
      expect(indices.has(1)).toBe(true);
      expect(indices.size).toBe(2);
    });

    it('handles duplicate values correctly', () => {
      // If dropped value appears multiple times in dice, only mark one
      const indices = getDroppedDiceIndices([3, 3, 6, 4], [3]);
      expect(indices.size).toBe(1);
      expect(indices.has(0)).toBe(true);
    });

    it('returns empty set when nothing dropped', () => {
      const indices = getDroppedDiceIndices([4, 5, 6], []);
      expect(indices.size).toBe(0);
    });

    it('handles dropped value not found in dice', () => {
      const indices = getDroppedDiceIndices([4, 5, 6], [1]);
      expect(indices.size).toBe(0);
    });
  });

  describe('areDiceRollsEqual', () => {
    it('returns true for identical rolls', () => {
      const roll1 = makeDiceRoll({
        rollId: 'r1',
        dice: [4, 6],
        dropped: [3],
        total: 10,
      });
      const roll2 = makeDiceRoll({
        rollId: 'r1',
        dice: [4, 6],
        dropped: [3],
        total: 10,
      });
      expect(areDiceRollsEqual(roll1, roll2)).toBe(true);
    });

    it('returns false for different rollIds', () => {
      const roll1 = makeDiceRoll({ rollId: 'r1', dice: [4, 6], total: 10 });
      const roll2 = makeDiceRoll({ rollId: 'r2', dice: [4, 6], total: 10 });
      expect(areDiceRollsEqual(roll1, roll2)).toBe(false);
    });

    it('returns false for different totals', () => {
      const roll1 = makeDiceRoll({ rollId: 'r1', dice: [4, 6], total: 10 });
      const roll2 = makeDiceRoll({ rollId: 'r1', dice: [4, 6], total: 11 });
      expect(areDiceRollsEqual(roll1, roll2)).toBe(false);
    });

    it('returns false for different dice arrays', () => {
      const roll1 = makeDiceRoll({ rollId: 'r1', dice: [4, 6], total: 10 });
      const roll2 = makeDiceRoll({ rollId: 'r1', dice: [3, 7], total: 10 });
      expect(areDiceRollsEqual(roll1, roll2)).toBe(false);
    });

    it('returns false for different length dice arrays', () => {
      const roll1 = makeDiceRoll({ rollId: 'r1', dice: [4, 6], total: 10 });
      const roll2 = makeDiceRoll({ rollId: 'r1', dice: [4, 6, 1], total: 11 });
      expect(areDiceRollsEqual(roll1, roll2)).toBe(false);
    });

    it('returns false for different dropped arrays', () => {
      const roll1 = makeDiceRoll({
        rollId: 'r1',
        dice: [4, 6],
        dropped: [3],
        total: 10,
      });
      const roll2 = makeDiceRoll({
        rollId: 'r1',
        dice: [4, 6],
        dropped: [2],
        total: 10,
      });
      expect(areDiceRollsEqual(roll1, roll2)).toBe(false);
    });
  });

  describe('calculateAbilityScoreValue', () => {
    it('uses server total when available (4d6 drop lowest)', () => {
      // Server returns kept dice only: [4, 6, 4], dropped: [3], total: 14
      const roll = makeDiceRoll({ dice: [4, 6, 4], dropped: [3], total: 14 });
      expect(calculateAbilityScoreValue(roll)).toBe(14);
    });

    it('sums kept dice when total is 0', () => {
      const roll = makeDiceRoll({ dice: [4, 6, 4], dropped: [3], total: 0 });
      expect(calculateAbilityScoreValue(roll)).toBe(14);
    });
  });
});
