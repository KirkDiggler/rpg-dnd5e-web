import { getClassDisplayName } from '@/utils/displayNames';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Ability } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
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
/** Calculate ability modifier from score */
function getModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Format modifier with sign */
function formatModifier(score: number): string {
  const mod = getModifier(score);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Get icon for ability */
function getAbilityIcon(label: string): string {
  const icons: Record<string, string> = {
    STR: '💪',
    DEX: '🏃',
    CON: '❤️',
    INT: '🧠',
    WIS: '👁️',
    CHA: '✨',
  };
  return icons[label] || '📊';
}

/** Compact ability score display */
function AbilityScore({ label, score }: { label: string; score: number }) {
  return (
    <div className={styles.abilityScore} title={`${label}: ${score}`}>
      <span className={styles.abilityIcon}>{getAbilityIcon(label)}</span>
      <span className={styles.abilityModifier}>{formatModifier(score)}</span>
    </div>
  );
}

export function CharacterInfoSection({ character }: CharacterInfoSectionProps) {
  const maxHP = character.combatStats?.hitPointMaximum || 1;
  const currentHP = character.currentHitPoints || 0;
  const tempHP = character.temporaryHitPoints || 0;
  const ac = character.combatStats?.armorClass || 10;

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

      {/* HP Bar - compact inline */}
      <div className={styles.hpSection}>
        <span className={styles.hpLabel}>HP</span>
        <span className={styles.hpValues}>
          {currentHP}/{maxHP}
        </span>
        <div className={styles.hpBarContainer}>
          <div
            className={styles.hpBarFill}
            style={{
              width: `${Math.min(100, (currentHP / maxHP) * 100)}%`,
              backgroundColor: hpBarColor,
            }}
          />
        </div>
        {tempHP > 0 && <span className={styles.tempHpBadge}>+{tempHP}</span>}
      </div>

      {/* AC and Saving Throws */}
      <div className={styles.acSection}>
        <div className={styles.acIcon}>🛡️</div>
        <div className={styles.acValue}>
          <span className={styles.acNumber}>{ac}</span>
        </div>
        {/* Saving throw proficiencies - compact badges */}
        {character.proficiencies?.savingThrows &&
          character.proficiencies.savingThrows.length > 0 && (
            <div className={styles.savingThrowBadges}>
              {character.proficiencies.savingThrows.map((ability) => (
                <span
                  key={ability}
                  className={styles.savingThrowBadge}
                  title={`${getAbilityName(ability)} Save Proficiency`}
                >
                  {getAbilityAbbrev(ability)}
                </span>
              ))}
            </div>
          )}
      </div>

      {/* Ability Scores - compact inline display */}
      {character.abilityScores && (
        <div className={styles.abilityScoresSection}>
          <AbilityScore label="STR" score={character.abilityScores.strength} />
          <AbilityScore label="DEX" score={character.abilityScores.dexterity} />
          <AbilityScore
            label="CON"
            score={character.abilityScores.constitution}
          />
          <AbilityScore
            label="INT"
            score={character.abilityScores.intelligence}
          />
          <AbilityScore label="WIS" score={character.abilityScores.wisdom} />
          <AbilityScore label="CHA" score={character.abilityScores.charisma} />
        </div>
      )}
    </div>
  );
}

/**
 * Get ability abbreviation (STR, DEX, etc.)
 */
function getAbilityAbbrev(ability: Ability): string {
  const abbrevMap: Record<Ability, string> = {
    [Ability.UNSPECIFIED]: '?',
    [Ability.STRENGTH]: 'STR',
    [Ability.DEXTERITY]: 'DEX',
    [Ability.CONSTITUTION]: 'CON',
    [Ability.INTELLIGENCE]: 'INT',
    [Ability.WISDOM]: 'WIS',
    [Ability.CHARISMA]: 'CHA',
  };
  return abbrevMap[ability] || '?';
}

/**
 * Get full ability name
 */
function getAbilityName(ability: Ability): string {
  const nameMap: Record<Ability, string> = {
    [Ability.UNSPECIFIED]: 'Unknown',
    [Ability.STRENGTH]: 'Strength',
    [Ability.DEXTERITY]: 'Dexterity',
    [Ability.CONSTITUTION]: 'Constitution',
    [Ability.INTELLIGENCE]: 'Intelligence',
    [Ability.WISDOM]: 'Wisdom',
    [Ability.CHARISMA]: 'Charisma',
  };
  return nameMap[ability] || 'Unknown';
}
