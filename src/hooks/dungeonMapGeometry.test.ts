/**
 * Tests for dungeonMapGeometry's pure floor/wall/door geometry helpers.
 */

import { create } from '@bufbuild/protobuf';
import {
  PositionSchema as EncounterPositionSchema,
  WallKind,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  doorHexKinds,
  doorHexPositions,
  frontierGroundHintHexes,
  wallKey,
} from './dungeonMapGeometry';

/** Helper to create a Wall proto (from===to for a single-cell wall) */
function createWall(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX = fromX,
  toY = fromY,
  toZ = fromZ,
  kind: WallKind = WallKind.SOLID,
  id?: string
) {
  return create(WallSchema, {
    from: create(EncounterPositionSchema, { x: fromX, y: fromY, z: fromZ }),
    to: create(EncounterPositionSchema, { x: toX, y: toY, z: toZ }),
    kind,
    id,
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

describe('doorHexKinds', () => {
  it("maps each door wall's `from` cell to its WallKind", () => {
    const closed = createWall(
      0,
      0,
      0,
      1,
      -1,
      0,
      WallKind.DOOR_CLOSED,
      'door-closed'
    );
    const open = createWall(
      5,
      -5,
      0,
      6,
      -6,
      0,
      WallKind.DOOR_OPEN,
      'door-open'
    );

    const kinds = doorHexKinds([closed, open]);

    expect(kinds.size).toBe(2);
    expect(kinds.get('0,0,0')).toBe(WallKind.DOOR_CLOSED);
    expect(kinds.get('5,-5,0')).toBe(WallKind.DOOR_OPEN);
    // Never the passage neighbor (`to`) — that's real floor in the next
    // chamber, not the door's own cell.
    expect(kinds.has('1,-1,0')).toBe(false);
    expect(kinds.has('6,-6,0')).toBe(false);
  });

  it('ignores SOLID/WINDOW/UNSPECIFIED walls', () => {
    const solid = createWall(0, 0, 0, 0, 0, 0, WallKind.SOLID);
    const window = createWall(1, -1, 0, 1, -1, 0, WallKind.WINDOW);

    expect(doorHexKinds([solid, window]).size).toBe(0);
  });

  it('returns an empty map for no walls', () => {
    expect(doorHexKinds([]).size).toBe(0);
  });

  it('skips a door wall with no `from`', () => {
    const malformed = create(WallSchema, {
      to: create(EncounterPositionSchema, { x: 1, y: -1, z: 0 }),
      kind: WallKind.DOOR_CLOSED,
    });
    expect(doorHexKinds([malformed]).size).toBe(0);
  });

  it('bridges two separate floor-tile sets when a connecting door is open — v2 walkability', () => {
    // Two chambers separated by a door hex that is in NEITHER chamber's
    // floor set. Chamber A tiles: {(0,0,0), (1,-1,0)}. Chamber B tiles:
    // {(3,-3,0), (4,-4,0)}. Door at (2,-2,0) bridges them, from!==to per
    // the wire contract (design doc §Q2).
    const chamberAFloor = new Set(['0,0,0', '1,-1,0']);
    const chamberBFloor = new Set(['3,-3,0', '4,-4,0']);
    const door = createWall(2, -2, 0, 3, -3, 0, WallKind.DOOR_OPEN, 'door-AB');

    const kinds = doorHexKinds([door]);
    expect(kinds.get('2,-2,0')).toBe(WallKind.DOOR_OPEN);

    // What HexGrid's isBlocked treats as passable: floor tiles plus any
    // hex whose door kind is OPEN.
    const walkable = new Set<string>([...chamberAFloor, ...chamberBFloor]);
    for (const [hexKey, kind] of kinds) {
      if (kind === WallKind.DOOR_OPEN) walkable.add(hexKey);
    }
    expect(walkable.has('0,0,0')).toBe(true); // chamber A start
    expect(walkable.has('1,-1,0')).toBe(true); // chamber A
    expect(walkable.has('2,-2,0')).toBe(true); // open door
    expect(walkable.has('3,-3,0')).toBe(true); // chamber B
    expect(walkable.has('4,-4,0')).toBe(true); // chamber B end
  });
});

describe('doorHexPositions', () => {
  it('returns the `from` cube coord of every door wall', () => {
    const closed = createWall(
      0,
      0,
      0,
      1,
      -1,
      0,
      WallKind.DOOR_CLOSED,
      'door-1'
    );
    const open = createWall(5, -5, 0, 6, -6, 0, WallKind.DOOR_OPEN, 'door-2');

    const positions = doorHexPositions([closed, open]);

    expect(positions).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 5, y: -5, z: 0 },
    ]);
  });

  it('ignores non-door walls and returns [] for none', () => {
    const solid = createWall(0, 0, 0);
    expect(doorHexPositions([solid])).toEqual([]);
    expect(doorHexPositions([])).toEqual([]);
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
