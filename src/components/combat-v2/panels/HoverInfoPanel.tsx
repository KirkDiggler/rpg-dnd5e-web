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

import { getClassDisplayName } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import styles from '../styles/combat.module.css';

export interface HoveredEntity {
  id: string;
  type: string; // 'player' | 'monster'
}

export interface HoverInfoPanelProps {
  /** Currently hovered entity from the hex grid */
  hoveredEntity: HoveredEntity | null;
  /** Current turn character (shown when not hovering) */
  currentCharacter: Character | null;
  /** All characters for looking up ally info */
  characters: Character[];
}

/** Format entity ID to a readable name (e.g., "goblin_1" -> "Goblin 1") */
function formatEntityName(entityId: string): string {
  return entityId
    .split('_')
    .map((part) => {
      // Capitalize first letter, keep numbers as-is
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
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
function MonsterInfo({ entityId }: { entityId: string }) {
  return (
    <div className={styles.hoverInfoContent}>
      <div className={styles.hoverInfoName}>{formatEntityName(entityId)}</div>
      <div className={styles.hoverInfoSubtext}>Enemy</div>
    </div>
  );
}

export function HoverInfoPanel({
  hoveredEntity,
  currentCharacter,
  characters,
}: HoverInfoPanelProps) {
  // Determine what to display
  let content: React.ReactNode;
  let borderClass = styles.hoverInfoAlly; // Default to ally (blue/green)

  if (hoveredEntity) {
    // Hovering over something
    if (hoveredEntity.type === 'player') {
      // Find the character data
      const character = characters.find((c) => c.id === hoveredEntity.id);
      if (character) {
        content = <PlayerInfo character={character} />;
        borderClass = styles.hoverInfoAlly;
      } else {
        // Character not found - show basic info
        content = (
          <div className={styles.hoverInfoContent}>
            <div className={styles.hoverInfoName}>
              {formatEntityName(hoveredEntity.id)}
            </div>
            <div className={styles.hoverInfoSubtext}>Ally</div>
          </div>
        );
        borderClass = styles.hoverInfoAlly;
      }
    } else {
      // Monster/enemy
      content = <MonsterInfo entityId={hoveredEntity.id} />;
      borderClass = styles.hoverInfoEnemy;
    }
  } else if (currentCharacter) {
    // Not hovering - show current turn character
    content = <PlayerInfo character={currentCharacter} />;
    borderClass = styles.hoverInfoAlly;
  } else {
    // Nothing to show
    content = (
      <div className={styles.hoverInfoContent}>
        <div className={styles.hoverInfoPlaceholder}>
          Hover over an entity for info
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.hoverInfoPanel} ${borderClass}`}>{content}</div>
  );
}
