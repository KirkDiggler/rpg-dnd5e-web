import { ConditionsDisplay, FeatureActions } from '@/components/features';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  TurnState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import styles from '../styles/combat.module.css';
import { ActionEconomyIndicators } from './ActionEconomyIndicators';
import { CharacterInfoSection } from './CharacterInfoSection';
import {
  CombatHistorySidebar,
  type CombatLogEntry,
} from './CombatHistorySidebar';
import { EquipmentDisplay } from './EquipmentDisplay';
import { HoverInfoPanel, type HoveredEntity } from './HoverInfoPanel';

export interface CombatPanelProps {
  character: Character;
  combatState: CombatState | null;
  turnState: TurnState | null | undefined;
  isPlayerTurn: boolean;
  combatLog?: CombatLogEntry[];

  // Hover info props
  hoveredEntity?: HoveredEntity | null;
  selectedHoverEntity?: HoveredEntity | null;
  characters?: Character[];

  // Callbacks
  onAttack?: () => void;
  onMove?: () => void;
  onFeature?: (featureId: string) => void;
  onBackpack?: () => void;
  onWeaponClick?: (slot: 'mainHand' | 'offHand') => void;
  onEndTurn?: () => void;
}

/**
 * CombatPanel - Main combat interface composing all sub-components
 *
 * This is the unified combat panel that brings together:
 * 1. Character information (portrait, HP, AC, conditions)
 * 2. Equipment display (main hand / off hand weapons)
 * 3. Action economy indicators (movement, action, bonus, reaction)
 * 4. Dynamic action buttons (class-specific actions)
 * 5. Combat history sidebar (scrollable combat log)
 *
 * Layout:
 * - Two-column layout: ~70% main content (character info/actions), ~30% sidebar (combat log)
 * - Main content area stacks: CharacterInfo -> Equipment -> ActionEconomy -> ActionButtons
 * - Sidebar is fixed-height, scrollable
 * - Dark theme consistent with combat-v2 components
 * - Responsive design that adapts to mobile
 *
 * Props:
 * - character: Full character data (protobuf Character type)
 * - combatState: Current combat state (for combat log and round tracking)
 * - turnState: Current turn state (for action economy)
 * - isPlayerTurn: Whether it's the player's turn (disables actions when false)
 * - Callbacks: onAttack, onMove, onSpell, onFeature, onBackpack, onWeaponClick
 */
export function CombatPanel({
  character,
  combatState,
  turnState,
  isPlayerTurn,
  combatLog = [],
  hoveredEntity,
  selectedHoverEntity,
  characters = [],
  onAttack,
  onMove,
  onFeature,
  onBackpack,
  onWeaponClick,
  onEndTurn,
}: CombatPanelProps) {
  // Determine if actions should be globally disabled
  const actionsDisabled = !isPlayerTurn;

  return (
    <div className={styles.combatPanel}>
      {/* Turn Status Banner - prominent indicator for multiplayer */}
      <div
        style={{
          background: isPlayerTurn
            ? 'linear-gradient(90deg, #10B981, #059669)'
            : 'rgba(100, 116, 139, 0.8)',
          color: isPlayerTurn ? 'white' : '#94a3b8',
          padding: '6px 16px',
          textAlign: 'center',
          fontWeight: isPlayerTurn ? 'bold' : 'normal',
          fontSize: isPlayerTurn ? '13px' : '11px',
          textTransform: 'uppercase',
          letterSpacing: isPlayerTurn ? '2px' : '1px',
          boxShadow: isPlayerTurn
            ? '0 2px 8px rgba(16, 185, 129, 0.4)'
            : 'none',
        }}
      >
        {isPlayerTurn
          ? `⚔️ Your Turn — ${character.name}`
          : '⏳ Waiting for other player...'}
      </div>

      <div className={styles.combatPanelContainer}>
        {/* Left Column: Hover Info Panel */}
        <HoverInfoPanel
          hoveredEntity={hoveredEntity || null}
          selectedEntity={selectedHoverEntity || null}
          currentCharacter={character}
          characters={characters}
        />

        {/* Main Content Column */}
        <div className={styles.combatPanelMainContent}>
          {/* Character Info Section */}
          <CharacterInfoSection character={character} />

          {/* Equipment Display */}
          <EquipmentDisplay
            character={character}
            onWeaponClick={onWeaponClick}
            disabled={actionsDisabled}
          />

          {/* Active Conditions Display */}
          <ConditionsDisplay character={character} />

          {/* Action Economy Indicators */}
          <ActionEconomyIndicators turnState={turnState} />

          {/* Action Buttons */}
          <div className={styles.dynamicActionButtons}>
            {/* Core Actions */}
            <button
              className={`${styles.dynamicActionButton} ${styles.actionButtonAttack}`}
              onClick={onAttack}
              disabled={actionsDisabled || turnState?.actionUsed}
              title="Attack target"
            >
              <span className={styles.actionButtonIcon}>⚔️</span>
              <span className={styles.actionButtonLabel}>Attack</span>
            </button>

            <button
              className={`${styles.dynamicActionButton} ${styles.actionButtonMove}`}
              onClick={onMove}
              disabled={actionsDisabled}
              title="Move your character"
            >
              <span className={styles.actionButtonIcon}>🏃</span>
              <span className={styles.actionButtonLabel}>Move</span>
            </button>

            {/* Class Feature Actions - driven by character.features from API */}
            <FeatureActions
              character={character}
              actionAvailable={!turnState?.actionUsed}
              bonusActionAvailable={!turnState?.bonusActionUsed}
              disabled={actionsDisabled}
              onActivateFeature={onFeature}
            />

            <button
              className={`${styles.dynamicActionButton}`}
              onClick={onBackpack}
              disabled={actionsDisabled}
              title="Open inventory"
            >
              <span className={styles.actionButtonIcon}>🎒</span>
              <span className={styles.actionButtonLabel}>Inventory</span>
            </button>

            <button
              className={`${styles.dynamicActionButton} ${styles.actionButtonEndTurn}`}
              onClick={onEndTurn}
              disabled={actionsDisabled}
              title="End your turn"
            >
              <span className={styles.actionButtonIcon}>⏭️</span>
              <span className={styles.actionButtonLabel}>End Turn</span>
            </button>
          </div>
        </div>

        {/* Combat History Sidebar (30%) */}
        {combatState && (
          <div className={styles.combatPanelSidebar}>
            <CombatHistorySidebar
              combatState={combatState}
              logEntries={combatLog}
            />
          </div>
        )}
      </div>
    </div>
  );
}
