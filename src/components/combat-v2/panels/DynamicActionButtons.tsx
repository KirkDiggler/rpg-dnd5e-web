import { getClassActions, type ClassAction } from '@/utils/classActions';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { TurnState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import styles from '../styles/combat.module.css';

export interface DynamicActionButtonsProps {
  character: Character;
  turnState: TurnState | null | undefined;
  onAttack?: () => void;
  onMove?: () => void;
  onSpell?: () => void;
  onFeature?: (featureId: string) => void;
  onBackpack?: () => void;
  disabled?: boolean; // Global disable when not player's turn
}

/**
 * DynamicActionButtons - Renders action buttons based on character class
 *
 * This component:
 * 1. Uses getClassActions(character.class) to get class-specific actions
 * 2. Renders a button for each action with icon and label
 * 3. Disables buttons based on action economy (no action left = disable action buttons)
 * 4. Handles button clicks with callbacks for different action types
 * 5. Shows visual feedback for active abilities (e.g., Rage active = button highlighted)
 *
 * Button behavior:
 * - Attack: calls onAttack, requires action available
 * - Move: calls onMove, always available (free action)
 * - Spell: calls onSpell, requires action available
 * - Class features (rage, second_wind, etc.): calls onFeature(featureId), check actionType for economy
 * - Backpack: calls onBackpack, always available (free action)
 *
 * Visual states:
 * - Normal: dark button with icon
 * - Hover: lighter background, scale effect
 * - Disabled: grayed out, cursor not-allowed
 * - Active (for toggles like Rage): highlighted border when condition is active
 */
export function DynamicActionButtons({
  character,
  turnState,
  onAttack,
  onMove,
  onSpell,
  onFeature,
  onBackpack,
  disabled = false,
}: DynamicActionButtonsProps) {
  // Get class-specific actions
  const { actions } = getClassActions(character.class);

  // Extract action economy state
  const actionAvailable = turnState ? !turnState.actionUsed : true;
  const bonusActionAvailable = turnState ? !turnState.bonusActionUsed : true;

  // Get active conditions for highlighting active abilities
  const activeConditions = character.activeConditions || [];

  return (
    <div className={styles.dynamicActionButtons}>
      {actions.map((action) => (
        <ActionButton
          key={action.id}
          action={action}
          actionAvailable={actionAvailable}
          bonusActionAvailable={bonusActionAvailable}
          activeConditions={activeConditions}
          disabled={disabled}
          onAttack={onAttack}
          onMove={onMove}
          onSpell={onSpell}
          onFeature={onFeature}
          onBackpack={onBackpack}
        />
      ))}
    </div>
  );
}

interface ActionButtonProps {
  action: ClassAction;
  actionAvailable: boolean;
  bonusActionAvailable: boolean;
  activeConditions: Character['activeConditions'];
  disabled: boolean;
  onAttack?: () => void;
  onMove?: () => void;
  onSpell?: () => void;
  onFeature?: (featureId: string) => void;
  onBackpack?: () => void;
}

function ActionButton({
  action,
  actionAvailable,
  bonusActionAvailable,
  activeConditions,
  disabled,
  onAttack,
  onMove,
  onSpell,
  onFeature,
  onBackpack,
}: ActionButtonProps) {
  // Determine if this specific button should be disabled based on action economy
  const isActionDisabled = getActionDisabled(
    action,
    actionAvailable,
    bonusActionAvailable,
    disabled
  );

  // Check if this action is currently active (e.g., Rage is active)
  const isActive = isActionActive(action, activeConditions);

  // Handle button click
  const handleClick = () => {
    if (isActionDisabled) return;

    switch (action.id) {
      case 'attack':
        onAttack?.();
        break;
      case 'move':
        onMove?.();
        break;
      case 'spell':
        onSpell?.();
        break;
      case 'backpack':
        onBackpack?.();
        break;
      default:
        // Class-specific features
        if (action.featureId && onFeature) {
          onFeature(action.featureId);
        }
        break;
    }
  };

  // Determine button CSS classes
  const buttonClasses = [
    styles.dynamicActionButton,
    styles[`actionButton${capitalize(action.id)}`], // e.g., actionButtonAttack
    isActionDisabled ? styles.actionButtonDisabled : '',
    isActive ? styles.actionButtonActive : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={buttonClasses}
      onClick={handleClick}
      disabled={isActionDisabled}
      title={getActionTooltip(action, isActive)}
      type="button"
    >
      <span className={styles.actionButtonIcon}>{action.icon}</span>
      <span className={styles.actionButtonLabel}>{action.label}</span>
    </button>
  );
}

/**
 * Determine if an action button should be disabled based on action economy
 */
function getActionDisabled(
  action: ClassAction,
  actionAvailable: boolean,
  bonusActionAvailable: boolean,
  globalDisabled: boolean
): boolean {
  // Global disable takes precedence (not player's turn)
  if (globalDisabled) return true;

  // Check action economy requirements
  switch (action.actionType) {
    case 'action':
      return !actionAvailable;
    case 'bonus_action':
      return !bonusActionAvailable;
    case 'free':
    case 'special':
      // Free actions and special actions are always available
      return false;
    default:
      return false;
  }
}

/**
 * Check if an action is currently active based on character's active conditions
 */
function isActionActive(
  action: ClassAction,
  activeConditions: Character['activeConditions']
): boolean {
  // Map action IDs to condition names that indicate they're active
  const activeConditionMap: Record<string, string[]> = {
    rage: ['raging', 'rage'],
    // Add more mappings as needed for other toggleable features
  };

  const conditionNames = activeConditionMap[action.id];
  if (!conditionNames) return false;

  // Check if any of the expected conditions are active
  const conditionNamesLower = activeConditions.map((c) =>
    (c.name || '').toLowerCase()
  );
  return conditionNames.some((name) => conditionNamesLower.includes(name));
}

/**
 * Get tooltip text for an action button
 */
function getActionTooltip(action: ClassAction, isActive: boolean): string {
  const baseTooltip = action.description || action.label;

  if (isActive) {
    return `${baseTooltip} (Active)`;
  }

  return baseTooltip;
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
