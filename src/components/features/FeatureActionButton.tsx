import type { CharacterFeature } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ActionType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { getFeatureIcon } from './featureIcons';
import styles from './features.module.css';

export interface FeatureActionButtonProps {
  feature: CharacterFeature;
  /** Whether this feature is currently active (e.g., Raging) */
  isActive?: boolean;
  /** Whether the required action type is available */
  actionAvailable?: boolean;
  /** Whether the required bonus action is available */
  bonusActionAvailable?: boolean;
  /** Whether the button should be globally disabled (not player's turn) */
  disabled?: boolean;
  /** Whether button is read-only (shown but not clickable - for unknown action types) */
  readOnly?: boolean;
  /** Callback when the feature is activated */
  onActivate?: (featureId: string) => void;
}

/**
 * FeatureActionButton - Renders a single activatable feature as a button
 *
 * Displays:
 * - Icon (from featureIcons lookup)
 * - Feature name
 * - Usage count if available (e.g., "2/3")
 *
 * States:
 * - Normal: Can be activated
 * - Active: Currently active (highlighted)
 * - Disabled: No uses left or action not available
 */
export function FeatureActionButton({
  feature,
  isActive = false,
  actionAvailable = true,
  bonusActionAvailable = true,
  disabled = false,
  readOnly = false,
  onActivate,
}: FeatureActionButtonProps) {
  const icon = getFeatureIcon(feature.id);

  // Determine if button should be disabled based on action economy
  const isDisabledByActionEconomy = getIsDisabledByActionEconomy(
    feature.actionType,
    actionAvailable,
    bonusActionAvailable
  );

  // Check usage (from feature.data when #303 is implemented)
  // For now, we'll assume features are always usable if action is available
  const usageData = parseUsageData(feature);
  const hasUsesRemaining = usageData ? usageData.remaining > 0 : true;

  // Read-only buttons are clickable but activate the feature
  // (useful when action_type not yet populated - we don't know the cost)
  const isButtonDisabled =
    disabled || isDisabledByActionEconomy || isActive || !hasUsesRemaining;

  const handleClick = () => {
    // Read-only buttons are still clickable - just no action economy check
    if (disabled || isActive) return;
    if (!readOnly && isButtonDisabled) return;
    onActivate?.(feature.id);
  };

  const buttonClasses = [
    styles.featureActionButton,
    isActive ? styles.active : '',
    isButtonDisabled && !readOnly ? styles.disabled : '',
    readOnly ? styles.readOnly : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={buttonClasses}
      onClick={handleClick}
      disabled={disabled || isActive}
      title={getTooltip(feature, isActive, isDisabledByActionEconomy, readOnly)}
    >
      <span className={styles.featureIcon}>{icon}</span>
      <span className={styles.featureName}>
        {isActive ? `${feature.name}!` : feature.name}
      </span>
      {usageData && (
        <span className={styles.featureUsage}>
          {usageData.remaining}/{usageData.max}
        </span>
      )}
    </button>
  );
}

/**
 * Check if button should be disabled based on action economy
 */
function getIsDisabledByActionEconomy(
  actionType: ActionType,
  actionAvailable: boolean,
  bonusActionAvailable: boolean
): boolean {
  switch (actionType) {
    case ActionType.ACTION:
      return !actionAvailable;
    case ActionType.BONUS_ACTION:
      return !bonusActionAvailable;
    case ActionType.REACTION:
      // Reactions are typically triggered, not clicked
      return false;
    case ActionType.FREE:
    case ActionType.UNSPECIFIED:
    default:
      return false;
  }
}

/**
 * Parse usage data from feature (placeholder for #303)
 */
function parseUsageData(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _feature: CharacterFeature
): { remaining: number; max: number } | null {
  // TODO: Parse from feature.data when #303 is implemented
  // For now return null (no usage tracking)
  return null;
}

/**
 * Generate tooltip text for the button
 */
function getTooltip(
  feature: CharacterFeature,
  isActive: boolean,
  isDisabledByActionEconomy: boolean,
  readOnly: boolean
): string {
  if (isActive) {
    return `${feature.name} is active`;
  }

  if (isDisabledByActionEconomy && !readOnly) {
    const actionName = getActionTypeName(feature.actionType);
    return `No ${actionName} available`;
  }

  const actionName = getActionTypeName(feature.actionType);
  const baseTooltip = feature.description || feature.name;

  if (readOnly) {
    return `${baseTooltip} (action type unknown)`;
  }

  if (actionName) {
    return `${baseTooltip} (${actionName})`;
  }

  return baseTooltip;
}

/**
 * Get human-readable name for action type
 */
function getActionTypeName(actionType: ActionType): string {
  switch (actionType) {
    case ActionType.ACTION:
      return 'Action';
    case ActionType.BONUS_ACTION:
      return 'Bonus Action';
    case ActionType.REACTION:
      return 'Reaction';
    case ActionType.FREE:
      return 'Free';
    default:
      return '';
  }
}
