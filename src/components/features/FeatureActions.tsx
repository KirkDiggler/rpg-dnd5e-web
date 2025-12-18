import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ActionType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { FeatureActionButton } from './FeatureActionButton';
import styles from './features.module.css';

export interface FeatureActionsProps {
  /** Character whose features to display */
  character: Character;
  /** Whether the character's action is available */
  actionAvailable?: boolean;
  /** Whether the character's bonus action is available */
  bonusActionAvailable?: boolean;
  /** Whether buttons should be globally disabled (not player's turn) */
  disabled?: boolean;
  /** Callback when a feature is activated */
  onActivateFeature?: (featureId: string) => void;
}

/**
 * FeatureActions - Renders activatable feature buttons from character.features
 *
 * This component:
 * - Reads features from character.features[] (API is source of truth)
 * - Groups features by action type for visual organization
 * - Checks active conditions to show active state
 * - Handles action economy (disable if no action/bonus action available)
 *
 * Replaces the hardcoded classActions.ts approach.
 */
export function FeatureActions({
  character,
  actionAvailable = true,
  bonusActionAvailable = true,
  disabled = false,
  onActivateFeature,
}: FeatureActionsProps) {
  const features = character.features || [];
  const activeConditions = character.activeConditions || [];

  // Show all features - even those without action_type set
  // Features with UNSPECIFIED action_type are shown but as read-only
  if (features.length === 0) {
    return null;
  }

  // Group by action type for visual organization
  const grouped = groupByActionType(features);

  return (
    <div className={styles.featureActions}>
      {/* Bonus Actions first (most commonly used class features) */}
      {grouped.bonusAction.length > 0 && (
        <div className={styles.featureGroup}>
          {grouped.bonusAction.map((feature) => (
            <FeatureActionButton
              key={feature.id}
              feature={feature}
              isActive={isFeatureActive(feature.id, activeConditions)}
              actionAvailable={actionAvailable}
              bonusActionAvailable={bonusActionAvailable}
              disabled={disabled}
              onActivate={onActivateFeature}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      {grouped.action.length > 0 && (
        <div className={styles.featureGroup}>
          {grouped.action.map((feature) => (
            <FeatureActionButton
              key={feature.id}
              feature={feature}
              isActive={isFeatureActive(feature.id, activeConditions)}
              actionAvailable={actionAvailable}
              bonusActionAvailable={bonusActionAvailable}
              disabled={disabled}
              onActivate={onActivateFeature}
            />
          ))}
        </div>
      )}

      {/* Free actions (declarations like Reckless Attack) */}
      {grouped.free.length > 0 && (
        <div className={styles.featureGroup}>
          {grouped.free.map((feature) => (
            <FeatureActionButton
              key={feature.id}
              feature={feature}
              isActive={isFeatureActive(feature.id, activeConditions)}
              actionAvailable={actionAvailable}
              bonusActionAvailable={bonusActionAvailable}
              disabled={disabled}
              onActivate={onActivateFeature}
            />
          ))}
        </div>
      )}

      {/* Reactions (usually triggered, but shown for awareness) */}
      {grouped.reaction.length > 0 && (
        <div className={styles.featureGroup}>
          {grouped.reaction.map((feature) => (
            <FeatureActionButton
              key={feature.id}
              feature={feature}
              isActive={isFeatureActive(feature.id, activeConditions)}
              actionAvailable={actionAvailable}
              bonusActionAvailable={bonusActionAvailable}
              disabled={disabled}
              onActivate={onActivateFeature}
            />
          ))}
        </div>
      )}

      {/* Unspecified action type - show but read-only until API populates action_type */}
      {grouped.unspecified.length > 0 && (
        <div className={styles.featureGroup}>
          {grouped.unspecified.map((feature) => (
            <FeatureActionButton
              key={feature.id}
              feature={feature}
              isActive={isFeatureActive(feature.id, activeConditions)}
              actionAvailable={actionAvailable}
              bonusActionAvailable={bonusActionAvailable}
              disabled={disabled}
              readOnly
              onActivate={onActivateFeature}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type FeaturesList = NonNullable<Character['features']>;

interface GroupedFeatures {
  action: FeaturesList;
  bonusAction: FeaturesList;
  reaction: FeaturesList;
  free: FeaturesList;
  unspecified: FeaturesList;
}

function groupByActionType(
  features: NonNullable<Character['features']>
): GroupedFeatures {
  const grouped: GroupedFeatures = {
    action: [],
    bonusAction: [],
    reaction: [],
    free: [],
    unspecified: [],
  };

  for (const feature of features) {
    switch (feature.actionType) {
      case ActionType.ACTION:
        grouped.action.push(feature);
        break;
      case ActionType.BONUS_ACTION:
        grouped.bonusAction.push(feature);
        break;
      case ActionType.REACTION:
        grouped.reaction.push(feature);
        break;
      case ActionType.FREE:
        grouped.free.push(feature);
        break;
      case ActionType.UNSPECIFIED:
      default:
        // Show unspecified features as read-only
        grouped.unspecified.push(feature);
        break;
    }
  }

  return grouped;
}

/**
 * Check if a feature is currently active by looking at active conditions.
 * Maps feature IDs to their corresponding condition names.
 */
function isFeatureActive(
  featureId: string,
  activeConditions: NonNullable<Character['activeConditions']>
): boolean {
  // Map feature IDs to condition names that indicate they're active
  const featureToConditionMap: Record<string, string[]> = {
    rage: ['raging', 'Raging'],
    // Add more mappings as needed
  };

  const conditionNames = featureToConditionMap[featureId];
  if (!conditionNames) return false;

  const activeConditionNames = activeConditions.map((c) => c.name || '');
  return conditionNames.some((name) => activeConditionNames.includes(name));
}
