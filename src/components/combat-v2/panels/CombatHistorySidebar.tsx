import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useEffect, useRef } from 'react';
import styles from '../styles/combat.module.css';

// Export types for consumers
export interface DiceRoll {
  value: number;
  sides: number;
  isNatural1?: boolean;
  isNatural20?: boolean;
  isCritical?: boolean;
}

export interface CombatLogEntry {
  id: string;
  timestamp: Date;
  round: number;
  actorName: string;
  targetName?: string;
  action: string;
  description: string;
  type: 'move' | 'attack' | 'spell' | 'end-turn' | 'damage' | 'heal' | 'info';
  diceRolls?: DiceRoll[];
  // Rich tooltip data
  details?: {
    attackRoll?: number;
    attackTotal?: number;
    targetAc?: number;
    damage?: number;
    damageType?: string;
    critical?: boolean;
    weaponName?: string;
  };
}

export interface CombatHistorySidebarProps {
  combatState: CombatState;
  logEntries: CombatLogEntry[];
  className?: string;
}

/**
 * CombatHistorySidebar - Displays combat log in a right sidebar layout.
 *
 * Features:
 * - Fixed height, scrollable content
 * - Dice roll highlighting (natural 1 = red, natural 20/crits = gold)
 * - Action type icons and color coding
 * - Round tracking
 *
 * Usage:
 * Place in a fixed-width sidebar container in the main layout.
 */
export function CombatHistorySidebar({
  combatState,
  logEntries,
  className = '',
}: CombatHistorySidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logEntries.length]);

  return (
    <div className={`${styles.combatHistorySidebar} ${className}`}>
      {/* Sidebar Header */}
      <div className={styles.sidebarHeader}>
        <h3 className={styles.sidebarTitle}>
          <span className={styles.sidebarIcon}>📜</span>
          Combat Log
        </h3>
        <div className={styles.sidebarRound}>Round {combatState.round}</div>
      </div>

      {/* Scrollable Log Entries */}
      <div className={styles.sidebarContent} ref={scrollRef}>
        {logEntries.length === 0 ? (
          <div className={styles.emptyMessage}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚔️</div>
            <div>Combat actions will appear here</div>
            <div
              style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.7 }}
            >
              Attacks, spells, and movements will be logged as they occur
            </div>
          </div>
        ) : (
          logEntries.map((entry) => (
            <div
              key={entry.id}
              className={styles.logEntry}
              title={buildEntryTooltip(entry)}
            >
              {/* Entry Header */}
              <div className={styles.logEntryHeader}>
                <span
                  className={`${styles.logTypeIcon} ${styles[`logType_${entry.type}`]}`}
                >
                  {getActionTypeIcon(entry.type)}
                </span>
                <span className={styles.logAction}>{entry.action}</span>
                <span className={styles.logRound}>R{entry.round}</span>
              </div>

              {/* Compact description with dice inline */}
              <div className={styles.logDescription}>
                {entry.diceRolls && entry.diceRolls.length > 0 && (
                  <span className={styles.diceRollsInline}>
                    {entry.diceRolls.map((roll, index) => (
                      <span
                        key={index}
                        className={`${styles.diceRollInline} ${getDiceRollClassName(roll)}`}
                      >
                        {roll.value}
                      </span>
                    ))}
                  </span>
                )}
                {entry.targetName && (
                  <span className={styles.logTarget}>→ {entry.targetName}</span>
                )}
                {entry.details?.damage && (
                  <span className={styles.logDamage}>
                    {entry.details.damage} {entry.details.damageType}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Get action type icon emoji
 */
function getActionTypeIcon(type: CombatLogEntry['type']): string {
  switch (type) {
    case 'move':
      return '🏃';
    case 'attack':
      return '⚔️';
    case 'spell':
      return '✨';
    case 'end-turn':
      return '⏭️';
    case 'damage':
      return '💥';
    case 'heal':
      return '💚';
    default:
      return '❓';
  }
}

/**
 * Get CSS class name for dice roll highlighting
 */
function getDiceRollClassName(roll: DiceRoll): string {
  if (roll.isNatural1) {
    return styles.diceRollNatural1;
  }
  if (roll.isNatural20 || roll.isCritical) {
    return styles.diceRollCritical;
  }
  return '';
}

/**
 * Get tooltip text for dice roll
 */
function getDiceRollTooltip(roll: DiceRoll): string {
  if (roll.isNatural1) {
    return `Natural 1 on d${roll.sides} - Critical Failure!`;
  }
  if (roll.isNatural20) {
    return `Natural 20 on d${roll.sides} - Critical Hit!`;
  }
  if (roll.isCritical) {
    return `Critical damage: ${roll.value} on d${roll.sides}`;
  }
  return `${roll.value} on d${roll.sides}`;
}

/**
 * Build rich tooltip text for a combat log entry
 */
function buildEntryTooltip(entry: CombatLogEntry): string {
  const lines: string[] = [];

  // Header with actor and action
  lines.push(`${entry.actorName}: ${entry.action}`);

  // Target if present
  if (entry.targetName) {
    lines.push(`Target: ${entry.targetName}`);
  }

  // Attack roll details
  if (entry.details) {
    const {
      attackRoll,
      attackTotal,
      targetAc,
      damage,
      damageType,
      critical,
      weaponName,
    } = entry.details;

    if (weaponName) {
      lines.push(`Weapon: ${weaponName}`);
    }

    if (attackRoll !== undefined && attackTotal !== undefined) {
      const modifier = attackTotal - attackRoll;
      const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
      lines.push(`Attack Roll: ${attackRoll} ${modStr} = ${attackTotal}`);
    }

    if (targetAc !== undefined) {
      lines.push(`Target AC: ${targetAc}`);
    }

    if (damage !== undefined && damageType) {
      const critLabel = critical ? ' (CRITICAL!)' : '';
      lines.push(`Damage: ${damage} ${damageType}${critLabel}`);
    }
  }

  // Dice roll details
  if (entry.diceRolls && entry.diceRolls.length > 0) {
    const diceInfo = entry.diceRolls
      .map((roll) => getDiceRollTooltip(roll))
      .join(', ');
    lines.push(`Dice: ${diceInfo}`);
  }

  // Round and timestamp
  lines.push(`Round ${entry.round}`);

  return lines.join('\n');
}
