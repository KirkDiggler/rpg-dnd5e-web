import type {
  ActionEconomy,
  AvailableAbility,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  ActionId,
  CombatAbilityId,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import styles from '../styles/combat.module.css';

/** Base combat abilities every character can use (D&D 5e rules) */
const BASE_COMBAT_ABILITIES: {
  id: CombatAbilityId;
  name: string;
  icon: string;
  actionType: 'action' | 'bonus' | 'free';
  description: string;
}[] = [
  {
    id: CombatAbilityId.ATTACK,
    name: 'Attack',
    icon: '⚔️',
    actionType: 'action',
    description: 'Make weapon attacks',
  },
  {
    id: CombatAbilityId.DASH,
    name: 'Dash',
    icon: '💨',
    actionType: 'action',
    description: 'Double your movement',
  },
  {
    id: CombatAbilityId.DODGE,
    name: 'Dodge',
    icon: '🛡️',
    actionType: 'action',
    description: 'Attacks against you have disadvantage',
  },
  {
    id: CombatAbilityId.DISENGAGE,
    name: 'Disengage',
    icon: '🏃',
    actionType: 'action',
    description: "Movement doesn't provoke opportunity attacks",
  },
  {
    id: CombatAbilityId.HELP,
    name: 'Help',
    icon: '🤝',
    actionType: 'action',
    description: 'Give an ally advantage on their next check',
  },
  {
    id: CombatAbilityId.HIDE,
    name: 'Hide',
    icon: '👁️',
    actionType: 'action',
    description: 'Attempt to hide from enemies',
  },
  {
    id: CombatAbilityId.OFFHAND_ATTACK,
    name: 'Off-hand Attack',
    icon: '🗡️',
    actionType: 'bonus',
    description: 'Attack with off-hand weapon (two-weapon fighting)',
  },
];

export interface CombatAbilitiesPanelProps {
  actionEconomy: ActionEconomy | null | undefined;
  availableAbilities: AvailableAbility[];
  availableActions: AvailableAction[];
  disabled?: boolean;
  onAbilityClick?: (abilityId: CombatAbilityId) => void;
  onActionClick?: (actionId: ActionId) => void;
}

/**
 * CombatAbilitiesPanel - Data-driven display of combat abilities and actions
 *
 * Shows:
 * 1. Base combat abilities with availability computed from ActionEconomy
 * 2. Available actions after ability activation (STRIKE, OFF_HAND_STRIKE, etc.)
 */
export function CombatAbilitiesPanel({
  actionEconomy,
  availableAbilities,
  availableActions,
  disabled = false,
  onAbilityClick,
  onActionClick,
}: CombatAbilitiesPanelProps) {
  // Compute ability availability from ActionEconomy
  const getAbilityAvailability = (
    abilityId: CombatAbilityId
  ): { canUse: boolean; reason: string } => {
    if (!actionEconomy) {
      return { canUse: false, reason: 'No action economy data' };
    }

    // Check if API provided availability (overrides computed)
    const apiAbility = availableAbilities.find(
      (a) => a.abilityId === abilityId
    );
    if (apiAbility) {
      return { canUse: apiAbility.canUse, reason: apiAbility.reason };
    }

    // Compute from ActionEconomy
    const base = BASE_COMBAT_ABILITIES.find((a) => a.id === abilityId);
    if (!base) {
      return { canUse: false, reason: 'Unknown ability' };
    }

    if (base.actionType === 'action') {
      if (!actionEconomy.standardActionAvailable) {
        return { canUse: false, reason: 'Action already used' };
      }
      // Special case: Dodge already active
      if (abilityId === CombatAbilityId.DODGE && actionEconomy.dodgeActive) {
        return { canUse: false, reason: 'Already dodging' };
      }
      // Special case: Disengage already active
      if (
        abilityId === CombatAbilityId.DISENGAGE &&
        actionEconomy.disengageActive
      ) {
        return { canUse: false, reason: 'Already disengaged' };
      }
      return { canUse: true, reason: '' };
    }

    if (base.actionType === 'bonus') {
      if (!actionEconomy.bonusActionAvailable) {
        return { canUse: false, reason: 'Bonus action already used' };
      }
      // Off-hand attack requires having off-hand attacks remaining
      if (
        abilityId === CombatAbilityId.OFFHAND_ATTACK &&
        actionEconomy.offHandAttacksRemaining <= 0
      ) {
        return { canUse: false, reason: 'No off-hand attacks available' };
      }
      return { canUse: true, reason: '' };
    }

    return { canUse: true, reason: '' };
  };

  // Group abilities by action type
  const actionAbilities = BASE_COMBAT_ABILITIES.filter(
    (a) => a.actionType === 'action'
  );
  const bonusAbilities = BASE_COMBAT_ABILITIES.filter(
    (a) => a.actionType === 'bonus'
  );

  return (
    <div className={styles.combatAbilitiesPanel}>
      {/* Standard Actions */}
      <div className={styles.abilitySection}>
        <div className={styles.abilitySectionHeader}>Actions</div>
        <div className={styles.abilityGrid}>
          {actionAbilities.map((ability) => {
            const { canUse, reason } = getAbilityAvailability(ability.id);
            const isDisabled = disabled || !canUse;

            return (
              <button
                key={ability.id}
                className={`${styles.abilityBtn} ${canUse ? styles.abilityBtnAvailable : styles.abilityBtnUnavailable}`}
                disabled={isDisabled}
                onClick={() => !isDisabled && onAbilityClick?.(ability.id)}
                title={canUse ? ability.description : reason}
              >
                <span className={styles.abilityIcon}>{ability.icon}</span>
                <span className={styles.abilityName}>{ability.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bonus Actions */}
      {bonusAbilities.some(
        (a) =>
          getAbilityAvailability(a.id).canUse || availableAbilities.length > 0
      ) && (
        <div className={styles.abilitySection}>
          <div className={styles.abilitySectionHeader}>Bonus Actions</div>
          <div className={styles.abilityGrid}>
            {bonusAbilities.map((ability) => {
              const { canUse, reason } = getAbilityAvailability(ability.id);
              const isDisabled = disabled || !canUse;

              return (
                <button
                  key={ability.id}
                  className={`${styles.abilityBtn} ${canUse ? styles.abilityBtnAvailable : styles.abilityBtnUnavailable}`}
                  disabled={isDisabled}
                  onClick={() => !isDisabled && onAbilityClick?.(ability.id)}
                  title={canUse ? ability.description : reason}
                >
                  <span className={styles.abilityIcon}>{ability.icon}</span>
                  <span className={styles.abilityName}>{ability.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Actions (after activating abilities like ATTACK) */}
      {availableActions.length > 0 && (
        <div className={styles.abilitySection}>
          <div className={styles.abilitySectionHeader}>
            Available Strikes ({availableActions.filter((a) => a.canUse).length}
            )
          </div>
          <div className={styles.abilityGrid}>
            {availableActions.map((action, index) => (
              <button
                key={`${action.actionId}-${index}`}
                className={`${styles.abilityBtn} ${action.canUse ? styles.abilityBtnStrike : styles.abilityBtnUnavailable}`}
                disabled={disabled || !action.canUse}
                onClick={() =>
                  action.canUse && onActionClick?.(action.actionId)
                }
                title={action.canUse ? action.name : action.reason}
              >
                <span className={styles.abilityIcon}>⚔️</span>
                <span className={styles.abilityName}>{action.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
