/**
 * Pure utility functions for building entity arrays for HexGrid rendering.
 *
 * Extracted from BattleMapPanel to enable testing without a component harness
 * and to comply with react-refresh/only-export-components (component files
 * must not export non-component values).
 */

import { getEntityName, isDead } from '@/utils/entityHelpers';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  EntityPlacement,
  EntityState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/** The shape of an entity entry passed to HexGrid for rendering. */
export interface RenderableEntity {
  entityId: string;
  name: string;
  position: { x: number; y: number; z: number };
  type: 'player' | 'monster' | 'obstacle';
  isDead: boolean;
}

/**
 * Build the entity array for HexGrid rendering from unified encounter state.
 *
 * Renders ALL entities from all revealed rooms — EntityState.position is
 * dungeon-absolute, and the hex grid's floor tile set acts as the visual
 * boundary. No roomId filter is applied here; that was the regression in #371
 * that caused room 2 entities to be invisible after OpenDoor (#385).
 */
export function buildEntitiesFromEncounterState(
  encounterEntities: Map<string, EntityState>
): RenderableEntity[] {
  return Array.from(encounterEntities.values()).map((entity) => {
    let displayType: 'player' | 'monster' | 'obstacle';
    if (entity.entityType === EntityType.CHARACTER) {
      displayType = 'player';
    } else if (entity.entityType === EntityType.MONSTER) {
      displayType = 'monster';
    } else {
      displayType = 'obstacle';
    }
    return {
      entityId: entity.entityId,
      name: getEntityName(entity),
      position: {
        x: entity.position?.x || 0,
        y: entity.position?.y || 0,
        z: entity.position?.z || 0,
      },
      type: displayType,
      isDead: isDead(entity),
    };
  });
}

/**
 * Build the entity array for HexGrid rendering from the legacy dungeonMap state.
 * Used as fallback when encounterEntities is not yet populated.
 */
export function buildEntitiesFromDungeonMap(
  dungeonMapEntities: Map<string, EntityPlacement>,
  allPartyCharacters: Character[],
  deadMonsterIds: Set<string>
): RenderableEntity[] {
  return Array.from(dungeonMapEntities.values()).map((entity) => {
    let displayType: 'player' | 'monster' | 'obstacle';
    if (entity.entityType === EntityType.CHARACTER) {
      displayType = 'player';
    } else if (entity.entityType === EntityType.MONSTER) {
      displayType = 'monster';
    } else {
      displayType = 'obstacle';
    }
    return {
      entityId: entity.entityId,
      name:
        allPartyCharacters.find((c) => c.id === entity.entityId)?.name ||
        entity.entityId,
      position: {
        x: entity.position?.x || 0,
        y: entity.position?.y || 0,
        z: entity.position?.z || 0,
      },
      type: displayType,
      isDead:
        entity.entityType === EntityType.MONSTER &&
        deadMonsterIds.has(entity.entityId),
    };
  });
}
