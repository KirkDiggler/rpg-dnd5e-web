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

import {
  getClassDisplayName,
  getMonsterTypeDisplayName,
} from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
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
}

/** Get class display name from character */
function getClassDisplay(character: Character): string {
  const className = getClassDisplayName(character.class);
  const level = character.level || 1;
  return `${className} · Lvl ${level}`;
}

/** Render player character info */
function PlayerInfo({ character }: { character: Character }) {
  const conditions = character.activeConditions || [];
  const maxHp = character.combatStats?.hitPointMaximum || 1;

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
      {conditions.length > 0 && (
        <div className={styles.hoverInfoConditions}>
          {conditions.map((condition, i) => (
            <span key={i} className={styles.hoverInfoCondition}>
              {condition.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render monster/enemy info */
function MonsterInfo({
  name,
  monsterType,
}: {
  name: string;
  monsterType?: number;
}) {
  // Show monster type name if available, otherwise just "Enemy"
  const typeLabel =
    monsterType !== undefined && monsterType !== MonsterType.UNSPECIFIED
      ? getMonsterTypeDisplayName(monsterType as MonsterType)
      : 'Enemy';

  return (
    <div className={styles.hoverInfoContent}>
      <div className={styles.hoverInfoName}>{name}</div>
      <div className={styles.hoverInfoSubtext}>{typeLabel}</div>
    </div>
  );
}

export function HoverInfoPanel({
  hoveredEntity,
  selectedEntity,
  characters,
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
    // Monster/enemy - use name and monster type from entity
    content = (
      <MonsterInfo
        name={displayEntity.name}
        monsterType={displayEntity.monsterType}
      />
    );
    borderClass = styles.hoverInfoEnemy;
  }

  return (
    <div className={`${styles.hoverInfoPanel} ${borderClass}`}>{content}</div>
  );
}
