import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ConditionBadge } from './ConditionBadge';
import styles from './features.module.css';

export interface ConditionsDisplayProps {
  /** Character whose conditions to display */
  character: Character;
}

/**
 * ConditionsDisplay - Shows all active conditions on a character
 *
 * Displays conditions as badges in a row. Each badge is styled
 * based on its source (class feature, fighting style, debuff, etc.)
 *
 * Display only for MVP - no dismiss functionality.
 */
export function ConditionsDisplay({ character }: ConditionsDisplayProps) {
  const conditions = character.activeConditions || [];

  if (conditions.length === 0) {
    return null;
  }

  return (
    <div className={styles.conditionsDisplay}>
      {conditions.map((condition, index) => (
        <ConditionBadge key={condition.name || index} condition={condition} />
      ))}
    </div>
  );
}
