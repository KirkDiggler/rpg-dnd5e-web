import { useAttack, useEndTurn } from '@/api/encounterHooks';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  AttackResponse,
  CombatState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerTurn } from '../hooks/usePlayerTurn';
import styles from '../styles/combat.module.css';

export interface ActionPanelProps {
  combatState: CombatState | null;
  encounterId: string | null;
  selectedCharacters: Character[];
  onMoveAction?: () => void;
  onAttackAction?: () => void;
  onAttackTarget?: (attackHandler: (targetId: string) => Promise<void>) => void;
  onCombatStateUpdate?: (combatState: CombatState) => void;
  onRoomUpdate?: (room: Room) => void;
  onAttackResult?: (result: AttackResponse) => void;
  movementMode?: boolean;
  attackMode?: boolean;
  /** Enable debug mode with bright colors for visibility testing */
  debug?: boolean;
}

/**
 * ActionPanel - Bulletproof combat action UI using React Portal
 *
 * This component renders at the bottom of the viewport using createPortal
 * to ensure it's always visible regardless of parent container styling.
 *
 * Key features:
 * - Renders using React Portal outside the normal DOM hierarchy
 * - Fixed positioning with explicit z-index management
 * - Fallback inline styles if CSS modules fail
 * - Debug mode with bright colors for testing visibility
 * - Uses protobuf types as single source of truth
 */
