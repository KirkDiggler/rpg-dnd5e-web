import {
  getMartialArtsDie,
  getUnarmoredMovementBonus,
  isBrutalCriticalData,
  isMartialArtsData,
  isRagingData,
  isSneakAttackData,
  isUnarmoredMovementData,
  parseConditionData,
  type ConditionData,
} from '@/types/conditionData';
import type { Condition } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import {
  getConditionCategory,
  getConditionIcon,
  type ConditionCategory,
} from './featureIcons';
import styles from './features.module.css';

export interface ConditionBadgeProps {
  condition: Condition;
}

/**
 * ConditionBadge - Displays a single active condition as a badge
 *
 * Styling is determined by parsing the source ref:
 * - dnd5e:classes:* -> class feature (blue)
 * - dnd5e:fighting-styles:* -> fighting style (green)
 * - dnd5e:conditions:* -> debuff (red)
 * - dnd5e:races:* -> racial trait (purple)
 */
export function ConditionBadge({ condition }: ConditionBadgeProps) {
  const icon = getConditionIcon(condition.name);
  const category = getConditionCategory(condition.source);
  const categoryClass = getCategoryClass(category);
  const data = parseConditionData(condition.conditionData);
  const subtitle = getSubtitle(data);

  return (
    <div
      className={`${styles.conditionBadge} ${categoryClass}`}
      title={getTooltip(condition, data)}
    >
      <span className={styles.conditionIcon}>{icon}</span>
      <span className={styles.conditionName}>{condition.name}</span>
      {subtitle && <span className={styles.conditionSubtitle}>{subtitle}</span>}
    </div>
  );
}

/**
 * Get CSS class for the condition category
 */
function getCategoryClass(category: ConditionCategory): string {
  switch (category) {
    case 'class':
      return styles.conditionClass;
    case 'fighting-style':
      return styles.conditionFightingStyle;
    case 'racial':
      return styles.conditionRacial;
    case 'debuff':
      return styles.conditionDebuff;
    default:
      return styles.conditionDefault;
  }
}

/**
 * Get a compact subtitle for displaying key stats on the badge
 */
function getSubtitle(data: ConditionData | undefined): string | null {
  if (!data) return null;

  if (isRagingData(data)) {
    return `+${data.damage_bonus}`;
  }

  if (isSneakAttackData(data)) {
    return `${data.damage_dice}d6`;
  }

  if (isBrutalCriticalData(data)) {
    return `+${data.extra_dice}d`;
  }

  if (isMartialArtsData(data)) {
    return getMartialArtsDie(data.monk_level);
  }

  if (isUnarmoredMovementData(data)) {
    return `+${getUnarmoredMovementBonus(data.monk_level)}ft`;
  }

  return null;
}

/**
 * Generate tooltip for the condition with rich data
 */
function getTooltip(
  condition: Condition,
  data: ConditionData | undefined
): string {
  const parts: string[] = [condition.name];

  // Add rich data details to tooltip
  if (data) {
    if (isRagingData(data)) {
      parts.push(`+${data.damage_bonus} melee damage`);
      parts.push(
        `Active for ${data.turns_active} turn${data.turns_active === 1 ? '' : 's'}`
      );
      parts.push('Resistance: B/P/S');
    } else if (isSneakAttackData(data)) {
      parts.push(`+${data.damage_dice}d6 damage`);
      parts.push('Requires advantage or adjacent ally');
    } else if (isBrutalCriticalData(data)) {
      parts.push(`+${data.extra_dice} weapon die on critical`);
    } else if (isMartialArtsData(data)) {
      parts.push(`Unarmed: ${getMartialArtsDie(data.monk_level)}`);
      parts.push('Use DEX for monk weapons');
    } else if (isUnarmoredMovementData(data)) {
      parts.push(`+${getUnarmoredMovementBonus(data.monk_level)} ft speed`);
    }
  }

  if (condition.notes) {
    parts.push(condition.notes);
  }

  if (condition.duration > 0) {
    parts.push(`${condition.duration} rounds remaining`);
  } else if (condition.duration === -1) {
    parts.push('Until ended');
  }

  return parts.join(' - ');
}
