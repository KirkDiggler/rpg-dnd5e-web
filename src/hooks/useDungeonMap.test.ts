/**
 * Tests for useDungeonMap state management logic
 *
 * Tests the pure functions that power dungeon map accumulation:
 * mergeRoom, updateEntitiesFromRoom, generateFloorTiles, createEmptyState.
 *
 * These are the core of Phase 2 multi-room rendering (rpg-dnd5e-web #311).
 */

import { create } from '@bufbuild/protobuf';
import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import {
  PositionSchema,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type {
  DoorInfo,
  EntityPlacement,
  Room,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  DoorInfoSchema,
  EntityPlacementSchema,
  RoomSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  createEmptyState,
  generateFloorTiles,
  mergeRoom,
  updateEntitiesFromRoom,
} from './useDungeonMap';

/** Helper to create a Room proto message */
function createRoom(opts: {
  id: string;
  width: number;
  height: number;
  originX?: number;
  originZ?: number;
  entities?: Record<
    string,
    {
      entityId: string;
      x: number;
      y: number;
      z: number;
      type: EntityType;
    }
  >;
  walls?: Array<{
    startX: number;
    startY: number;
    startZ: number;
    endX: number;
    endY: number;
    endZ: number;
  }>;
}): Room {
  const origin = create(PositionSchema, {
    x: opts.originX ?? 0,
    y: -(opts.originX ?? 0) - (opts.originZ ?? 0),
    z: opts.originZ ?? 0,
  });

  const entities: Record<string, EntityPlacement> = {};
  if (opts.entities) {
    for (const [key, e] of Object.entries(opts.entities)) {
      entities[key] = create(EntityPlacementSchema, {
        entityId: e.entityId,
        position: create(PositionSchema, { x: e.x, y: e.y, z: e.z }),
        entityType: e.type,
      });
    }
  }

  const walls: Wall[] = (opts.walls ?? []).map((w) =>
    create(WallSchema, {
      start: create(PositionSchema, {
        x: w.startX,
        y: w.startY,
        z: w.startZ,
      }),
      end: create(PositionSchema, { x: w.endX, y: w.endY, z: w.endZ }),
    })
  );

  return create(RoomSchema, {
    id: opts.id,
    width: opts.width,
    height: opts.height,
    origin,
    entities,
    walls,
  });
}

/** Helper to create a DoorInfo proto */
function createDoor(
  connectionId: string,
  x: number,
  y: number,
  z: number,
  isOpen = false
): DoorInfo {
  return create(DoorInfoSchema, {
    connectionId,
    position: create(PositionSchema, { x, y, z }),
    isOpen,
  });
}

describe('createEmptyState', () => {
  it('returns empty dungeon map', () => {
    const state = createEmptyState();

    expect(state.floorTiles.size).toBe(0);
    expect(state.walls).toHaveLength(0);
    expect(state.entities.size).toBe(0);
    expect(state.doors.size).toBe(0);
    expect(state.revealedRoomIds.size).toBe(0);
    expect(state.rooms.size).toBe(0);
    expect(state.currentRoomId).toBeNull();
  });
});

describe('generateFloorTiles', () => {
  it('generates tiles at origin (0,0,0) for default room', () => {
    const room = createRoom({ id: 'room-1', width: 3, height: 2 });
    const tiles = generateFloorTiles(room);

    expect(tiles).toHaveLength(6); // 3 × 2

    // Check specific positions
    const positions = tiles.map((t) => `${t.x},${t.y},${t.z}`);
    expect(positions).toContain('0,0,0');
    expect(positions).toContain('1,-1,0');
    expect(positions).toContain('2,-2,0');
    expect(positions).toContain('0,-1,1');
    expect(positions).toContain('1,-2,1');
    expect(positions).toContain('2,-3,1');
  });

  it('generates tiles at offset origin', () => {
    const room = createRoom({
      id: 'room-1',
      width: 2,
      height: 2,
      originX: 10,
      originZ: 5,
    });
    const tiles = generateFloorTiles(room);

    expect(tiles).toHaveLength(4);

    // All tiles should be offset
    const positions = tiles.map((t) => `${t.x},${t.y},${t.z}`);
    expect(positions).toContain('10,-15,5');
    expect(positions).toContain('11,-16,5');
    expect(positions).toContain('10,-16,6');
    expect(positions).toContain('11,-17,6');

    // Should NOT include origin (0,0,0)
    expect(positions).not.toContain('0,0,0');
  });

  it('maintains cube coordinate invariant (x + y + z = 0)', () => {
    const room = createRoom({
      id: 'room-1',
      width: 5,
      height: 7,
      originX: 3,
      originZ: 4,
    });
    const tiles = generateFloorTiles(room);

    for (const tile of tiles) {
      expect(tile.x + tile.y + tile.z).toBe(0);
    }
  });

  it('generates correct count for various sizes', () => {
    expect(
      generateFloorTiles(createRoom({ id: 'r', width: 1, height: 1 }))
    ).toHaveLength(1);
    expect(
      generateFloorTiles(createRoom({ id: 'r', width: 10, height: 10 }))
    ).toHaveLength(100);
    expect(
      generateFloorTiles(createRoom({ id: 'r', width: 20, height: 15 }))
    ).toHaveLength(300);
  });

  it('tags all tiles with their room ID', () => {
    const room = createRoom({ id: 'my-room', width: 3, height: 3 });
    const tiles = generateFloorTiles(room);

    for (const tile of tiles) {
      expect(tile.roomId).toBe('my-room');
    }
  });
});

describe('mergeRoom', () => {
  describe('first room', () => {
    it('adds floor tiles to empty state', () => {
      const state = createEmptyState();
      const room = createRoom({ id: 'room-1', width: 3, height: 2 });

      const result = mergeRoom(state, room, []);

      expect(result.floorTiles.size).toBe(6);
      expect(result.floorTiles.has('0,0,0')).toBe(true);
      expect(result.floorTiles.has('2,-3,1')).toBe(true);
    });

    it('sets current room and tracks revealed rooms', () => {
      const state = createEmptyState();
      const room = createRoom({ id: 'room-1', width: 3, height: 2 });

      const result = mergeRoom(state, room, []);

      expect(result.currentRoomId).toBe('room-1');
      expect(result.revealedRoomIds.has('room-1')).toBe(true);
      expect(result.rooms.get('room-1')).toBe(room);
    });

    it('adds doors', () => {
      const state = createEmptyState();
      const room = createRoom({ id: 'room-1', width: 3, height: 2 });
      const doors = [
        createDoor('conn-a', 2, -2, 0),
        createDoor('conn-b', 0, -1, 1),
      ];

      const result = mergeRoom(state, room, doors);

      expect(result.doors.size).toBe(2);
      expect(result.doors.has('conn-a')).toBe(true);
      expect(result.doors.has('conn-b')).toBe(true);
    });

    it('adds entities', () => {
      const state = createEmptyState();
      const room = createRoom({
        id: 'room-1',
        width: 3,
        height: 2,
        entities: {
          'char-1': {
            entityId: 'char-1',
            x: 0,
            y: 0,
            z: 0,
            type: EntityType.CHARACTER,
          },
          'mob-1': {
            entityId: 'mob-1',
            x: 2,
            y: -2,
            z: 0,
            type: EntityType.MONSTER,
          },
        },
      });

      const result = mergeRoom(state, room, []);

      expect(result.entities.size).toBe(2);
      expect(result.entities.has('char-1')).toBe(true);
      expect(result.entities.has('mob-1')).toBe(true);
    });

    it('adds walls', () => {
      const state = createEmptyState();
      const room = createRoom({
        id: 'room-1',
        width: 3,
        height: 2,
        walls: [
          {
            startX: 0,
            startY: 0,
            startZ: 0,
            endX: 2,
            endY: -2,
            endZ: 0,
          },
        ],
      });

      const result = mergeRoom(state, room, []);

      expect(result.walls).toHaveLength(1);
    });
  });

  describe('second room with offset', () => {
    it('accumulates floor tiles from both rooms', () => {
      let state = createEmptyState();

      const room1 = createRoom({ id: 'room-1', width: 3, height: 2 });
      state = mergeRoom(state, room1, []);

      const room2 = createRoom({
        id: 'room-2',
        width: 2,
        height: 2,
        originX: 4,
        originZ: 0,
      });
      state = mergeRoom(state, room2, []);

      // 6 + 4 = 10 tiles
      expect(state.floorTiles.size).toBe(10);

      // Room 1 tiles
      expect(state.floorTiles.has('0,0,0')).toBe(true);
      // Room 2 tiles
      expect(state.floorTiles.has('4,-4,0')).toBe(true);
      expect(state.floorTiles.has('5,-5,0')).toBe(true);
    });

    it('updates current room to newest', () => {
      let state = createEmptyState();

      state = mergeRoom(
        state,
        createRoom({ id: 'room-1', width: 3, height: 2 }),
        []
      );
      state = mergeRoom(
        state,
        createRoom({
          id: 'room-2',
          width: 2,
          height: 2,
          originX: 4,
          originZ: 0,
        }),
        []
      );

      expect(state.currentRoomId).toBe('room-2');
      expect(state.revealedRoomIds.size).toBe(2);
    });

    it('accumulates walls from both rooms', () => {
      let state = createEmptyState();

      const room1 = createRoom({
        id: 'room-1',
        width: 3,
        height: 2,
        walls: [
          { startX: 0, startY: 0, startZ: 0, endX: 2, endY: -2, endZ: 0 },
        ],
      });
      state = mergeRoom(state, room1, []);

      const room2 = createRoom({
        id: 'room-2',
        width: 2,
        height: 2,
        originX: 4,
        originZ: 0,
        walls: [
          { startX: 4, startY: -4, startZ: 0, endX: 5, endY: -5, endZ: 0 },
        ],
      });
      state = mergeRoom(state, room2, []);

      expect(state.walls).toHaveLength(2);
    });

    it('accumulates doors from both rooms', () => {
      let state = createEmptyState();

      state = mergeRoom(
        state,
        createRoom({ id: 'room-1', width: 3, height: 2 }),
        [createDoor('conn-a', 2, -2, 0)]
      );
      state = mergeRoom(
        state,
        createRoom({
          id: 'room-2',
          width: 2,
          height: 2,
          originX: 4,
          originZ: 0,
        }),
        [createDoor('conn-b', 5, -5, 0)]
      );

      expect(state.doors.size).toBe(2);
    });

    it('merges entities across rooms (character moves, old monsters remain)', () => {
      let state = createEmptyState();

      const room1 = createRoom({
        id: 'room-1',
        width: 3,
        height: 2,
        entities: {
          'char-1': {
            entityId: 'char-1',
            x: 1,
            y: -1,
            z: 0,
            type: EntityType.CHARACTER,
          },
          'mob-1': {
            entityId: 'mob-1',
            x: 2,
            y: -2,
            z: 0,
            type: EntityType.MONSTER,
          },
        },
      });
      state = mergeRoom(state, room1, []);

      const room2 = createRoom({
        id: 'room-2',
        width: 2,
        height: 2,
        originX: 4,
        originZ: 0,
        entities: {
          // Character moved to room 2
          'char-1': {
            entityId: 'char-1',
            x: 4,
            y: -4,
            z: 0,
            type: EntityType.CHARACTER,
          },
          'mob-2': {
            entityId: 'mob-2',
            x: 5,
            y: -5,
            z: 0,
            type: EntityType.MONSTER,
          },
        },
      });
      state = mergeRoom(state, room2, []);

      // 3 unique entities
      expect(state.entities.size).toBe(3);
      // char-1 updated to new position
      expect(state.entities.get('char-1')?.position?.x).toBe(4);
      // mob-1 still exists from room 1
      expect(state.entities.has('mob-1')).toBe(true);
      // mob-2 from room 2
      expect(state.entities.has('mob-2')).toBe(true);
    });
  });

  describe('re-adding same room (state sync / update)', () => {
    it('does not duplicate floor tiles', () => {
      let state = createEmptyState();

      const room = createRoom({ id: 'room-1', width: 3, height: 2 });
      state = mergeRoom(state, room, []);
      state = mergeRoom(state, room, []);

      // Still 6, not 12
      expect(state.floorTiles.size).toBe(6);
    });

    it('updates entity positions', () => {
      let state = createEmptyState();

      const room1 = createRoom({
        id: 'room-1',
        width: 3,
        height: 2,
        entities: {
          'char-1': {
            entityId: 'char-1',
            x: 0,
            y: 0,
            z: 0,
            type: EntityType.CHARACTER,
          },
        },
      });
      state = mergeRoom(state, room1, []);

      // Same room, character moved
      const room1Updated = createRoom({
        id: 'room-1',
        width: 3,
        height: 2,
        entities: {
          'char-1': {
            entityId: 'char-1',
            x: 1,
            y: -1,
            z: 0,
            type: EntityType.CHARACTER,
          },
        },
      });
      state = mergeRoom(state, room1Updated, []);

      expect(state.entities.get('char-1')?.position?.x).toBe(1);
    });
  });

  describe('immutability', () => {
    it('does not mutate input state', () => {
      const state = createEmptyState();
      const room = createRoom({ id: 'room-1', width: 3, height: 2 });

      const newState = mergeRoom(state, room, []);

      // Original state unchanged
      expect(state.floorTiles.size).toBe(0);
      expect(state.revealedRoomIds.size).toBe(0);
      expect(state.currentRoomId).toBeNull();

      // New state has data
      expect(newState.floorTiles.size).toBe(6);
    });
  });
});

describe('updateEntitiesFromRoom', () => {
  it('updates entity positions without changing floor tiles', () => {
    let state = createEmptyState();

    const room = createRoom({
      id: 'room-1',
      width: 3,
      height: 2,
      entities: {
        'char-1': {
          entityId: 'char-1',
          x: 0,
          y: 0,
          z: 0,
          type: EntityType.CHARACTER,
        },
      },
    });
    state = mergeRoom(state, room, []);

    const updatedRoom = createRoom({
      id: 'room-1',
      width: 3,
      height: 2,
      entities: {
        'char-1': {
          entityId: 'char-1',
          x: 2,
          y: -2,
          z: 0,
          type: EntityType.CHARACTER,
        },
      },
    });
    state = updateEntitiesFromRoom(state, updatedRoom);

    // Floor tiles unchanged
    expect(state.floorTiles.size).toBe(6);
    // Entity position updated
    expect(state.entities.get('char-1')?.position?.x).toBe(2);
  });

  it('does not mutate input state', () => {
    let state = createEmptyState();

    const room = createRoom({
      id: 'room-1',
      width: 3,
      height: 2,
      entities: {
        'char-1': {
          entityId: 'char-1',
          x: 0,
          y: 0,
          z: 0,
          type: EntityType.CHARACTER,
        },
      },
    });
    state = mergeRoom(state, room, []);

    const updatedRoom = createRoom({
      id: 'room-1',
      width: 3,
      height: 2,
      entities: {
        'char-1': {
          entityId: 'char-1',
          x: 2,
          y: -2,
          z: 0,
          type: EntityType.CHARACTER,
        },
      },
    });
    const newState = updateEntitiesFromRoom(state, updatedRoom);

    // Original state entities unchanged
    expect(state.entities.get('char-1')?.position?.x).toBe(0);
    // New state updated
    expect(newState.entities.get('char-1')?.position?.x).toBe(2);
  });

  it('updates stored room data', () => {
    let state = createEmptyState();

    const room = createRoom({
      id: 'room-1',
      width: 3,
      height: 2,
      entities: {
        'char-1': {
          entityId: 'char-1',
          x: 0,
          y: 0,
          z: 0,
          type: EntityType.CHARACTER,
        },
      },
    });
    state = mergeRoom(state, room, []);

    const updatedRoom = createRoom({
      id: 'room-1',
      width: 3,
      height: 2,
      entities: {
        'char-1': {
          entityId: 'char-1',
          x: 2,
          y: -2,
          z: 0,
          type: EntityType.CHARACTER,
        },
      },
    });
    state = updateEntitiesFromRoom(state, updatedRoom);

    // Stored room should be the updated one
    expect(state.rooms.get('room-1')).toBe(updatedRoom);
  });
});
