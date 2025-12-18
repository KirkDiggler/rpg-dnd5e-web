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

  return (
    <div
      className={`${styles.conditionBadge} ${categoryClass}`}
      title={getTooltip(condition)}
    >
      <span className={styles.conditionIcon}>{icon}</span>
      <span className={styles.conditionName}>{condition.name}</span>
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
 * Generate tooltip for the condition
 */
function getTooltip(condition: Condition): string {
  const parts: string[] = [condition.name];

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
