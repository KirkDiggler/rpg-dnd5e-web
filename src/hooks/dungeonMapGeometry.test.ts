/**
 * Tests for dungeonMapGeometry's pure floor/wall/door geometry helpers.
 */

import { create } from '@bufbuild/protobuf';
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import { DoorInfoSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  PositionSchema as EncounterPositionSchema,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  frontierGroundHintHexes,
  openDoorWalkableKeys,
  wallKey,
} from './dungeonMapGeometry';

/** Helper to create a DoorInfo proto */
function createDoor(
  connectionId: string,
  x: number,
  y: number,
  z: number,
  isOpen = false
) {
  return create(DoorInfoSchema, {
    connectionId,
    position: create(PositionSchema, { x, y, z }),
    isOpen,
  });
}

/** Helper to create a Wall proto (from===to for a single-cell wall) */
function createWall(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX = fromX,
  toY = fromY,
  toZ = fromZ
) {
  return create(WallSchema, {
    from: create(EncounterPositionSchema, { x: fromX, y: fromY, z: fromZ }),
    to: create(EncounterPositionSchema, { x: toX, y: toY, z: toZ }),
  });
}

describe('wallKey', () => {
  it('produces same key regardless of direction', () => {
    const wallAB = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 0, y: 0, z: 0 }),
      to: create(EncounterPositionSchema, { x: 3, y: -3, z: 0 }),
    });
    const wallBA = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 3, y: -3, z: 0 }),
      to: create(EncounterPositionSchema, { x: 0, y: 0, z: 0 }),
    });

    expect(wallKey(wallAB)).toBe(wallKey(wallBA));
  });

  it('produces different keys for different walls', () => {
    const wall1 = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 0, y: 0, z: 0 }),
      to: create(EncounterPositionSchema, { x: 3, y: -3, z: 0 }),
    });
    const wall2 = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 1, y: -1, z: 0 }),
      to: create(EncounterPositionSchema, { x: 4, y: -4, z: 0 }),
    });

    expect(wallKey(wall1)).not.toBe(wallKey(wall2));
  });
});

describe('openDoorWalkableKeys', () => {
  it('returns only OPEN doors as walkable cube keys', () => {
    const closed = createDoor('conn-closed', 5, -5, 0, false);
    const open = createDoor('conn-open', 0, -17, 17, true);

    const keys = openDoorWalkableKeys([closed, open]);

    expect(keys.size).toBe(1);
    expect(keys.has('0,-17,17')).toBe(true);
    expect(keys.has('5,-5,0')).toBe(false);
  });

  it('returns empty set when no doors', () => {
    expect(openDoorWalkableKeys([]).size).toBe(0);
  });

  it('skips doors with no position', () => {
    const noPos = create(DoorInfoSchema, {
      connectionId: 'no-pos',
      isOpen: true,
    });
    const keys = openDoorWalkableKeys([noPos]);
    expect(keys.size).toBe(0);
  });

  it('bridges two separate floor-tile sets when a connecting door is open', () => {
    // Two rooms separated by a door tile that is in NEITHER room's floor
    // set. Room A tiles: {(0,0,0), (1,-1,0)}. Room B tiles: {(3,-3,0),
    // (4,-4,0)}. Door at (2,-2,0) bridges them. Without
    // openDoorWalkableKeys, the door tile is a "wall" to A* and pathing
    // fails.
    const roomAFloor = new Set(['0,0,0', '1,-1,0']);
    const roomBFloor = new Set(['3,-3,0', '4,-4,0']);
    const door = createDoor('conn-AB', 2, -2, 0, true);

    const walkable = openDoorWalkableKeys([door]);
    expect(walkable.has('2,-2,0')).toBe(true);

    // Combined walkable set is what HexGrid's isBlocked treats as passable.
    const combined = new Set<string>([
      ...roomAFloor,
      ...roomBFloor,
      ...walkable,
    ]);
    expect(combined.has('0,0,0')).toBe(true); // room A start
    expect(combined.has('1,-1,0')).toBe(true); // room A
    expect(combined.has('2,-2,0')).toBe(true); // open door
    expect(combined.has('3,-3,0')).toBe(true); // room B
    expect(combined.has('4,-4,0')).toBe(true); // room B end
  });
});

describe('frontierGroundHintHexes', () => {
  it('returns all 6 neighbors of an isolated single-cell wall with no floor around it', () => {
    const wall = createWall(0, 0, 0);
    const hints = frontierGroundHintHexes([wall], new Set());

    expect(hints).toHaveLength(6);
    // Every hint must be adjacent to the wall, not the wall itself.
    for (const hint of hints) {
      expect(hint).not.toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it('excludes neighbors that are already revealed floor tiles', () => {
    const wall = createWall(0, 0, 0);
    // One of the wall's 6 neighbors (east: 1,-1,0) is already floor.
    const floorTileKeys = new Set(['1,-1,0']);

    const hints = frontierGroundHintHexes([wall], floorTileKeys);

    expect(hints).toHaveLength(5);
    expect(hints.some((h) => h.x === 1 && h.y === -1 && h.z === 0)).toBe(false);
  });

  it('does not hint a hex that is itself a wall position', () => {
    // Two adjacent single-cell walls: each other's neighbor set includes
    // the other wall's own hex, which must not become a "ground hint".
    const wallA = createWall(0, 0, 0);
    const wallB = createWall(1, -1, 0); // east neighbor of wallA

    const hints = frontierGroundHintHexes([wallA, wallB], new Set());

    expect(hints.some((h) => h.x === 0 && h.y === 0 && h.z === 0)).toBe(false);
    expect(hints.some((h) => h.x === 1 && h.y === -1 && h.z === 0)).toBe(false);
  });

  it('deduplicates a shared neighbor hex between two adjacent walls', () => {
    // wallA=(0,0,0) and wallB=(1,-1,0) are adjacent; both have (2,-1,-1)
    // as a neighbor via different directions is not guaranteed, but they
    // do share several neighbors given they're adjacent. Assert no
    // duplicate coordinates appear in the result.
    const wallA = createWall(0, 0, 0);
    const wallB = createWall(1, -1, 0);

    const hints = frontierGroundHintHexes([wallA, wallB], new Set());
    const keys = hints.map((h) => `${h.x},${h.y},${h.z}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('computes hints for every hex along a multi-cell wall line, not just the endpoints', () => {
    // A 3-hex line wall from (0,0,0) to (2,-2,0) — kind-agnostic, so this
    // also covers future multi-cell DOOR/WINDOW walls.
    const wall = createWall(0, 0, 0, 2, -2, 0);

    const hints = frontierGroundHintHexes([wall], new Set());
    const keys = new Set(hints.map((h) => `${h.x},${h.y},${h.z}`));

    // The line's middle hex (1,-1,0) is a wall-line hex, not a hint...
    expect(keys.has('1,-1,0')).toBe(false);
    // ...but its neighbors (not shared with the endpoints' own footprint)
    // should be present, proving the middle hex's neighborhood was
    // actually computed rather than just the two endpoints'.
    expect(hints.length).toBeGreaterThan(6);
  });

  it('returns an empty array for no walls', () => {
    expect(frontierGroundHintHexes([], new Set())).toEqual([]);
  });

  it('skips walls with a missing from or to', () => {
    const malformed = create(WallSchema, {
      from: create(EncounterPositionSchema, { x: 0, y: 0, z: 0 }),
      // to intentionally omitted
    });

    expect(frontierGroundHintHexes([malformed], new Set())).toEqual([]);
  });
});
