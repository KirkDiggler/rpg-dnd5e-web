import { useEndTurn } from '@/api/encounterHooks';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { Ability } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerTurn } from '../hooks/usePlayerTurn';
import styles from '../styles/combat.module.css';
import { HoverInfoPanel, type HoveredEntity } from './HoverInfoPanel';

/** Convert Ability enum to abbreviation */
function getAbilityAbbrev(ability: Ability): string {
  const abbrevMap: Record<Ability, string> = {
    [Ability.UNSPECIFIED]: '?',
    [Ability.STRENGTH]: 'STR',
    [Ability.DEXTERITY]: 'DEX',
    [Ability.CONSTITUTION]: 'CON',
    [Ability.INTELLIGENCE]: 'INT',
    [Ability.WISDOM]: 'WIS',
    [Ability.CHARISMA]: 'CHA',
  };
  return abbrevMap[ability] || '?';
}

export interface ActionPanelV2Props {
  combatState: CombatState | null;
  encounterId: string | null;
  selectedCharacters: Character[];
  onCombatStateUpdate?: (combatState: CombatState) => void;
  onBackpackOpen?: () => void;
  /** Enable debug mode with bright colors for visibility testing */
  debug?: boolean;
  /** Currently hovered entity from the hex grid */
  hoveredEntity?: HoveredEntity | null;
  /** All characters for hover info lookup */
  characters?: Character[];
}

/**
 * ActionPanelV2 - Simplified combat action UI for HexGrid
 *
 * The map handles move/attack directly via clicks, so this panel focuses on:
 * - Character status display (HP, AC, conditions, etc.)
 * - Resource indicators (movement bar, action/bonus available)
 * - Backpack and End Turn buttons
 * - Combat log display
 * - Future: Class feature buttons (Rage, Second Wind, etc.)
 *
 * Removed from original ActionPanel:
 * - Move button (map handles this)
 * - Attack button (map handles this)
 * - Execute/Cancel move buttons (not needed)
 *
 * This component renders at the bottom of the viewport using createPortal
 * to ensure it's always visible regardless of parent container styling.
 */
export function ActionPanelV2({
  combatState,
  encounterId,
  selectedCharacters,
  onCombatStateUpdate,
  onBackpackOpen,
  debug = false,
  hoveredEntity,
  characters = [],
}: ActionPanelV2Props) {
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

  // Check if character has Rage feature
  const hasRageFeature =
    currentCharacter?.features?.some((f) => f.id === 'rage') ?? false;

  // Check if character is already raging
  const isRaging =
    currentCharacter?.activeConditions?.some(
      (c) => c.name === 'raging' || c.name === 'Raging'
    ) ?? false;

  // Check if character has Dueling fighting style active
  const hasDueling =
    currentCharacter?.activeConditions?.some(
      (c) => c.name === 'dueling' || c.name === 'Dueling'
    ) ?? false;

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
        minHeight: '160px',
        backgroundColor: debug ? '#ff00ff' : '#1e293b',
        borderTop: debug ? '5px solid #ffff00' : '2px solid #475569',
        boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.3)',
        pointerEvents: 'auto',
      }}
    >
      {/* Three-column layout: HoverInfo | Main Content | Combat Log (future) */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          padding: '12px 16px',
          alignItems: 'flex-start',
        }}
      >
        {/* Left Column: Hover Info Panel */}
        <HoverInfoPanel
          hoveredEntity={hoveredEntity || null}
          selectedEntity={null}
          currentCharacter={currentCharacter}
          characters={characters}
        />

        {/* Center Column: Main Action Panel Content */}
        <div style={{ flex: 1 }}>
          <div className={styles.actionPanelContainer}>
            {/* Header Section */}
            <div className={styles.actionPanelHeader}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
              >
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
                {/* Saving throw proficiencies */}
                {currentCharacter.proficiencies?.savingThrows &&
                  currentCharacter.proficiencies.savingThrows.length > 0 && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginLeft: '8px',
                      }}
                    >
                      Saves:{' '}
                      {currentCharacter.proficiencies.savingThrows
                        .map((ability) => getAbilityAbbrev(ability))
                        .join(', ')}
                    </div>
                  )}
              </div>
            </div>

            {/* Active Conditions */}
            {(isRaging || hasDueling) && (
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                {isRaging && (
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#fca5a5',
                    }}
                  >
                    🔥 Raging
                  </span>
                )}
                {hasDueling && (
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.5)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#93c5fd',
                    }}
                  >
                    ⚔️ Dueling
                  </span>
                )}
              </div>
            )}

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
              {/* Future: Class feature buttons will go here */}
              {/* Example: Rage button for Barbarians */}
              {hasRageFeature && !isRaging && (
                <button
                  disabled={!resources.hasBonusAction}
                  className={`${styles.actionButton} ${styles.attack} ${
                    !resources.hasBonusAction ? styles.disabled : ''
                  }`}
                  title={
                    !resources.hasBonusAction
                      ? 'No bonus action'
                      : 'Activate Rage (Bonus Action)'
                  }
                >
                  🔥 Rage
                </button>
              )}

              {/* Backpack Button */}
              <button
                onClick={onBackpackOpen}
                className={`${styles.actionButton} ${styles.ability}`}
              >
                🎒 Backpack
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

        {/* Right Column: Combat Log - Placeholder for future implementation */}
        {/* TODO: Add combat log display here */}
      </div>
    </div>
  );

  // Render using portal if container is ready, otherwise render nothing
  return portalContainer ? createPortal(panelContent, portalContainer) : null;
}
