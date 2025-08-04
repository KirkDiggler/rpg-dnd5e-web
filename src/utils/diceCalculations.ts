import type { DiceRoll } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/dice_pb';

/**
 * Calculate the total score from a dice roll, accounting for dropped dice
 * For 4d6 drop lowest, this sums all dice then subtracts the dropped ones
 */
export function calculateDiceTotal(roll: DiceRoll): number {
  if (!roll.dropped || roll.dropped.length === 0) {
    return roll.total;
  }

  const allDiceSum = roll.dice.reduce((sum, die) => sum + die, 0);
  const droppedSum = roll.dropped.reduce((sum, die) => sum + die, 0);
  return allDiceSum - droppedSum;
}

/**
 * Calculate the ability modifier for a given score
 */
export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Format the ability modifier as a string with + or - prefix
 */
export function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

/**
 * Get indices of dropped dice for display purposes
 * This handles cases where the same value appears multiple times
 */
export function getDroppedDiceIndices(
  dice: number[],
  dropped: number[]
): Set<number> {
  const indices = new Set<number>();
  const diceCopy = [...dice];

  dropped.forEach((droppedValue) => {
    const index = diceCopy.indexOf(droppedValue);
    if (index !== -1) {
      indices.add(index);
      diceCopy[index] = -1; // Mark as used
    }
  });

  return indices;
}

/**
 * Check if two dice rolls are identical (used for deduplication)
 */
export function areDiceRollsEqual(roll1: DiceRoll, roll2: DiceRoll): boolean {
  if (roll1.rollId !== roll2.rollId) return false;
  if (roll1.total !== roll2.total) return false;
  if (roll1.dice.length !== roll2.dice.length) return false;
  if (roll1.dropped.length !== roll2.dropped.length) return false;

  // Check if dice arrays are equal (order matters)
  for (let i = 0; i < roll1.dice.length; i++) {
    if (roll1.dice[i] !== roll2.dice[i]) return false;
  }

  // Check if dropped arrays are equal
  for (let i = 0; i < roll1.dropped.length; i++) {
    if (roll1.dropped[i] !== roll2.dropped[i]) return false;
  }

  return true;
}
