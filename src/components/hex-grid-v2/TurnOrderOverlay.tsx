/**
 * TurnOrderOverlay - Compact horizontal turn order display at the top of the hex grid
 *
 * Shows:
 * - Current turn combatant in CENTER (larger, glowing border)
 * - 2-3 upcoming turns to the RIGHT (smaller)
 * - 1-2 previous turns to the LEFT (smaller, faded)
 *
 * Each combatant card shows:
 * - Class emoji for players / monster emoji
 * - Name underneath (truncated if too long)
 * - Thin HP bar below name
 * - Active turn: glowing green border
 */

import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

export interface TurnOrderEntry {
  entityId: string;
  entityType: string;
  initiative: number;
}

export interface TurnOrderOverlayProps {
  turnOrder: TurnOrderEntry[];
  activeIndex: number;
  characters: Character[];
  round: number;
}

// Map class enum to emoji
function getClassEmoji(classEnum: Class): string {
  const emojiMap: Record<Class, string> = {
    [Class.UNSPECIFIED]: '❓',
    [Class.BARBARIAN]: '🪓',
    [Class.BARD]: '🎵',
    [Class.CLERIC]: '✝️',
    [Class.DRUID]: '🌿',
    [Class.FIGHTER]: '⚔️',
    [Class.MONK]: '👊',
    [Class.PALADIN]: '🛡️',
    [Class.RANGER]: '🏹',
    [Class.ROGUE]: '🗡️',
    [Class.SORCERER]: '🔮',
    [Class.WARLOCK]: '👁️',
    [Class.WIZARD]: '🧙',
  };
  return emojiMap[classEnum] || '❓';
}

// Get entity emoji (player class or monster)
function getEntityEmoji(entry: TurnOrderEntry, character?: Character): string {
  const isPlayer =
    entry.entityType.toLowerCase() === 'character' ||
    entry.entityType.toLowerCase() === 'player';

  if (isPlayer && character) {
    return getClassEmoji(character.class);
  }

  // Monster emoji - could be enhanced with specific monster types later
  return '👹';
}

// Get entity name
function getEntityName(entry: TurnOrderEntry, character?: Character): string {
  if (character) {
    return character.name;
  }
  // Fallback: extract from entity ID (e.g., "monster_goblin_1" -> "GOBLIN 1")
  const parts = entry.entityId.split('_');
  return parts.slice(1).join(' ').toUpperCase() || entry.entityId;
}

// Truncate name if too long
function truncateName(name: string, maxLength: number): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength - 1) + '…';
}

interface CombatantCardProps {
  entry: TurnOrderEntry;
  character?: Character;
  isActive: boolean;
  position: 'left' | 'center' | 'right';
}

function CombatantCard({
  entry,
  character,
  isActive,
  position,
}: CombatantCardProps) {
  const emoji = getEntityEmoji(entry, character);
  const name = getEntityName(entry, character);
  const displayName = truncateName(name, position === 'center' ? 12 : 8);

  // HP bar (default to 100% if no character data)
  const currentHp = character?.hitPoints?.current || 0;
  const maxHp = character?.hitPoints?.max || 1;
  const hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));

  // Size and opacity based on position
  const size = position === 'center' ? 'large' : 'small';
  const opacity = position === 'left' ? 0.6 : 1.0;

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: size === 'large' ? '70px' : '55px',
    minWidth: size === 'large' ? '70px' : '55px',
    padding: size === 'large' ? '8px' : '6px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    border: isActive
      ? '2px solid #10B981'
      : '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    opacity,
    transition: 'all 0.3s ease-in-out',
    boxShadow: isActive
      ? '0 0 15px rgba(16, 185, 129, 0.6), inset 0 0 10px rgba(16, 185, 129, 0.2)'
      : 'none',
  };

  const emojiStyle: React.CSSProperties = {
    fontSize: size === 'large' ? '28px' : '20px',
    marginBottom: '4px',
  };

  const nameStyle: React.CSSProperties = {
    fontSize: size === 'large' ? '11px' : '9px',
    fontWeight: 600,
    color: '#fff',
    textAlign: 'center',
    marginBottom: '4px',
    lineHeight: 1.2,
  };

  const hpBarContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '3px',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '2px',
    overflow: 'hidden',
  };

  const hpBarFillStyle: React.CSSProperties = {
    width: `${hpPercent}%`,
    height: '100%',
    backgroundColor:
      hpPercent > 50 ? '#10B981' : hpPercent > 25 ? '#F59E0B' : '#EF4444',
    transition: 'width 0.3s ease-in-out',
  };

  return (
    <div style={cardStyle}>
      <div style={emojiStyle}>{emoji}</div>
      <div style={nameStyle}>{displayName}</div>
      <div style={hpBarContainerStyle}>
        <div style={hpBarFillStyle} />
      </div>
    </div>
  );
}

export function TurnOrderOverlay({
  turnOrder,
  activeIndex,
  characters,
  round,
}: TurnOrderOverlayProps) {
  // Calculate visible combatants
  const NUM_LEFT = 2;
  const NUM_RIGHT = 3;

  const visibleCombatants: Array<{
    entry: TurnOrderEntry;
    position: 'left' | 'center' | 'right';
    index: number;
  }> = [];

  // Add left (previous) combatants
  for (let i = NUM_LEFT; i >= 1; i--) {
    const index = activeIndex - i;
    if (index >= 0) {
      visibleCombatants.push({
        entry: turnOrder[index],
        position: 'left',
        index,
      });
    }
  }

  // Add center (current) combatant
  if (activeIndex >= 0 && activeIndex < turnOrder.length) {
    visibleCombatants.push({
      entry: turnOrder[activeIndex],
      position: 'center',
      index: activeIndex,
    });
  }

  // Add right (upcoming) combatants
  for (let i = 1; i <= NUM_RIGHT; i++) {
    const index = activeIndex + i;
    if (index < turnOrder.length) {
      visibleCombatants.push({
        entry: turnOrder[index],
        position: 'right',
        index,
      });
    }
  }

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(8px)',
    borderRadius: '0 0 12px 12px',
    zIndex: 100,
  };

  const roundBadgeStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: '#fff',
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    padding: '4px 8px',
    borderRadius: '6px',
    marginRight: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <div style={containerStyle}>
      <div style={roundBadgeStyle}>Round {round}</div>
      {visibleCombatants.map(({ entry, position, index }) => {
        const character = characters.find((c) => c.id === entry.entityId);
        const isActive = index === activeIndex;

        return (
          <CombatantCard
            key={entry.entityId}
            entry={entry}
            character={character}
            isActive={isActive}
            position={position}
          />
        );
      })}
    </div>
  );
}
