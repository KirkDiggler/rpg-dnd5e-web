import {
  getAbilityDisplay,
  getConditionDisplay,
  getFeatureDisplay,
  getSpellDisplay,
  getWeaponDisplay,
} from '@/utils/enumDisplays';
import type {
  CombatState,
  DamageBreakdown,
  DamageComponent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useEffect, useRef, useState } from 'react';
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
    // NEW: Type-safe damage breakdown from proto
    damageBreakdown?: DamageBreakdown;
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
 * - Expandable entries showing full damage breakdown
 * - Attack roll math: roll +mod = total vs AC
 * - Damage formula: icon+value for each source
 */
export function CombatHistorySidebar({
  combatState,
  logEntries,
  className = '',
}: CombatHistorySidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logEntries.length]);

  const toggleExpand = (entryId: string) => {
    setExpandedEntryId((prev) => (prev === entryId ? null : entryId));
  };

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
            <CombatLogEntryView
              key={entry.id}
              entry={entry}
              isExpanded={expandedEntryId === entry.id}
              onToggle={() => toggleExpand(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface CombatLogEntryViewProps {
  entry: CombatLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Individual combat log entry with collapsed/expanded states
 */
function CombatLogEntryView({
  entry,
  isExpanded,
  onToggle,
}: CombatLogEntryViewProps) {
  const isAttack = entry.type === 'attack';
  const hasDetails = entry.details && isAttack;
  const isHit = entry.action.toLowerCase().includes('hit');

  return (
    <div
      className={`${styles.logEntry} ${styles.logEntryClickable} ${isExpanded ? styles.logEntryExpanded : ''}`}
      onClick={hasDetails ? onToggle : undefined}
      style={{ cursor: hasDetails ? 'pointer' : 'default' }}
    >
      {/* Entry Header: Action + Round */}
      <div className={styles.logEntryHeader}>
        <div className={styles.logEntryHeaderLeft}>
          <span
            className={`${styles.logTypeIcon} ${styles[`logType_${entry.type}`]}`}
          >
            {getActionTypeIcon(entry.type)}
          </span>
          <span className={styles.logAction}>{entry.action}</span>
        </div>
        <span className={styles.logRoundFull}>Round {entry.round}</span>
      </div>

      {/* Attack Entry - Compact Formula */}
      {hasDetails ? (
        <AttackEntryContent
          entry={entry}
          isExpanded={isExpanded}
          isHit={isHit}
        />
      ) : (
        /* Non-attack entries - simple description */
        <div className={styles.logDescription}>
          {entry.targetName && (
            <span className={styles.logTarget}>→ {entry.targetName}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface AttackEntryContentProps {
  entry: CombatLogEntry;
  isExpanded: boolean;
  isHit: boolean;
}

/**
 * Attack-specific content with formula display
 */
function AttackEntryContent({
  entry,
  isExpanded,
  isHit,
}: AttackEntryContentProps) {
  const { details, targetName, diceRolls } = entry;
  if (!details) return null;

  const { attackRoll, attackTotal, targetAc, damageBreakdown, damageType } =
    details;

  // Calculate modifier from roll
  const modifier =
    attackRoll !== undefined && attackTotal !== undefined
      ? attackTotal - attackRoll
      : 0;
  const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

  // Get attack roll styling (nat 1/20)
  const attackRollClass = diceRolls?.[0]?.isNatural1
    ? styles.diceRollNatural1
    : diceRolls?.[0]?.isNatural20
      ? styles.diceRollCritical
      : '';

  // Build damage formula parts
  const damageFormula = buildDamageFormula(damageBreakdown, details.weaponName);
  const totalDamage = damageBreakdown?.totalDamage ?? details.damage ?? 0;

  // Abbreviate damage type for collapsed view
  const damageTypeAbbrev = abbreviateDamageType(damageType);

  return (
    <div className={styles.logAttackContent}>
      {/* Line 2: Attack formula + target + damage formula */}
      <div className={styles.logAttackLine}>
        {/* Attack roll: 19 +5 = 24 */}
        {attackRoll !== undefined && attackTotal !== undefined && (
          <span className={styles.logAttackRoll}>
            <span className={attackRollClass}>{attackRoll}</span>
            <span className={styles.logModifier}>{modifierStr}</span>
            <span className={styles.logEquals}>= {attackTotal}</span>
          </span>
        )}

        {/* Target: → Goblin (AC 15) */}
        {targetName && (
          <span className={styles.logTargetWithAc}>
            → {targetName}
            {targetAc !== undefined && (
              <span className={styles.logAc}>(AC {targetAc})</span>
            )}
          </span>
        )}

        {/* Damage formula (only on hit, collapsed view) */}
        {isHit && damageFormula.length > 0 && !isExpanded && (
          <span className={styles.logDamageFormula}>
            {damageFormula.map((part, idx) => (
              <span key={idx} className={styles.logDamagePart}>
                {idx > 0 && <span className={styles.logPlus}>+</span>}
                <span className={styles.logSourceIcon}>{part.icon}</span>
                <span className={styles.logSourceValue}>{part.value}</span>
              </span>
            ))}
            <span className={styles.logDamageTotal}>
              = {totalDamage} {damageTypeAbbrev}
            </span>
          </span>
        )}
      </div>

      {/* Expanded: Full breakdown */}
      {isExpanded && isHit && damageBreakdown && (
        <div className={styles.logExpandedBreakdown}>
          <div className={styles.logBreakdownDivider} />
          {damageBreakdown.components.map((comp, idx) => (
            <DamageComponentRow
              key={idx}
              component={comp}
              weaponName={details.weaponName}
            />
          ))}
          <div className={styles.logBreakdownDivider} />
          <div className={styles.logBreakdownTotal}>
            Total: {totalDamage} {damageType}
          </div>
        </div>
      )}
    </div>
  );
}

interface DamageComponentRowProps {
  component: DamageComponent;
  weaponName?: string;
}

/**
 * Single row in expanded damage breakdown
 */
function DamageComponentRow({
  component,
  weaponName,
}: DamageComponentRowProps) {
  const { icon, name, value } = getSourceDisplay(component, weaponName);

  return (
    <div className={styles.logBreakdownRow}>
      <span className={styles.logBreakdownIcon}>{icon}</span>
      <span className={styles.logBreakdownName}>{name}</span>
      <span className={styles.logBreakdownValue}>{value}</span>
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

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

interface DamageFormulaPart {
  icon: string;
  value: string;
  name: string;
}

/**
 * Build damage formula parts from breakdown components
 */
function buildDamageFormula(
  breakdown?: DamageBreakdown,
  weaponName?: string
): DamageFormulaPart[] {
  if (!breakdown?.components) return [];

  return breakdown.components.map((comp) => getSourceDisplay(comp, weaponName));
}

/**
 * Get display info for a damage source
 */
function getSourceDisplay(
  component: DamageComponent,
  weaponName?: string
): DamageFormulaPart {
  const diceSum = component.finalDiceRolls.reduce((a, b) => a + b, 0);

  // Format value: show dice sum in parens if there are dice, plus flat bonus
  let valueStr: string;
  if (component.finalDiceRolls.length > 0 && component.flatBonus !== 0) {
    valueStr = `(${diceSum})${component.flatBonus > 0 ? '+' : ''}${component.flatBonus}`;
  } else if (component.finalDiceRolls.length > 0) {
    valueStr = `(${diceSum})`;
  } else {
    valueStr =
      component.flatBonus > 0
        ? `+${component.flatBonus}`
        : `${component.flatBonus}`;
  }

  // Get icon and name from sourceRef
  if (component.sourceRef?.source.case) {
    const { case: sourceCase, value } = component.sourceRef.source;
    switch (sourceCase) {
      case 'weapon': {
        const display = getWeaponDisplay(value);
        return {
          icon: '🔨',
          name: display.title,
          value: valueStr,
        };
      }
      case 'ability': {
        const display = getAbilityDisplay(value);
        // Use muscle emoji for STR, target for DEX, etc.
        const abilityIcon = getAbilityIcon(display.title);
        return {
          icon: abilityIcon,
          name: display.title,
          value: valueStr,
        };
      }
      case 'feature': {
        const display = getFeatureDisplay(value);
        return {
          icon: '⚔️', // Fighting styles, class features
          name: display.title,
          value: valueStr,
        };
      }
      case 'condition': {
        const display = getConditionDisplay(value);
        return {
          icon: '💀',
          name: display.title,
          value: valueStr,
        };
      }
      case 'spell': {
        const display = getSpellDisplay(value);
        return {
          icon: '✨',
          name: display.title,
          value: valueStr,
        };
      }
    }
  }

  // Legacy fallback using string source
  const sourceName = component.source || 'Unknown';
  if (sourceName === 'weapon') {
    return {
      icon: '🔨',
      name: weaponName || 'Weapon',
      value: valueStr,
    };
  }

  return {
    icon: '❓',
    name: sourceName.charAt(0).toUpperCase() + sourceName.slice(1),
    value: valueStr,
  };
}

/**
 * Get icon for ability scores
 */
function getAbilityIcon(abilityName: string): string {
  switch (abilityName.toLowerCase()) {
    case 'strength':
      return '💪';
    case 'dexterity':
      return '🎯';
    case 'constitution':
      return '❤️';
    case 'intelligence':
      return '🧠';
    case 'wisdom':
      return '👁️';
    case 'charisma':
      return '✨';
    default:
      return '📊';
  }
}

/**
 * Abbreviate damage type for compact display
 */
function abbreviateDamageType(damageType?: string): string {
  if (!damageType) return '';

  const abbreviations: Record<string, string> = {
    bludgeoning: 'bludg.',
    piercing: 'pierc.',
    slashing: 'slash.',
    fire: 'fire',
    cold: 'cold',
    lightning: 'lght.',
    thunder: 'thund.',
    acid: 'acid',
    poison: 'pois.',
    necrotic: 'necro.',
    radiant: 'rad.',
    force: 'force',
    psychic: 'psych.',
  };

  return abbreviations[damageType.toLowerCase()] || damageType;
}
