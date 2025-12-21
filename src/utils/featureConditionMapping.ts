/**
 * Maps FeatureId enums to their corresponding active ConditionId enums.
 *
 * Some features (like Rage) apply a condition when activated. This mapping
 * allows the UI to check if a feature is currently active by looking at
 * the character's active conditions using type-safe enum keys.
 */

import type { Condition } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import {
  ConditionId,
  FeatureId,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Maps FeatureId to the ConditionId that indicates the feature is active.
 * Uses enum keys for full type safety.
 */
const FEATURE_TO_CONDITION: Readonly<Partial<Record<FeatureId, ConditionId>>> =
  {
    [FeatureId.RAGE]: ConditionId.RAGING,
    // Add more feature-to-condition mappings as features are implemented
  };

/**
 * Get the ConditionId associated with a FeatureId.
 * Returns undefined if the feature doesn't apply a trackable condition.
 */
export function getConditionIdForFeature(
  featureId: FeatureId
): ConditionId | undefined {
  return FEATURE_TO_CONDITION[featureId];
}

/**
 * Check if a feature is currently active by examining the character's active conditions.
 * Uses enum-based FeatureId and ConditionId matching for full type safety.
 *
 * @param featureId - The FeatureId enum of the feature to check
 * @param activeConditions - The character's active conditions array
 * @returns true if the feature's corresponding condition is active
 */
export function isFeatureActiveByCondition(
  featureId: FeatureId,
  activeConditions: readonly Condition[]
): boolean {
  const conditionId = getConditionIdForFeature(featureId);
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
