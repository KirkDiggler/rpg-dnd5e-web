/**
 * Maps feature names to their corresponding active condition IDs.
 *
 * Some features (like Rage) apply a condition when activated. This mapping
 * allows the UI to check if a feature is currently active by looking at
 * the character's active conditions.
 *
 * The FeatureId enum now includes all activatable class/racial features
 * (Rage, Second Wind, Action Surge, etc.). Feature activation sends the
 * FeatureId enum value; this file maps feature names to ConditionId for
 * checking if the resulting condition is active.
 */

import type { Condition } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { ConditionId } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Maps feature names (lowercase) to the ConditionId that indicates they're active.
 * This provides type-safe condition checking using enums.
 */
const FEATURE_NAME_TO_CONDITION_ID: Readonly<Record<string, ConditionId>> = {
  rage: ConditionId.RAGING,
  // Add more feature-to-condition mappings as needed
  // e.g., 'fighting style: dueling': ConditionId.FIGHTING_STYLE_DUELING,
};

/**
 * Get the ConditionId associated with a feature name.
 * Returns undefined if the feature doesn't apply a trackable condition.
 */
export function getConditionIdForFeature(
  featureName: string
): ConditionId | undefined {
  return FEATURE_NAME_TO_CONDITION_ID[featureName.toLowerCase()];
}

/**
 * Check if a feature is currently active by examining the character's active conditions.
 * Uses enum-based condition ID matching for type safety.
 *
 * @param featureName - The name of the feature to check
 * @param activeConditions - The character's active conditions array
 * @returns true if the feature's corresponding condition is active
 */
export function isFeatureActiveByCondition(
  featureName: string,
  activeConditions: readonly Condition[]
): boolean {
  const conditionId = getConditionIdForFeature(featureName);
  if (conditionId === undefined) {
    return false;
  }

  // Check if any active condition has the matching ID
  return activeConditions.some((condition) => condition.id === conditionId);
}

/**
 * Get all ConditionIds that are currently active from a list of conditions.
 * Useful for batch checking or UI display.
 */
export function getActiveConditionIds(
  activeConditions: readonly Condition[]
): Set<ConditionId> {
  const ids = new Set<ConditionId>();
  for (const condition of activeConditions) {
    if (condition.id !== ConditionId.UNSPECIFIED) {
      ids.add(condition.id);
    }
  }
  return ids;
}
