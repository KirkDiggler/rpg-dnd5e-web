import { getClassDisplayName } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import styles from '../styles/combat.module.css';

export interface CharacterInfoSectionProps {
  character: Character;
}

/**
 * CharacterInfoSection - Displays character portrait, name, class/level, HP bar, AC, and active conditions
 *
 * This component shows:
 * 1. Character portrait/icon (emoji placeholder)
 * 2. Character name and class/level (e.g., "Thorin - Level 3 Fighter")
 * 3. HP bar with current/max values (e.g., "45/52 HP") - color changes based on health %
 * 4. AC display with shield icon (e.g., "AC 16")
 * 5. Active condition badges with icons
 *
 * Health bar colors:
 * - Green: > 50% HP
 * - Yellow: 25-50% HP
 * - Red: < 25% HP
 */
export function CharacterInfoSection({ character }: CharacterInfoSectionProps) {
  const maxHP = character.combatStats?.hitPointMaximum || 1;
  const currentHP = character.currentHitPoints || 0;
  const tempHP = character.temporaryHitPoints || 0;
  const ac = character.combatStats?.armorClass || 10;
  const activeConditions = character.activeConditions || [];

  // Calculate HP percentage for color
  const hpPercentage = (currentHP / maxHP) * 100;
  const hpBarColor =
    hpPercentage > 50
      ? '#10b981' // emerald-500 (green)
      : hpPercentage > 25
        ? '#eab308' // yellow-500
        : '#ef4444'; // red-500 (red)

  // Get class display name
  const className = getClassDisplayName(character.class);

  // Character display (name - Level X Class)
  const characterDisplay = `${character.name} - Level ${character.level} ${className}`;

  return (
    <div className={styles.characterInfoSection}>
      {/* Portrait and Name/Class */}
      <div className={styles.characterPortraitSection}>
        <div className={styles.characterPortrait}>
          {/* Using emoji as placeholder for now */}
          <span className={styles.portraitEmoji}>⚔️</span>
        </div>
        <div className={styles.characterNameSection}>
          <h4 className={styles.characterDisplayName}>{characterDisplay}</h4>
        </div>
      </div>

      {/* HP Bar */}
      <div className={styles.hpSection}>
        <div className={styles.hpLabelRow}>
          <span className={styles.hpLabel}>HP</span>
          <span className={styles.hpValues}>
            {currentHP}/{maxHP}
          </span>
        </div>
        <div className={styles.hpBarContainer}>
          <div
            className={styles.hpBarFill}
            style={{
              width: `${Math.min(100, (currentHP / maxHP) * 100)}%`,
              backgroundColor: hpBarColor,
            }}
          />
        </div>
        {tempHP > 0 && (
          <div className={styles.tempHpBadge}>+{tempHP} temp HP</div>
        )}
      </div>

      {/* AC Display */}
      <div className={styles.acSection}>
        <div className={styles.acIcon}>🛡️</div>
        <div className={styles.acValue}>
          <span className={styles.acLabel}>AC</span>
          <span className={styles.acNumber}>{ac}</span>
        </div>
      </div>

      {/* Active Conditions */}
      {activeConditions.length > 0 && (
        <div className={styles.conditionsSection}>
          {activeConditions.map((condition, index) => (
            <div
              key={`${condition.name}-${index}`}
              className={styles.conditionBadge}
              title={`${condition.name}${condition.source ? ` (${condition.source})` : ''}${
                condition.duration !== undefined && condition.duration > 0
                  ? ` - ${condition.duration} rounds`
                  : ''
              }`}
            >
              <span className={styles.conditionIcon}>
                {getConditionIcon(condition.name || '')}
              </span>
              <span className={styles.conditionName}>{condition.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Get emoji icon for condition
 * TODO: Extend this with proper icon mapping (Task 6: conditionIcons.ts)
 */
function getConditionIcon(conditionName: string): string {
  const name = conditionName.toLowerCase();

  // Basic mapping for common conditions
  const iconMap: Record<string, string> = {
    raging: '🔥',
    rage: '🔥',
    blessed: '✨',
    bless: '✨',
    poisoned: '☠️',
    poison: '☠️',
    stunned: '💫',
    stun: '💫',
    paralyzed: '⚡',
    charmed: '💖',
    frightened: '😱',
    invisible: '👻',
    prone: '🔻',
    restrained: '⛓️',
    grappled: '🤝',
    blinded: '👁️',
    deafened: '🔇',
    exhausted: '😴',
    exhaustion: '😴',
    petrified: '🗿',
    unconscious: '💤',
    incapacitated: '🚫',
  };

  return iconMap[name] || '❓';
}
