import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  ConditionId,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Checks if an entity has a specific condition active.
 */
export function hasCondition(
  entity: EntityState,
  conditionId: ConditionId
): boolean {
  return entity.activeConditions.some((c) => c.id === conditionId);
}

/**
 * Returns true if the entity is dead.
 * Only monsters die at 0 HP — characters go unconscious instead.
 */
export function isDead(entity: EntityState): boolean {
  return (
    entity.details.case === 'monsterDetails' && entity.currentHitPoints <= 0
  );
}

/**
 * Returns true if the entity has the UNCONSCIOUS condition.
 */
export function isUnconscious(entity: EntityState): boolean {
  return hasCondition(entity, ConditionId.UNCONSCIOUS);
}

export type HealthCategory = {
  label: string;
  color: string;
};

/**
 * Returns a health label and color based on the entity's current HP ratio.
 * Dead is checked first (monsters only), then HP percentage thresholds.
 *
 * Thresholds:
 *   dead      -> #666
 *   > 75%     -> Uninjured  #4CAF50
 *   > 50%     -> Injured    #FFC107
 *   > 25%     -> Bloodied   #FF9800
 *   <= 25%    -> Near Death #F44336
 */
export function getHealthCategory(entity: EntityState): HealthCategory {
  if (isDead(entity)) {
    return { label: 'Dead', color: '#666' };
  }

  const { currentHitPoints, maxHitPoints } = entity;

  // Guard against divide-by-zero
  if (maxHitPoints <= 0) {
    return { label: 'Near Death', color: '#F44336' };
  }

  const ratio = currentHitPoints / maxHitPoints;

  if (ratio > 0.75) {
    return { label: 'Uninjured', color: '#4CAF50' };
  }
  if (ratio > 0.5) {
    return { label: 'Injured', color: '#FFC107' };
  }
  if (ratio > 0.25) {
    return { label: 'Bloodied', color: '#FF9800' };
  }
  return { label: 'Near Death', color: '#F44336' };
}

/**
 * Extracts the display name from an entity's details oneof.
 * Falls back to entityId if details are not character or monster.
 */
export function getEntityName(entity: EntityState): string {
  if (entity.details.case === 'characterDetails') {
    return entity.details.value.name;
  }
  if (entity.details.case === 'monsterDetails') {
    return entity.details.value.name;
  }
  return entity.entityId;
}

// Re-export EntityType for convenience in consumers
export { ConditionId, EntityType };
