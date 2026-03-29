/**
 * useDungeonMap - Accumulates revealed rooms into a single dungeon map state
 *
 * Instead of replacing room state on each reveal, this hook maintains
 * an accumulated view of all explored rooms in the dungeon.
 *
 * Each room uses its `origin` field (dungeon-absolute coordinates) to
 * position floor tiles, walls, entities, and doors in a unified coordinate system.
 *
 * Phase 2 of multi-room rendering (rpg-dnd5e-web #311).
 * Rendering changes come in Phase 3 (#312).
 */

import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type {
  DoorInfo,
  EntityPlacement,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useCallback, useState } from 'react';

/** A floor tile in dungeon-absolute coordinates */
export interface AbsoluteFloorTile {
  x: number;
  y: number;
  z: number;
  roomId: string;
}

/** Accumulated dungeon map state across all revealed rooms */
export interface DungeonMapState {
  /** All floor tile positions (dungeon-absolute coordinates) keyed by "x,y,z" */
  floorTiles: Map<string, AbsoluteFloorTile>;

  /** All walls across revealed rooms, keyed by normalized coordinate string to prevent duplicates */
  walls: Map<string, Wall>;

  /** All entities across all rooms, keyed by entity ID */
  entities: Map<string, EntityPlacement>;

  /** All doors across all rooms, keyed by connection ID */
  doors: Map<string, DoorInfo>;

  /** Set of revealed room IDs */
  revealedRoomIds: Set<string>;

  /** Room data indexed by room ID (for local coordinate lookups) */
  rooms: Map<string, Room>;

  /** The currently active room ID (where combat/player is) */
  currentRoomId: string | null;
}

/** Create coordinate key for map lookups */
function coordKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/**
 * Create a canonical key for a wall segment.
 * Normalizes direction so that (A->B) and (B->A) produce the same key,
 * preventing duplicate walls when adjacent rooms both report a shared boundary.
 */
export function wallKey(wall: Wall): string {
  const sx = wall.start?.x ?? 0;
  const sy = wall.start?.y ?? 0;
  const sz = wall.start?.z ?? 0;
  const ex = wall.end?.x ?? 0;
  const ey = wall.end?.y ?? 0;
  const ez = wall.end?.z ?? 0;

  // Sort lexicographically so direction doesn't matter
  const startStr = `${sx},${sy},${sz}`;
  const endStr = `${ex},${ey},${ez}`;
  return startStr < endStr ? `${startStr}-${endStr}` : `${endStr}-${startStr}`;
}

/** Create an empty dungeon map state. Exported for testing. */
export function createEmptyState(): DungeonMapState {
  return {
    floorTiles: new Map(),
    walls: new Map(),
    entities: new Map(),
    doors: new Map(),
    revealedRoomIds: new Set(),
    rooms: new Map(),
    currentRoomId: null,
  };
}

/**
 * Generate floor tile positions for a room using its origin.
 * Room origin is in dungeon-absolute cube coordinates.
 * Floor tiles span from origin to origin + (width, height).
 * Exported for testing.
 */
export function generateFloorTiles(room: Room): AbsoluteFloorTile[] {
  const tiles: AbsoluteFloorTile[] = [];
  const originX = room.origin?.x ?? 0;
  const originZ = room.origin?.z ?? 0;

  for (let z = 0; z < room.height; z++) {
    for (let x = 0; x < room.width; x++) {
      const absX = originX + x;
      const absZ = originZ + z;
      const absY = -absX - absZ; // Cube coordinate constraint: x + y + z = 0
      tiles.push({
        x: absX,
        y: absY,
        z: absZ,
        roomId: room.id,
      });
    }
  }
  return tiles;
}

/**
 * Merge a room into existing dungeon map state.
 * Handles both first room (combat started) and subsequent rooms (room revealed).
 * Exported for testing.
 */
