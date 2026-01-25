import type {
  AvailableAbility,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  ActionId,
  CombatAbilityId,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import styles from '../styles/combat.module.css';

export interface AvailableActionsDisplayProps {
  availableAbilities: AvailableAbility[];
  availableActions: AvailableAction[];
  onAbilityClick?: (abilityId: CombatAbilityId) => void;
  onActionClick?: (actionId: ActionId) => void;
  loading?: boolean;
}

/** Get icon for combat ability */
function getAbilityIcon(abilityId: CombatAbilityId): string {
  const icons: Record<CombatAbilityId, string> = {
    [CombatAbilityId.UNSPECIFIED]: '❓',
    [CombatAbilityId.ATTACK]: '⚔️',
    [CombatAbilityId.DASH]: '💨',
    [CombatAbilityId.DODGE]: '🛡️',
    [CombatAbilityId.DISENGAGE]: '🏃',
    [CombatAbilityId.HELP]: '🤝',
    [CombatAbilityId.HIDE]: '👁️',
    [CombatAbilityId.READY]: '⏳',
    [CombatAbilityId.OFFHAND_ATTACK]: '🗡️',
    [CombatAbilityId.FLURRY_OF_BLOWS]: '👊',
  };
  return icons[abilityId] || '❓';
}

/**
 * AvailableActionsDisplay - Shows available combat abilities and actions
 *
 * This component receives the available_abilities and available_actions
 * from ActivateCombatAbility/ExecuteAction responses and displays them
 * with their availability status.
 */
export function AvailableActionsDisplay({
  availableAbilities,
  availableActions,
  onAbilityClick,
  onActionClick,
  loading = false,
}: AvailableActionsDisplayProps) {
  if (loading) {
    return (
      <div className={styles.availableActionsContainer}>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Loading...
        </span>
      </div>
    );
  }

  if (availableAbilities.length === 0 && availableActions.length === 0) {
    return null;
  }

  return (
    <div className={styles.availableActionsContainer}>
      {/* Available Abilities Section */}
      {availableAbilities.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Abilities
          </span>
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            {availableAbilities.map((ability) => (
              <button
                key={ability.abilityId}
                disabled={!ability.canUse}
                onClick={() =>
                  ability.canUse && onAbilityClick?.(ability.abilityId)
                }
                title={ability.canUse ? ability.name : ability.reason}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: ability.canUse
                    ? '1px solid rgba(34, 197, 94, 0.5)'
                    : '1px solid rgba(100, 100, 100, 0.3)',
                  backgroundColor: ability.canUse
                    ? 'rgba(34, 197, 94, 0.15)'
                    : 'rgba(100, 100, 100, 0.1)',
                  color: ability.canUse ? '#86efac' : '#666',
                  fontSize: '12px',
                  cursor: ability.canUse ? 'pointer' : 'not-allowed',
                  opacity: ability.canUse ? 1 : 0.6,
                }}
              >
                {getAbilityIcon(ability.abilityId)} {ability.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Available Actions Section */}
      {availableActions.length > 0 && (
        <div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Actions
          </span>
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
            {availableActions.map((action) => (
              <button
                key={action.actionId}
                disabled={!action.canUse}
                onClick={() =>
                  action.canUse && onActionClick?.(action.actionId)
                }
                title={action.canUse ? action.name : action.reason}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: action.canUse
                    ? '1px solid rgba(59, 130, 246, 0.5)'
                    : '1px solid rgba(100, 100, 100, 0.3)',
                  backgroundColor: action.canUse
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'rgba(100, 100, 100, 0.1)',
                  color: action.canUse ? '#93c5fd' : '#666',
                  fontSize: '12px',
                  cursor: action.canUse ? 'pointer' : 'not-allowed',
                  opacity: action.canUse ? 1 : 0.6,
                }}
              >
                {action.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
