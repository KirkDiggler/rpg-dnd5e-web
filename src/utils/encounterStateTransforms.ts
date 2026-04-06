/**
 * Pure transform functions for converting EncounterStateData into Room/Door/EntityPlacement objects.
 *
 * These functions were extracted from LobbyView.tsx to enable unit testing.
 * They are the critical path for multi-room dungeon map rendering.
 *
 * Background: roomFromEncounterState was the source of the Round 2 bug where
 * only the current room's tiles appeared on the dungeon map instead of all
 * revealed rooms.
 */

import type {
  DoorInfo,
  EncounterStateData,
  EntityPlacement,
  EntityState,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Convert an EntityState to an EntityPlacement for dungeon map compatibility.
 * EntityPlacement is a spatial/visual subset of EntityState — no HP, conditions, etc.
 */
export function entityStateToPlacement(entity: EntityState): EntityPlacement {
  const placement: EntityPlacement = {
    entityId: entity.entityId,
    entityType: entity.entityType,
    position: entity.position,
    size: entity.size,
    blocksMovement: entity.blocksMovement,
    blocksLineOfSight: entity.blocksLineOfSight,
    visualType: { case: undefined, value: undefined },
    $typeName: 'dnd5e.api.v1alpha1.EntityPlacement' as const,
    $unknown: undefined,
  };

  if (entity.details.case === 'monsterDetails') {
    placement.visualType = {
      case: 'monsterType' as const,
      value: entity.details.value.monsterType,
    };
  }

  return placement;
}

/**
 * Build a Room from EncounterStateData for the current room only.
 * Returns undefined if currentRoomId has no matching RoomLayout.
 *
 * Entities are filtered to only those whose roomId matches currentRoomId.
 */
export function roomFromEncounterState(
  data: EncounterStateData
): Room | undefined {
  const roomLayout = data.rooms[data.currentRoomId];
  if (!roomLayout) return undefined;

  const entities: { [key: string]: EntityPlacement } = {};
  for (const entity of Object.values(data.entities)) {
    if (entity.roomId === data.currentRoomId) {
      entities[entity.entityId] = entityStateToPlacement(entity);
    }
  }

  return {
    id: roomLayout.id,
    type: roomLayout.type,
    width: roomLayout.width,
    height: roomLayout.height,
    gridType: roomLayout.gridType,
    walls: roomLayout.walls,
    origin: roomLayout.origin,
    entities,
    $typeName: 'dnd5e.api.v1alpha1.Room' as const,
    $unknown: undefined,
  } as Room;
}

/**
 * Build Room objects for ALL rooms in the EncounterStateData snapshot.
 *
 * Non-current rooms come first; the current room is appended last.
 * This ordering ensures the current room is always the "top" of the
 * accumulated dungeon map when processing with mergeRoom().
 *
 * Entities are filtered per room by their roomId field.
 */
export function allRoomsFromEncounterState(data: EncounterStateData): Room[] {
  const rooms: Room[] = [];

  // Build entity lists keyed by roomId for efficient lookup
  const entitiesByRoom: {
    [roomId: string]: { [entityId: string]: EntityPlacement };
  } = {};
  for (const entity of Object.values(data.entities)) {
    if (!entitiesByRoom[entity.roomId]) {
      entitiesByRoom[entity.roomId] = {};
    }
    entitiesByRoom[entity.roomId][entity.entityId] =
      entityStateToPlacement(entity);
  }

  // Non-current rooms first
  for (const [roomId, roomLayout] of Object.entries(data.rooms)) {
    if (roomId === data.currentRoomId) continue;

    rooms.push({
      id: roomLayout.id,
      type: roomLayout.type,
      width: roomLayout.width,
      height: roomLayout.height,
      gridType: roomLayout.gridType,
      walls: roomLayout.walls,
      origin: roomLayout.origin,
      entities: entitiesByRoom[roomId] ?? {},
      $typeName: 'dnd5e.api.v1alpha1.Room' as const,
      $unknown: undefined,
    } as Room);
  }

  // Current room last
  const currentLayout = data.rooms[data.currentRoomId];
  if (currentLayout) {
    rooms.push({
      id: currentLayout.id,
      type: currentLayout.type,
      width: currentLayout.width,
      height: currentLayout.height,
      gridType: currentLayout.gridType,
      walls: currentLayout.walls,
      origin: currentLayout.origin,
      entities: entitiesByRoom[data.currentRoomId] ?? {},
      $typeName: 'dnd5e.api.v1alpha1.Room' as const,
      $unknown: undefined,
    } as Room);
  }

  return rooms;
}

/**
 * Extract DoorInfo array from EncounterStateData.
 * Doors are stored as a map keyed by connectionId; this returns just the values.
 */
export function doorsFromEncounterState(data: EncounterStateData): DoorInfo[] {
  return Object.values(data.doors);
}

/**
 * Build MonsterCombatState-compatible data from EncounterStateData entities.
 * Returns only MONSTER entities with monsterDetails.
 *
 * Used to feed monster type information for texture selection.
 */
export function monstersFromEncounterState(data: EncounterStateData) {
  const result = [];
  for (const entity of Object.values(data.entities)) {
    if (
      entity.entityType === EntityType.MONSTER &&
      entity.details.case === 'monsterDetails'
    ) {
      result.push({
        monsterId: entity.entityId,
        monsterName: entity.details.value.name,
        monsterType: entity.details.value.monsterType,
        currentHitPoints: entity.currentHitPoints,
        maxHitPoints: entity.maxHitPoints,
        armorClass: entity.details.value.armorClass,
        $typeName: 'dnd5e.api.v1alpha1.MonsterCombatState' as const,
        $unknown: undefined,
      });
    }
  }
  return result;
}
