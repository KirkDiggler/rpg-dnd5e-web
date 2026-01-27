import { ConditionsDisplay } from '@/components/features';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  AvailableAbility,
  AvailableAction,
  CombatState,
  MonsterCombatState,
  TurnState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  type ActionId,
  type CombatAbilityId,
  type FeatureId,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import styles from '../styles/combat.module.css';
import { ActionEconomyIndicators } from './ActionEconomyIndicators';
import { CharacterInfoSection } from './CharacterInfoSection';
import { CombatAbilitiesPanel } from './CombatAbilitiesPanel';
import {
  CombatHistorySidebar,
  type CombatLogEntry,
} from './CombatHistorySidebar';
import { EquipmentDisplay } from './EquipmentDisplay';
import { FeaturesListPanel } from './FeaturesListPanel';
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
  monsters?: MonsterCombatState[];

  // Two-level action economy
  availableAbilities?: AvailableAbility[];
  availableActions?: AvailableAction[];

  // Encounter state
  /** If true, combat has ended (victory/defeat) but player hasn't left yet */
  combatEnded?: boolean;

  // Callbacks
  onFeature?: (featureId: FeatureId) => void;
  onBackpack?: () => void;
  onWeaponClick?: (slot: 'mainHand' | 'offHand') => void;
  onEndTurn?: () => void;
  /** Called when a combat ability is clicked (Attack, Dash, Dodge, etc.) */
  onAbilityClick?: (abilityId: CombatAbilityId) => void;
  /** Called when an available action is clicked (Strike, Off-hand Strike, etc.) */
  onActionClick?: (actionId: ActionId) => void;
  /** Called when player wants to abandon/leave the encounter */
  onAbandon?: () => void;
  /** Called when player wants to leave after victory */
  onLeaveDungeon?: () => void;
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
  monsters = [],
  availableAbilities = [],
  availableActions = [],
  combatEnded = false,
  onFeature,
  onBackpack,
  onWeaponClick,
  onEndTurn,
  onAbilityClick,
  onActionClick,
  onAbandon,
  onLeaveDungeon,
}: CombatPanelProps) {
  const actionsDisabled = !isPlayerTurn || combatEnded;
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
            monsters={monsters}
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

        {/* Combat Abilities - Data-driven, shows all base abilities */}
        <CombatAbilitiesPanel
          turnState={turnState}
          availableAbilities={availableAbilities}
          availableActions={availableActions}
          disabled={actionsDisabled}
          onAbilityClick={onAbilityClick}
          onActionClick={onActionClick}
        />

        {/* Divider */}
        <div className={styles.panelDivider} />

        {/* Character Features - Raw list display */}
        <FeaturesListPanel
          character={character}
          disabled={actionsDisabled}
          onFeatureClick={onFeature}
        />

        {/* Divider */}
        <div className={styles.panelDivider} />

        {/* Utility Buttons */}
        <div className={styles.actionButtonGroup}>
          <button
            className={styles.actionBtn}
            onClick={onBackpack}
            disabled={actionsDisabled}
            title="Open inventory"
          >
            🎒
          </button>

          {/* Show Leave Dungeon when combat ended, otherwise show End Turn */}
          {combatEnded ? (
            <button
              className={`${styles.actionBtn} ${styles.actionBtnEndTurn}`}
              onClick={onLeaveDungeon}
              title="Leave the dungeon"
              style={{ background: 'linear-gradient(90deg, #F59E0B, #D97706)' }}
            >
              🚪 Leave Dungeon
            </button>
          ) : (
            <button
              className={`${styles.actionBtn} ${styles.actionBtnEndTurn}`}
              onClick={onEndTurn}
              disabled={actionsDisabled}
              title="End your turn"
            >
              End Turn
            </button>
          )}

          {/* Abandon button - always available during combat */}
          {!combatEnded && onAbandon && (
            <button
              className={styles.actionBtn}
              onClick={onAbandon}
              title="Abandon encounter"
              style={{ color: '#EF4444' }}
            >
              🏃
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
