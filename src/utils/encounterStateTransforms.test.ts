/**
 * Tests for encounterStateTransforms pure functions
 *
 * These functions convert EncounterStateData snapshots into Room, DoorInfo,
 * and EntityPlacement objects for dungeon map rendering.
 *
 * The allRoomsFromEncounterState function was the source of the Round 2 bug
 * where only the current room appeared on the map instead of all revealed rooms.
 *
 * Related: rpg-dnd5e-web multi-room rendering (#311, #312)
 */

import { create } from '@bufbuild/protobuf';
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type {
  DoorInfo,
  EncounterStateData,
  EntityState,
  RoomLayout,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  DoorInfoSchema,
  EncounterStateDataSchema,
  EntityStateSchema,
  RoomLayoutSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  EntitySize,
  EntityType,
  MonsterType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  createEmptyState,
  generateFloorTiles,
  mergeRoom,
} from '../hooks/useDungeonMap';
import {
  allRoomsFromEncounterState,
  doorsFromEncounterState,
  entityStateToPlacement,
  roomFromEncounterState,
} from './encounterStateTransforms';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal RoomLayout proto message */
function createRoomLayout(opts?: {
  id?: string;
  width?: number;
  height?: number;
  originX?: number;
  originZ?: number;
}): RoomLayout {
  const id = opts?.id ?? 'room-1';
  const width = opts?.width ?? 5;
  const height = opts?.height ?? 5;
  const originX = opts?.originX ?? 0;
  const originZ = opts?.originZ ?? 0;

  return create(RoomLayoutSchema, {
    id,
    width,
    height,
    origin: create(PositionSchema, {
      x: originX,
      y: -originX - originZ,
      z: originZ,
    }),
  });
}

/** Build a minimal EntityState proto message */
function createEntityState(opts?: {
  entityId?: string;
  entityType?: EntityType;
  roomId?: string;
  x?: number;
  z?: number;
}): EntityState {
  return create(EntityStateSchema, {
    entityId: opts?.entityId ?? 'entity-1',
    entityType: opts?.entityType ?? EntityType.CHARACTER,
    roomId: opts?.roomId ?? 'room-1',
    size: EntitySize.MEDIUM,
    blocksMovement: true,
    blocksLineOfSight: false,
    position: create(PositionSchema, {
      x: opts?.x ?? 0,
      y: -(opts?.x ?? 0) - (opts?.z ?? 0),
      z: opts?.z ?? 0,
    }),
    details: { case: undefined },
  });
}

/** Build a monster EntityState with monsterDetails populated */
function createMonsterEntityState(opts?: {
  entityId?: string;
  roomId?: string;
  x?: number;
  z?: number;
  monsterType?: MonsterType;
}): EntityState {
  return create(EntityStateSchema, {
    entityId: opts?.entityId ?? 'monster-1',
    entityType: EntityType.MONSTER,
    roomId: opts?.roomId ?? 'room-1',
    size: EntitySize.MEDIUM,
    blocksMovement: true,
    blocksLineOfSight: true,
    position: create(PositionSchema, {
      x: opts?.x ?? 1,
      y: -(opts?.x ?? 1) - (opts?.z ?? 0),
      z: opts?.z ?? 0,
    }),
    details: {
      case: 'monsterDetails',
      value: {
        name: 'Goblin',
        monsterType: opts?.monsterType ?? MonsterType.GOBLIN,
        armorClass: 15,
        $typeName: 'dnd5e.api.v1alpha1.MonsterDetails',
        $unknown: undefined,
      },
    },
  });
}

/** Build an EncounterStateData proto with given rooms, entities, and doors */
function createEncounterStateData(opts?: {
  encounterId?: string;
  currentRoomId?: string;
  rooms?: Record<string, RoomLayout>;
  entities?: Record<string, EntityState>;
  doors?: Record<string, DoorInfo>;
}): EncounterStateData {
  return create(EncounterStateDataSchema, {
    encounterId: opts?.encounterId ?? 'enc-1',
    dungeonId: 'dng-1',
    currentRoomId: opts?.currentRoomId ?? 'room-1',
    rooms: opts?.rooms ?? {},
    entities: opts?.entities ?? {},
    doors: opts?.doors ?? {},
  });
}

