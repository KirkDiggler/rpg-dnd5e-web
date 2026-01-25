import { isFeatureActiveByCondition } from '@/utils/featureConditionMapping';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ActionType,
  type FeatureId,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import styles from '../styles/combat.module.css';

export interface FeaturesListPanelProps {
  character: Character;
  disabled?: boolean;
  onFeatureClick?: (featureId: FeatureId) => void;
}

/** Get action type label */
function getActionTypeLabel(actionType: ActionType): string {
  switch (actionType) {
    case ActionType.ACTION:
      return 'Action';
    case ActionType.BONUS_ACTION:
      return 'Bonus';
    case ActionType.REACTION:
      return 'Reaction';
    case ActionType.FREE:
      return 'Free';
    default:
      return 'Passive';
  }
}

/** Get action type color */
function getActionTypeColor(actionType: ActionType): string {
  switch (actionType) {
    case ActionType.ACTION:
      return '#ef4444'; // red
    case ActionType.BONUS_ACTION:
      return '#f59e0b'; // amber
    case ActionType.REACTION:
      return '#8b5cf6'; // purple
    case ActionType.FREE:
      return '#10b981'; // green
    default:
      return '#6b7280'; // gray
  }
}

/**
 * FeaturesListPanel - Raw display of character features
 *
 * Shows all features from character.features as a readable list
 * with action type, name, and active status.
 */
export function FeaturesListPanel({
  character,
  disabled = false,
  onFeatureClick,
}: FeaturesListPanelProps) {
  const features = character.features || [];
  const activeConditions = character.activeConditions || [];

  if (features.length === 0) {
    return (
      <div className={styles.featuresListPanel}>
        <div className={styles.featuresSectionHeader}>Features</div>
        <div className={styles.emptyFeatures}>No features</div>
      </div>
    );
  }

  // Separate activatable features from passive ones
  const activatable = features.filter(
    (f) =>
      f.actionType === ActionType.ACTION ||
      f.actionType === ActionType.BONUS_ACTION ||
      f.actionType === ActionType.REACTION ||
      f.actionType === ActionType.FREE
  );
  const passive = features.filter(
    (f) => f.actionType === ActionType.UNSPECIFIED || f.actionType === undefined
  );

  return (
    <div className={styles.featuresListPanel}>
      <div className={styles.featuresSectionHeader}>
        Features ({features.length})
      </div>

      {/* Activatable Features */}
      {activatable.length > 0 && (
        <div className={styles.featuresList}>
          {activatable.map((feature) => {
            const isActive = isFeatureActiveByCondition(
              feature.id,
              activeConditions
            );
            const canActivate =
              !disabled && !isActive && feature.actionType !== undefined;

            return (
              <button
                key={`${feature.id}-${feature.name}`}
                className={`${styles.featureItem} ${isActive ? styles.featureItemActive : ''}`}
                disabled={!canActivate}
                onClick={() => canActivate && onFeatureClick?.(feature.id)}
                title={feature.description || feature.name}
              >
                <span
                  className={styles.featureActionType}
                  style={{
                    backgroundColor: getActionTypeColor(feature.actionType),
                  }}
                >
                  {getActionTypeLabel(feature.actionType)}
                </span>
                <span className={styles.featureName}>{feature.name}</span>
                {isActive && (
                  <span className={styles.featureActiveIndicator}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Passive Features */}
      {passive.length > 0 && (
        <div className={styles.featuresList}>
          {passive.map((feature) => (
            <div
              key={`${feature.id}-${feature.name}`}
              className={`${styles.featureItem} ${styles.featureItemPassive}`}
              title={feature.description || feature.name}
            >
              <span
                className={styles.featureActionType}
                style={{
                  backgroundColor: getActionTypeColor(ActionType.UNSPECIFIED),
                }}
              >
                Passive
              </span>
              <span className={styles.featureName}>{feature.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
