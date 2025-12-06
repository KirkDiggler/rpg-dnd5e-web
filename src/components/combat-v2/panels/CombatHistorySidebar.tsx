import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useState } from 'react';
import styles from '../styles/combat.module.css';

export interface CombatHistorySidebarProps {
  combatState: CombatState;
  className?: string;
}

interface DiceRoll {
  value: number;
  sides: number;
  isNatural1?: boolean;
  isNatural20?: boolean;
  isCritical?: boolean;
}

interface CombatLogEntry {
  id: string;
  timestamp: Date;
  round: number;
  entityId: string;
  action: string;
  description: string;
  type: 'move' | 'attack' | 'spell' | 'end-turn' | 'damage' | 'heal';
  diceRolls?: DiceRoll[];
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
  className = '',
}: CombatHistorySidebarProps) {
  // Combat log entries will be populated by real combat events in a future iteration.
  // For now, we maintain an empty state to show the UI structure.
  const [combatLog] = useState<CombatLogEntry[]>([]);

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
      <div className={styles.sidebarContent}>
        {combatLog.length === 0 ? (
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
          combatLog.map((entry) => (
            <div key={entry.id} className={styles.logEntry}>
              {/* Entry Header */}
              <div className={styles.logEntryHeader}>
                <span className={styles.logAction}>{entry.action}</span>
                <div className={styles.logMeta}>
                  <span className={styles.logRound}>R{entry.round}</span>
                  <span
                    className={`${styles.logTypeIcon} ${styles[`logType_${entry.type}`]}`}
                  >
                    {getActionTypeIcon(entry.type)}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className={styles.logDescription}>{entry.description}</div>

              {/* Dice Rolls */}
              {entry.diceRolls && entry.diceRolls.length > 0 && (
                <div className={styles.diceRollsContainer}>
                  {entry.diceRolls.map((roll, index) => (
                    <span
                      key={index}
                      className={`${styles.diceRoll} ${getDiceRollClassName(roll)}`}
                      title={getDiceRollTooltip(roll)}
                    >
                      {roll.value}
                    </span>
                  ))}
                </div>
              )}
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