// ---------------------------------------------------------------------------
// entityStateToPlacement
// ---------------------------------------------------------------------------

describe('entityStateToPlacement', () => {
  it('converts basic character entity correctly', () => {
    const entity = createEntityState({
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      roomId: 'room-1',
      x: 2,
      z: 3,
    });

    const placement = entityStateToPlacement(entity);

    expect(placement.entityId).toBe('char-1');
    expect(placement.entityType).toBe(EntityType.CHARACTER);
    expect(placement.position?.x).toBe(2);
    expect(placement.position?.z).toBe(3);
    expect(placement.blocksMovement).toBe(true);
    expect(placement.blocksLineOfSight).toBe(false);
    expect(placement.$typeName).toBe('dnd5e.api.v1alpha1.EntityPlacement');
  });

  it('sets visualType to monsterType for monster entities', () => {
    const entity = createMonsterEntityState({
      entityId: 'mob-1',
      monsterType: MonsterType.GOBLIN,
    });

    const placement = entityStateToPlacement(entity);

    expect(placement.visualType.case).toBe('monsterType');
    expect(placement.visualType.value).toBe(MonsterType.GOBLIN);
  });

  it('leaves visualType undefined for character entities', () => {
    const entity = createEntityState({ entityType: EntityType.CHARACTER });

    const placement = entityStateToPlacement(entity);

    expect(placement.visualType.case).toBeUndefined();
  });

  it('preserves size from entity state', () => {
    const entity = createEntityState({ entityType: EntityType.CHARACTER });

    const placement = entityStateToPlacement(entity);

    expect(placement.size).toBe(EntitySize.MEDIUM);
  });
});

// ---------------------------------------------------------------------------
// roomFromEncounterState
// ---------------------------------------------------------------------------

