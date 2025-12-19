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
 * CombatPanel - Compact combat interface
 *
 * Layout: Single row with all combat info
 * - Floating overlays: HoverInfoPanel (left), CombatLog (right) - over the map
 * - Bottom panel: Character info, equipment, conditions, action economy, actions
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
  const actionsDisabled = !isPlayerTurn;
  const showHoverPanel = hoveredEntity || selectedHoverEntity;

  return (
    <div className={styles.combatPanel}>
      {/* Floating Hover Info Panel - bottom left, above panel */}
      {showHoverPanel && (
        <div className={styles.floatingHoverPanel}>
          <HoverInfoPanel
            hoveredEntity={hoveredEntity || null}
            selectedEntity={selectedHoverEntity || null}
            currentCharacter={character}
            characters={characters}
          />
        </div>
      )}

      {/* Floating Combat Log - right side, over the map */}
      {combatState && (
        <div className={styles.floatingCombatLog}>
          <CombatHistorySidebar
            combatState={combatState}
            logEntries={combatLog}
          />
        </div>
      )}

      {/* Main Panel Content - single row layout */}
      <div className={styles.combatPanelContent}>
        {/* Turn Badge */}
        <div
          className={styles.turnBadge}
          style={{
            background: isPlayerTurn
              ? 'linear-gradient(90deg, #10B981, #059669)'
              : 'rgba(100, 116, 139, 0.8)',
            color: isPlayerTurn ? 'white' : '#94a3b8',
          }}
        >
          {isPlayerTurn ? '⚔️ YOUR TURN' : '⏳ WAITING'}
        </div>

        {/* Character Info */}
        <CharacterInfoSection character={character} />

        {/* Divider */}
        <div className={styles.panelDivider} />

        {/* Equipment */}
        <EquipmentDisplay
          character={character}
          onWeaponClick={onWeaponClick}
          disabled={actionsDisabled}
        />

        {/* Conditions */}
        <ConditionsDisplay character={character} />

        {/* Divider */}
        <div className={styles.panelDivider} />

        {/* Action Economy */}
        <ActionEconomyIndicators turnState={turnState} />

        {/* Divider */}
        <div className={styles.panelDivider} />

        {/* Action Buttons */}
        <div className={styles.actionButtonGroup}>
          <button
            className={`${styles.actionBtn} ${styles.actionBtnAttack}`}
            onClick={onAttack}
            disabled={actionsDisabled || turnState?.actionUsed}
            title="Attack target"
          >
            ⚔️ Attack
          </button>

          <button
            className={`${styles.actionBtn} ${styles.actionBtnMove}`}
            onClick={onMove}
            disabled={actionsDisabled}
            title="Move your character"
          >
            🏃 Move
          </button>

          <FeatureActions
            character={character}
            actionAvailable={!turnState?.actionUsed}
            bonusActionAvailable={!turnState?.bonusActionUsed}
            disabled={actionsDisabled}
            onActivateFeature={onFeature}
          />

          <button
            className={styles.actionBtn}
            onClick={onBackpack}
            disabled={actionsDisabled}
            title="Open inventory"
          >
            🎒
          </button>

          <button
            className={`${styles.actionBtn} ${styles.actionBtnEndTurn}`}
            onClick={onEndTurn}
            disabled={actionsDisabled}
            title="End your turn"
          >
            End Turn
          </button>
        </div>
      </div>
    </div>
  );
}
