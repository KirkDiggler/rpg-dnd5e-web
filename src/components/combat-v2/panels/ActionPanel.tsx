import { useEndTurn } from '@/api/encounterHooks';
import {
  ConditionsDisplay,
  EquipmentSlots,
  FeatureActions,
} from '@/components/features';
import { hexDistance, type CubeCoord } from '@/utils/hexUtils';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { FeatureId } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerTurn } from '../hooks/usePlayerTurn';
import styles from '../styles/combat.module.css';

export interface ActionPanelProps {
  combatState: CombatState | null;
  encounterId: string | null;
  selectedCharacters: Character[];
  room: Room | null;
  attackTarget?: string | null;
  onMoveAction?: () => void;
  onAttackAction?: () => void;
  onActivateFeature?: (featureId: FeatureId) => void;
  onCombatStateUpdate?: (combatState: CombatState) => void;
  movementMode?: boolean;
  movementPath?: CubeCoord[];
  onExecuteMove?: () => void;
  onCancelMove?: () => void;
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
  room,
  attackTarget,
  onMoveAction,
  onAttackAction,
  onActivateFeature,
  onCombatStateUpdate,
  movementMode = false,
  movementPath = [],
  onExecuteMove,
  onCancelMove,
  debug = false,
}: ActionPanelProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );
  const { endTurn, loading: endTurnLoading } = useEndTurn();

  // Extract turn information using our custom hook
  const { isPlayerTurn, currentCharacter, currentTurn, resources } =
    usePlayerTurn({
      combatState,
      selectedCharacters,
    });

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

  // Check if attack target is adjacent (for melee attacks)
  // Server provides cube coordinates in position.x, position.y, position.z
  const isTargetAdjacent = (() => {
    if (!attackTarget || !room || !currentTurn.entityId) return false;

    const currentEntity = room.entities[currentTurn.entityId];
    const targetEntity = room.entities[attackTarget];

    if (!currentEntity?.position || !targetEntity?.position) return false;

    const distance = hexDistance(
      currentEntity.position.x,
      currentEntity.position.y,
      currentEntity.position.z,
      targetEntity.position.x,
      targetEntity.position.y,
      targetEntity.position.z
    );

    return distance === 1;
  })();

  // Attack button should be enabled if:
  // 1. Has action available
  // 2. Has a target selected
  // 3. Target is adjacent (for now, only melee)
  const canAttack = resources.hasAction && attackTarget && isTargetAdjacent;

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
            <EquipmentSlots character={currentCharacter} />
          </div>
        </div>

        {/* Conditions Row */}
        <ConditionsDisplay character={currentCharacter} />

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
          {/* Attack Button */}
          <button
            onClick={onAttackAction}
            disabled={!canAttack}
            className={`${styles.actionButton} ${styles.attack} ${
              !canAttack ? styles.disabled : ''
            }`}
            title={
              !resources.hasAction
                ? 'No action available'
                : !attackTarget
                  ? 'Select a target'
                  : !isTargetAdjacent
                    ? 'Target not adjacent'
                    : 'Attack target'
            }
          >
            ⚔️ Attack
            {attackTarget && !isTargetAdjacent && (
              <span style={{ fontSize: '10px', marginLeft: '4px' }}>
                (too far)
              </span>
            )}
          </button>

          {/* Move Button */}
          <button
            onClick={onMoveAction}
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

          {/* Execute/Cancel buttons when path exists */}
          {movementMode && movementPath && movementPath.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Path: {movementPath.length} steps ({movementPath.length * 5}ft)
              </span>
              <button
                onClick={onExecuteMove}
                className={`${styles.actionButton} ${styles.spell}`}
              >
                ✓ Execute
              </button>
              <button
                onClick={onCancelMove}
                className={`${styles.actionButton} ${styles.attack}`}
              >
                ✗ Cancel
              </button>
            </div>
          )}

          {/* Class Feature Actions - driven by character.features from API */}
          <FeatureActions
            character={currentCharacter}
            actionAvailable={resources.hasAction}
            bonusActionAvailable={resources.hasBonusAction}
            onActivateFeature={onActivateFeature}
          />

          {/* Inventory Button */}
          <button
            className={`${styles.actionButton} ${styles.ability}`}
            title="Open inventory"
          >
            🎒 Inventory
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