describe('roomFromEncounterState', () => {
  it('returns undefined when currentRoomId has no matching room', () => {
    const data = createEncounterStateData({
      currentRoomId: 'missing-room',
      rooms: {},
    });

    expect(roomFromEncounterState(data)).toBeUndefined();
  });

  it('returns room with correct fields from RoomLayout', () => {
    const layout = createRoomLayout({
      id: 'room-1',
      width: 8,
      height: 6,
      originX: 0,
      originZ: 0,
    });
    const data = createEncounterStateData({
      currentRoomId: 'room-1',
      rooms: { 'room-1': layout },
    });

    const room = roomFromEncounterState(data);

    expect(room).not.toBeUndefined();
    expect(room!.id).toBe('room-1');
    expect(room!.width).toBe(8);
    expect(room!.height).toBe(6);
  });

  it('preserves origin from RoomLayout', () => {
    const layout = createRoomLayout({
      id: 'room-1',
      originX: 4,
      originZ: 3,
    });
    const data = createEncounterStateData({
      currentRoomId: 'room-1',
      rooms: { 'room-1': layout },
    });

    const room = roomFromEncounterState(data);

    expect(room!.origin?.x).toBe(4);
    expect(room!.origin?.z).toBe(3);
  });

  it('filters entities to only those in the current room', () => {
    const layout = createRoomLayout({ id: 'room-1' });
    const charInRoom = createEntityState({
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      roomId: 'room-1',
    });
    const mobInOtherRoom = createEntityState({
      entityId: 'mob-1',
      entityType: EntityType.MONSTER,
      roomId: 'room-2',
    });

    const data = createEncounterStateData({
      currentRoomId: 'room-1',
      rooms: { 'room-1': layout },
      entities: {
        'char-1': charInRoom,
        'mob-1': mobInOtherRoom,
      },
    });

    const room = roomFromEncounterState(data);

    expect(Object.keys(room!.entities)).toHaveLength(1);
    expect(room!.entities['char-1']).toBeDefined();
    expect(room!.entities['mob-1']).toBeUndefined();
  });

  it('returns empty entities object when no entities belong to current room', () => {
    const layout = createRoomLayout({ id: 'room-1' });
    const data = createEncounterStateData({
      currentRoomId: 'room-1',
      rooms: { 'room-1': layout },
      entities: {},
    });

    const room = roomFromEncounterState(data);

    expect(room!.entities).toBeDefined();
    expect(Object.keys(room!.entities)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// allRoomsFromEncounterState
// ---------------------------------------------------------------------------

describe('allRoomsFromEncounterState', () => {
  it('returns empty array when snapshot has no rooms', () => {
    const data = createEncounterStateData({
      currentRoomId: '',
      rooms: {},
    });

    expect(allRoomsFromEncounterState(data)).toHaveLength(0);
  });

  it('returns single room when snapshot has one room', () => {
    const layout = createRoomLayout({ id: 'room-1', width: 5, height: 5 });
    const data = createEncounterStateData({
      currentRoomId: 'room-1',
      rooms: { 'room-1': layout },
    });

    const rooms = allRoomsFromEncounterState(data);

    expect(rooms).toHaveLength(1);
    expect(rooms[0].id).toBe('room-1');
  });

  it('returns all rooms when snapshot has 2 rooms', () => {
    const room1Layout = createRoomLayout({ id: 'room-1', width: 5, height: 5 });
    const room2Layout = createRoomLayout({
      id: 'room-2',
      width: 4,
      height: 4,
      originX: 0,
      originZ: 6,
    });
    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: {
        'room-1': room1Layout,
        'room-2': room2Layout,
      },
    });

    const rooms = allRoomsFromEncounterState(data);

    expect(rooms).toHaveLength(2);
    const ids = rooms.map((r) => r.id);
    expect(ids).toContain('room-1');
    expect(ids).toContain('room-2');
  });

  it('places non-current rooms first, current room last', () => {
    const room1Layout = createRoomLayout({ id: 'room-1' });
    const room2Layout = createRoomLayout({ id: 'room-2', originZ: 6 });
    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: {
        'room-1': room1Layout,
        'room-2': room2Layout,
      },
    });

    const rooms = allRoomsFromEncounterState(data);

    // Current room ('room-2') must be last
    expect(rooms[rooms.length - 1].id).toBe('room-2');
    // Non-current room ('room-1') must come first
    expect(rooms[0].id).toBe('room-1');
  });

  it('each room has correct origin from its RoomLayout', () => {
    const room1Layout = createRoomLayout({
      id: 'room-1',
      originX: 0,
      originZ: 0,
    });
    const room2Layout = createRoomLayout({
      id: 'room-2',
      originX: 0,
      originZ: 17,
    });
    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: {
        'room-1': room1Layout,
        'room-2': room2Layout,
      },
    });

    const rooms = allRoomsFromEncounterState(data);
    const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));

    expect(byId['room-1'].origin?.x).toBe(0);
    expect(byId['room-1'].origin?.z).toBe(0);
    expect(byId['room-2'].origin?.z).toBe(17);
  });

  it('filters entities per room by roomId', () => {
    const room1Layout = createRoomLayout({ id: 'room-1' });
    const room2Layout = createRoomLayout({ id: 'room-2', originZ: 6 });
    const charInRoom1 = createEntityState({
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      roomId: 'room-1',
    });
    const mobInRoom2 = createMonsterEntityState({
      entityId: 'mob-1',
      roomId: 'room-2',
    });

    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: {
        'room-1': room1Layout,
        'room-2': room2Layout,
      },
      entities: {
        'char-1': charInRoom1,
        'mob-1': mobInRoom2,
      },
    });

    const rooms = allRoomsFromEncounterState(data);
    const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));

    expect(Object.keys(byId['room-1'].entities)).toContain('char-1');
    expect(Object.keys(byId['room-1'].entities)).not.toContain('mob-1');
    expect(Object.keys(byId['room-2'].entities)).toContain('mob-1');
    expect(Object.keys(byId['room-2'].entities)).not.toContain('char-1');
  });

  it('returns empty entities object for rooms with no entities', () => {
    const room1Layout = createRoomLayout({ id: 'room-1' });
    const data = createEncounterStateData({
      currentRoomId: 'room-1',
      rooms: { 'room-1': room1Layout },
      entities: {},
    });

    const rooms = allRoomsFromEncounterState(data);

    expect(rooms[0].entities).toBeDefined();
    expect(Object.keys(rooms[0].entities)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// doorsFromEncounterState
// ---------------------------------------------------------------------------

describe('doorsFromEncounterState', () => {
  it('returns empty array when no doors in snapshot', () => {
    const data = createEncounterStateData({ doors: {} });

    expect(doorsFromEncounterState(data)).toHaveLength(0);
  });

  it('returns all doors from snapshot', () => {
    const door1 = create(DoorInfoSchema, {
      connectionId: 'conn-a',
      isOpen: false,
    });
    const door2 = create(DoorInfoSchema, {
      connectionId: 'conn-b',
      isOpen: true,
    });

    const data = createEncounterStateData({
      doors: { 'conn-a': door1, 'conn-b': door2 },
    });

    const doors = doorsFromEncounterState(data);

    expect(doors).toHaveLength(2);
    const connIds = doors.map((d) => d.connectionId);
    expect(connIds).toContain('conn-a');
    expect(connIds).toContain('conn-b');
  });

  it('preserves door open/closed state', () => {
    const openDoor = create(DoorInfoSchema, {
      connectionId: 'conn-open',
      isOpen: true,
    });
    const data = createEncounterStateData({
      doors: { 'conn-open': openDoor },
    });

    const [door] = doorsFromEncounterState(data);

    expect(door.isOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: allRoomsFromEncounterState -> mergeRoom (integration)
// ---------------------------------------------------------------------------

describe('full pipeline: allRoomsFromEncounterState + mergeRoom', () => {
  it('both rooms contribute floor tiles to the dungeon map', () => {
    const room1Layout = createRoomLayout({
      id: 'room-1',
      width: 5,
      height: 4,
      originX: 0,
      originZ: 0,
    });
    const room2Layout = createRoomLayout({
      id: 'room-2',
      width: 4,
      height: 4,
      originX: 0,
      originZ: 6,
    });
    const charInRoom1 = createEntityState({
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      roomId: 'room-1',
      x: 1,
      z: 0,
    });
    const mobInRoom2 = createMonsterEntityState({
      entityId: 'mob-1',
      roomId: 'room-2',
      x: 1,
      z: 7,
    });

    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: {
        'room-1': room1Layout,
        'room-2': room2Layout,
      },
      entities: {
        'char-1': charInRoom1,
        'mob-1': mobInRoom2,
      },
    });

    // Extract rooms and merge them into a dungeon map
    const rooms = allRoomsFromEncounterState(data);
    let dungeonMap = createEmptyState();
    for (const room of rooms) {
      dungeonMap = mergeRoom(dungeonMap, room, []);
    }

    // Total tile count should be room1 (5*4=20) + room2 (4*4=16) = 36
    expect(dungeonMap.floorTiles.size).toBe(36);
  });

  it('room2 tiles start at the correct z offset', () => {
    const room1Layout = createRoomLayout({
      id: 'room-1',
      width: 5,
      height: 4,
      originX: 0,
      originZ: 0,
    });
    const room2Layout = createRoomLayout({
      id: 'room-2',
      width: 4,
      height: 4,
      originX: 0,
      originZ: 17,
    });

    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: {
        'room-1': room1Layout,
        'room-2': room2Layout,
      },
    });

    const rooms = allRoomsFromEncounterState(data);
    let dungeonMap = createEmptyState();
    for (const room of rooms) {
      dungeonMap = mergeRoom(dungeonMap, room, []);
    }

    // room2 starts at z=17, so its first tile should be at (0, -17, 17)
    expect(dungeonMap.floorTiles.has('0,-17,17')).toBe(true);

    // room1 tiles should still be at z=0
    expect(dungeonMap.floorTiles.has('0,0,0')).toBe(true);
  });

  it('total tile count equals room1.width*height + room2.width*height', () => {
    const r1w = 6;
    const r1h = 5;
    const r2w = 4;
    const r2h = 3;

    const room1Layout = createRoomLayout({
      id: 'room-1',
      width: r1w,
      height: r1h,
    });
    const room2Layout = createRoomLayout({
      id: 'room-2',
      width: r2w,
      height: r2h,
      originZ: 10,
    });

    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: { 'room-1': room1Layout, 'room-2': room2Layout },
    });

    const rooms = allRoomsFromEncounterState(data);
    let dungeonMap = createEmptyState();
    for (const room of rooms) {
      dungeonMap = mergeRoom(dungeonMap, room, []);
    }

    expect(dungeonMap.floorTiles.size).toBe(r1w * r1h + r2w * r2h);
  });

  it('entities are placed in correct rooms after pipeline', () => {
    const room1Layout = createRoomLayout({ id: 'room-1', width: 5, height: 4 });
    const room2Layout = createRoomLayout({
      id: 'room-2',
      width: 4,
      height: 4,
      originZ: 6,
    });

    const charInRoom1 = createEntityState({
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      roomId: 'room-1',
      x: 2,
      z: 1,
    });
    const mobInRoom2 = createMonsterEntityState({
      entityId: 'mob-1',
      roomId: 'room-2',
      x: 1,
      z: 7,
    });

    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: { 'room-1': room1Layout, 'room-2': room2Layout },
      entities: { 'char-1': charInRoom1, 'mob-1': mobInRoom2 },
    });

    const rooms = allRoomsFromEncounterState(data);
    let dungeonMap = createEmptyState();
    for (const room of rooms) {
      dungeonMap = mergeRoom(dungeonMap, room, []);
    }

    // Both entities should be in the dungeon map
    expect(dungeonMap.entities.has('char-1')).toBe(true);
    expect(dungeonMap.entities.has('mob-1')).toBe(true);
    expect(dungeonMap.entities.size).toBe(2);

    // char-1 should be at room-1 position
    expect(dungeonMap.entities.get('char-1')?.position?.x).toBe(2);
    expect(dungeonMap.entities.get('char-1')?.position?.z).toBe(1);

    // mob-1 should be at room-2 position
    expect(dungeonMap.entities.get('mob-1')?.position?.z).toBe(7);
  });

  it('floor tiles satisfy cube coordinate invariant x + y + z = 0 for both rooms', () => {
    const room1Layout = createRoomLayout({
      id: 'room-1',
      width: 3,
      height: 3,
      originX: 0,
      originZ: 0,
    });
    const room2Layout = createRoomLayout({
      id: 'room-2',
      width: 3,
      height: 3,
      originX: 0,
      originZ: 4,
    });

    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: { 'room-1': room1Layout, 'room-2': room2Layout },
    });

    const rooms = allRoomsFromEncounterState(data);

    // Verify invariant holds for all tiles generated by the rooms
    for (const room of rooms) {
      const tiles = generateFloorTiles(room);
      for (const tile of tiles) {
        expect(tile.x + tile.y + tile.z).toBe(0);
      }
    }
  });

  it('current room becomes the active room in dungeon map after processing all rooms', () => {
    const room1Layout = createRoomLayout({ id: 'room-1' });
    const room2Layout = createRoomLayout({ id: 'room-2', originZ: 6 });

    const data = createEncounterStateData({
      currentRoomId: 'room-2',
      rooms: { 'room-1': room1Layout, 'room-2': room2Layout },
    });

    const rooms = allRoomsFromEncounterState(data);
    let dungeonMap = createEmptyState();
    for (const room of rooms) {
      dungeonMap = mergeRoom(dungeonMap, room, []);
    }

    // mergeRoom sets currentRoomId to the last-processed room,
    // which is always the current room since allRoomsFromEncounterState
    // places it last
    expect(dungeonMap.currentRoomId).toBe('room-2');
    expect(dungeonMap.revealedRoomIds.has('room-1')).toBe(true);
    expect(dungeonMap.revealedRoomIds.has('room-2')).toBe(true);
  });
});
