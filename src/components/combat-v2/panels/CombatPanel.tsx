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
import { DynamicActionButtons } from './DynamicActionButtons';
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
  characters?: Character[];

  // Callbacks
  onAttack?: () => void;
  onMove?: () => void;
  onSpell?: () => void;
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
  characters = [],
  onAttack,
  onMove,
  onSpell,
  onFeature,
  onBackpack,
  onWeaponClick,
  onEndTurn,
}: CombatPanelProps) {
  // Determine if actions should be globally disabled
  const actionsDisabled = !isPlayerTurn;

  return (
    <div className={styles.combatPanel}>
      <div className={styles.combatPanelContainer}>
        {/* Left Column: Hover Info Panel */}
        <HoverInfoPanel
          hoveredEntity={hoveredEntity || null}
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

          {/* Action Economy Indicators */}
          <ActionEconomyIndicators turnState={turnState} />

          {/* Dynamic Action Buttons */}
          <DynamicActionButtons
            character={character}
            turnState={turnState}
            onAttack={onAttack}
            onMove={onMove}
            onSpell={onSpell}
            onFeature={onFeature}
            onBackpack={onBackpack}
            onEndTurn={onEndTurn}
            disabled={actionsDisabled}
          />
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
