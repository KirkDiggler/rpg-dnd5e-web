/**
 * HoverInfoPanel - Shows info about hovered entities on the hex grid
 *
 * Displays:
 * - Current turn character info when not hovering anything
 * - Hovered entity info (player or monster) when hovering
 *
 * Color-coded borders:
 * - Blue/green for allies (players)
 * - Red for enemies (monsters)
 */

import { ConditionsDisplay, FeaturesPanel } from '@/components/features';
import {
  getClassDisplayName,
  getMonsterTypeDisplayName,
} from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { MonsterCombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { MonsterType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import styles from '../styles/combat.module.css';

export interface HoveredEntity {
  id: string;
  type: string; // 'player' | 'monster'
  name: string;
  monsterType?: number; // MonsterType enum value for monsters
}

export interface HoverInfoPanelProps {
  /** Currently hovered entity from the hex grid */
  hoveredEntity: HoveredEntity | null;
  /** Selected/clicked entity (persists until another is clicked) */
  selectedEntity: HoveredEntity | null;
  /** Current turn character (shown when not hovering or selected) */
  currentCharacter: Character | null;
  /** All characters for looking up ally info */
  characters: Character[];
  /** All monsters for looking up monster stats */
  monsters?: MonsterCombatState[];
}

/** Get class display name from character */
function getClassDisplay(character: Character): string {
  const className = getClassDisplayName(character.class);
  const level = character.level || 1;
  return `${className} · Lvl ${level}`;
}

/** Render player character info */
function PlayerInfo({ character }: { character: Character }) {
  const maxHp = character.combatStats?.hitPointMaximum || 1;
  const hasConditions = (character.activeConditions?.length ?? 0) > 0;
  const hasFeatures = (character.features?.length ?? 0) > 0;

  return (
    <div className={styles.hoverInfoContent}>
      <div className={styles.hoverInfoName}>{character.name}</div>
      <div className={styles.hoverInfoSubtext}>
        {getClassDisplay(character)}
      </div>
      <div className={styles.hoverInfoStats}>
        <span className={styles.hoverInfoHp}>
          ♥ {character.currentHitPoints}/{maxHp}
        </span>
        <span className={styles.hoverInfoAc}>
          AC {character.combatStats?.armorClass || 10}
        </span>
      </div>
      {/* Active conditions using enum-based display */}
      {hasConditions && (
        <div className={styles.hoverInfoSection}>
          <ConditionsDisplay character={character} />
        </div>
      )}
      {/* Character features using enum-based display */}
      {hasFeatures && (
        <div className={styles.hoverInfoSection}>
          <FeaturesPanel character={character} />
        </div>
      )}
    </div>
  );
}

/**
 * Get health category based on HP percentage
 * In D&D, players don't know exact enemy HP, but can see how damaged they look
 */
function getHealthCategory(
  currentHp: number,
  maxHp: number
): { label: string; color: string } {
  if (maxHp <= 0) return { label: 'Unknown', color: 'var(--text-muted)' };

  // Handle dead/negative HP first (D&D allows going below 0)
  if (currentHp <= 0) {
    return { label: 'Dead', color: '#6b7280' }; // gray
  }

  const percentage = (currentHp / maxHp) * 100;

  if (percentage >= 100) {
    return { label: 'Uninjured', color: '#22c55e' }; // green
  } else if (percentage >= 75) {
    return { label: 'Lightly Wounded', color: '#84cc16' }; // lime
  } else if (percentage >= 50) {
    return { label: 'Injured', color: '#eab308' }; // yellow
  } else if (percentage >= 25) {
    return { label: 'Badly Wounded', color: '#f97316' }; // orange
  } else {
    return { label: 'Near Death', color: '#ef4444' }; // red
  }
}

/** Render monster/enemy info */
function MonsterInfo({
  monsterType,
  monster,
}: {
  monsterType?: number;
  monster?: MonsterCombatState;
}) {
  // Show monster type name if available, otherwise just "Enemy"
  const typeLabel =
    monsterType !== undefined && monsterType !== MonsterType.UNSPECIFIED
      ? getMonsterTypeDisplayName(monsterType as MonsterType)
      : 'Enemy';

  // Get health category if we have monster data
  const healthInfo = monster
    ? getHealthCategory(monster.currentHitPoints, monster.maxHitPoints)
    : null;

  return (
    <div className={styles.hoverInfoContent}>
      <div className={styles.hoverInfoName}>{typeLabel}</div>
      {healthInfo && (
        <div
          className={styles.hoverInfoSubtext}
          style={{ color: healthInfo.color }}
        >
          {healthInfo.label}
        </div>
      )}
    </div>
  );
}

export function HoverInfoPanel({
  hoveredEntity,
  selectedEntity,
  characters,
  monsters = [],
}: HoverInfoPanelProps) {
  // Only show when actually hovering or have a selected entity
  const displayEntity = hoveredEntity || selectedEntity;

  // Don't render anything if nothing is hovered/selected
  if (!displayEntity) {
    return null;
  }

  // Determine what to display
  let content: React.ReactNode;
  let borderClass = styles.hoverInfoAlly; // Default to ally (blue/green)

  if (displayEntity.type === 'player') {
    // Find the character data
    const character = characters.find((c) => c.id === displayEntity.id);
    if (character) {
      content = <PlayerInfo character={character} />;
      borderClass = styles.hoverInfoAlly;
    } else {
      // Character not found - show basic info with name
      content = (
        <div className={styles.hoverInfoContent}>
          <div className={styles.hoverInfoName}>{displayEntity.name}</div>
          <div className={styles.hoverInfoSubtext}>Ally</div>
        </div>
      );
      borderClass = styles.hoverInfoAlly;
    }
  } else {
    // Monster/enemy - look up full monster data for health display
    const monster = monsters.find((m) => m.monsterId === displayEntity.id);
    content = (
      <MonsterInfo monsterType={displayEntity.monsterType} monster={monster} />
    );
    borderClass = styles.hoverInfoEnemy;
  }

  return (
    <div className={`${styles.hoverInfoPanel} ${borderClass}`}>{content}</div>
  );
}