export function mergeRoom(
  state: DungeonMapState,
  room: Room,
  doors: DoorInfo[]
): DungeonMapState {
  // If room already revealed, update entities/doors but don't duplicate tiles
  const isUpdate = state.revealedRoomIds.has(room.id);

  // Clone state for immutable update
  const newFloorTiles = new Map(state.floorTiles);
  const newWalls = new Map(state.walls);
  const newEntities = new Map(state.entities);
  const newDoors = new Map(state.doors);
  const newRevealedRoomIds = new Set(state.revealedRoomIds);
  const newRooms = new Map(state.rooms);

  // Add floor tiles (only for new rooms)
  if (!isUpdate) {
    const tiles = generateFloorTiles(room);
    for (const tile of tiles) {
      newFloorTiles.set(coordKey(tile.x, tile.y, tile.z), tile);
    }
  }

  // Add walls (already in absolute coordinates from API Phase 1)
  // Keyed by normalized coordinates to automatically deduplicate shared boundary walls
  if (!isUpdate && room.walls) {
    for (const wall of room.walls) {
      const key = wallKey(wall);
      if (!newWalls.has(key)) {
        newWalls.set(key, wall);
      }
    }
  }

  // Merge entities (keyed by ID — handles movement between rooms)
  if (room.entities) {
    for (const [entityId, entity] of Object.entries(room.entities)) {
      newEntities.set(entityId, entity);
    }
  }

  // Merge doors (keyed by connection ID)
  for (const door of doors) {
    newDoors.set(door.connectionId, door);
  }

  // Track room
  newRevealedRoomIds.add(room.id);
  newRooms.set(room.id, room);

  return {
    floorTiles: newFloorTiles,
    walls: newWalls,
    entities: newEntities,
    doors: newDoors,
    revealedRoomIds: newRevealedRoomIds,
    rooms: newRooms,
    currentRoomId: room.id,
  };
}

/**
 * Update entity positions in the dungeon map (e.g., after movement, monster turns).
 * This updates the accumulated entities map without changing room/floor data.
 *
 * Also removes entities that were in the previous version of this room but are
 * no longer present (e.g., monsters that died and were removed by the API).
 *
 * Exported for testing.
 */
export function updateEntitiesFromRoom(
  state: DungeonMapState,
  room: Room
): DungeonMapState {
  const newEntities = new Map(state.entities);

  // Remove entities that were in the previous version of this room but are
  // no longer present (e.g., dead monsters removed by the API)
  const previousRoom = state.rooms.get(room.id);
  if (previousRoom?.entities) {
    const updatedEntityIds = new Set(Object.keys(room.entities ?? {}));
    for (const entityId of Object.keys(previousRoom.entities)) {
      if (!updatedEntityIds.has(entityId)) {
        newEntities.delete(entityId);
      }
    }
  }

  // Add/update entities from the new room data
  if (room.entities) {
    for (const [entityId, entity] of Object.entries(room.entities)) {
      newEntities.set(entityId, entity);
    }
  }

  // Also update the stored room data
  const newRooms = new Map(state.rooms);
  newRooms.set(room.id, room);

  return {
    ...state,
    entities: newEntities,
    rooms: newRooms,
  };
}

export interface UseDungeonMapResult {
  /** The accumulated dungeon map state */
  dungeonMap: DungeonMapState;

  /** The currently active room (for backward compat with existing rendering) */
  currentRoom: Room | null;

  /**
   * Add/merge a room into the dungeon map.
   * Call on CombatStarted and RoomRevealed events.
   */
  addRoom: (room: Room, doors: DoorInfo[]) => void;

  /**
   * Update entity positions from an updated room.
   * Call on TurnEnded, MonsterTurnCompleted, MovementCompleted, AttackResolved.
   */
  updateEntities: (room: Room) => void;

  /**
   * Update doors state (e.g., when a door is opened).
   */
  updateDoors: (doors: DoorInfo[]) => void;

  /**
   * Reset the dungeon map (e.g., new encounter).
   */
  reset: () => void;
}

/**
 * Hook to manage accumulated dungeon map state across room reveals.
 */
export function useDungeonMap(): UseDungeonMapResult {
  const [dungeonMap, setDungeonMap] =
    useState<DungeonMapState>(createEmptyState);

  const addRoom = useCallback((room: Room, doors: DoorInfo[]) => {
    setDungeonMap((prev) => mergeRoom(prev, room, doors));
  }, []);

  const updateEntities = useCallback((room: Room) => {
    setDungeonMap((prev) => updateEntitiesFromRoom(prev, room));
  }, []);

  const updateDoors = useCallback((doors: DoorInfo[]) => {
    setDungeonMap((prev) => {
      const newDoors = new Map(prev.doors);
      for (const door of doors) {
        newDoors.set(door.connectionId, door);
      }
      return { ...prev, doors: newDoors };
    });
  }, []);

  const reset = useCallback(() => {
    setDungeonMap(createEmptyState());
  }, []);

  // Derive current room from state
  const currentRoom = dungeonMap.currentRoomId
    ? (dungeonMap.rooms.get(dungeonMap.currentRoomId) ?? null)
    : null;

  return {
    dungeonMap,
    currentRoom,
    addRoom,
    updateEntities,
    updateDoors,
    reset,
  };
}
