import type { DiceRoll } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/dice_pb';

/**
 * Calculate the total score from a dice roll, accounting for dropped dice
 *
 * IMPORTANT: The server returns only the KEPT dice in the dice array,
 * with dropped dice values in a separate dropped array.
 * Example: For 4d6 drop lowest rolling [3,4,6,4], server returns:
 * { dice: [4,6,4], dropped: [3], total: 14 }
 *
 * Therefore, we should just sum the dice array (kept dice only).
 */
export function calculateDiceTotal(roll: DiceRoll): number {
  // If we have a total from the server, prefer that
  if (roll.total > 0) {
    return roll.total;
  }

  // Otherwise sum the dice array (which contains only kept dice)
  return roll.dice.reduce((sum, die) => sum + die, 0);
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

/**
 * Calculate what an ability score would be for a 4d6 roll (drop lowest)
 * This is for UI display only - the server makes the final determination
 *
 * IMPORTANT: The server returns only the KEPT dice in the dice array.
 * Example: For 4d6 drop lowest rolling [3,4,6,4], server returns:
 * { dice: [4,6,4], dropped: [3], total: 14 }
 */
export function calculateAbilityScoreValue(roll: DiceRoll): number {
  // Always use calculateDiceTotal which handles the server's format correctly
  return calculateDiceTotal(roll);
}