export function ActionPanel({
  combatState,
  encounterId,
  selectedCharacters,
  onMoveAction,
  onAttackAction,
  onAttackTarget,
  onCombatStateUpdate,
  onRoomUpdate,
  onAttackResult,
  movementMode = false,
  attackMode = false,
  debug = false,
}: ActionPanelProps) {
  // ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURNS
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );
  const { endTurn, loading: endTurnLoading } = useEndTurn();
  const { attack, loading: attackLoading } = useAttack();

  // Extract turn information using our custom hook
  const { isPlayerTurn, currentCharacter, currentTurn, resources } =
    usePlayerTurn({
      combatState,
      selectedCharacters,
    });

  // Define attack handler - must be before conditional returns for hooks order
  const handleAttackTarget = useCallback(
    async (targetId: string) => {
      if (!encounterId || !currentCharacter) return;
      try {
        const response = await attack(
          encounterId,
          currentCharacter.id,
          targetId
        );

        // Update combat state if provided
        if (response.combatState && onCombatStateUpdate) {
          onCombatStateUpdate(response.combatState);
        }

        // Update room if entities were removed/updated
        if (response.updatedRoom && onRoomUpdate) {
          onRoomUpdate(response.updatedRoom);
        }

        // Notify parent about attack result for UI feedback
        if (onAttackResult) {
          onAttackResult(response);
        }
      } catch (err) {
        console.error('Failed to attack target:', err);
      }
    },
    [
      encounterId,
      currentCharacter,
      attack,
      onCombatStateUpdate,
      onRoomUpdate,
      onAttackResult,
    ]
  );

  // Create portal container on mount
  useEffect(() => {
    // Create a dedicated container for the action panel
    let container = document.getElementById('action-panel-portal');
    if (!container) {
      container = document.createElement('div');
      container.id = 'action-panel-portal';
      container.style.position = 'fixed';
      container.style.bottom = '0';
      container.style.left = '0';
      container.style.right = '0';
      container.style.zIndex = '2500';
      container.style.pointerEvents = 'none'; // Allow clicks to pass through container
      document.body.appendChild(container);
    }
    setPortalContainer(container);

    // Cleanup function
    return () => {
      // Don't remove container on unmount - other panels might use it
    };
  }, []);

  // Expose the attack handler to parent component only when attack mode is activated
  useEffect(() => {
    if (onAttackTarget) {
      // Only set the handler when entering attack mode, clear it when leaving
      if (attackMode) {
        onAttackTarget(handleAttackTarget);
      } else {
        onAttackTarget(() => Promise.resolve());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackMode]); // Only depend on attackMode to avoid loops

  // NOW we can have conditional returns after all hooks are declared
  // Don't render if not a player turn or missing required data
  if (!isPlayerTurn || !currentCharacter || !currentTurn || !encounterId) {
    return null;
  }

  const handleEndTurn = async () => {
    if (!encounterId) return;
    try {
      const response = await endTurn(encounterId);
      if (response.combatState && onCombatStateUpdate) {
        onCombatStateUpdate(response.combatState);
      }
    } catch (err) {
      console.error('Failed to end turn:', err);
    }
  };

  const handleMoveClick = () => {
    if (onMoveAction) {
      onMoveAction();
    }
  };

  const handleAttackClick = () => {
    if (onAttackAction) {
      onAttackAction();
    }
  };

  const panelContent = (
    <div
      className={`${styles.actionPanel} ${debug ? styles.debug : ''}`}
      style={{
        // Fallback inline styles in case CSS modules fail
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 2500,
        minHeight: '180px',
        backgroundColor: debug ? '#ff00ff' : '#1e293b',
        borderTop: debug ? '5px solid #ffff00' : '2px solid #475569',
        boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.3)',
        pointerEvents: 'auto',
      }}
    >
      <div className={styles.actionPanelContainer}>
        {/* Header Section */}
        <div className={styles.actionPanelHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h3 className={styles.characterName}>
              {currentCharacter.name}'s Turn
            </h3>
            <span className={styles.roundBadge}>
              Round {combatState?.round || 1}
            </span>
          </div>

          <div className={styles.characterStats}>
            <div>
              HP:{' '}
              <span className={styles.statValue}>
                {currentCharacter.currentHitPoints}
              </span>
            </div>
            <div>
              AC:{' '}
              <span className={styles.statValue}>
                {currentCharacter.combatStats?.armorClass || 10}
              </span>
            </div>
          </div>
        </div>

        {/* Resources Section */}
        <div className={styles.resourcesSection}>
          {/* Movement */}
          <div className={styles.resourceItem}>
            <span className={styles.resourceLabel}>Movement:</span>
            <div className={styles.movementBar}>
              <div
                className={`${styles.movementBarFill} ${
                  resources.movementRemaining > 0
                    ? styles.hasMovement
                    : styles.noMovement
                }`}
                style={{
                  width: `${(resources.movementRemaining / resources.movementMax) * 100}%`,
                }}
              />
            </div>
            <span className={styles.movementText}>
              {resources.movementRemaining}ft
            </span>
          </div>

          {/* Action */}
          <div className={styles.resourceItem}>
            <span className={styles.resourceLabel}>Action:</span>
            <div
              className={`${styles.statusIcon} ${
                resources.hasAction ? styles.available : styles.used
              }`}
            >
              {resources.hasAction ? '✓' : '✗'}
            </div>
          </div>

          {/* Bonus Action */}
          <div className={styles.resourceItem}>
            <span className={styles.resourceLabel}>Bonus:</span>
            <div
              className={`${styles.statusIcon} ${
                resources.hasBonusAction ? styles.available : styles.used
              }`}
            >
              {resources.hasBonusAction ? '✓' : '✗'}
            </div>
          </div>
        </div>

        {/* Actions Section */}
        <div className={styles.actionsSection}>
          {/* Move Button */}
          <button
            onClick={handleMoveClick}
            disabled={!resources.movementRemaining}
            className={`${styles.actionButton} ${styles.move} ${
              movementMode ? styles.active : ''
            }`}
          >
            🏃{' '}
            {movementMode
              ? 'Cancel Move'
              : `Move (${resources.movementRemaining}ft)`}
          </button>

          {/* Attack Button */}
          <button
            onClick={handleAttackClick}
            disabled={!resources.hasAction || attackLoading}
            className={`${styles.actionButton} ${styles.attack} ${
              attackMode ? styles.active : ''
            } ${!resources.hasAction ? styles.disabled : ''}`}
          >
            ⚔️{' '}
            {attackLoading
              ? 'Attacking...'
              : attackMode
                ? 'Cancel Attack'
                : 'Attack'}
          </button>

          {/* Spell Button */}
          <button
            disabled={!resources.hasAction && !resources.hasBonusAction}
            className={`${styles.actionButton} ${styles.spell} ${
              !resources.hasAction && !resources.hasBonusAction
                ? styles.disabled
                : ''
            }`}
          >
            ✨ Spell
          </button>

          {/* Ability Button */}
          <button
            disabled={!resources.hasAction}
            className={`${styles.actionButton} ${styles.ability} ${
              !resources.hasAction ? styles.disabled : ''
            }`}
          >
            💪 Ability
          </button>

          {/* End Turn Button */}
          <button
            onClick={handleEndTurn}
            disabled={endTurnLoading}
            className={`${styles.actionButton} ${styles.endTurn}`}
          >
            {endTurnLoading ? '⏳ Ending...' : 'End Turn'}
          </button>
        </div>
      </div>
    </div>
  );

  // Render using portal if container is ready, otherwise render nothing
  return portalContainer ? createPortal(panelContent, portalContainer) : null;
}
