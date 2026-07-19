import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { buildDungeonWallSegments, edgePieceKind } from './syntyHexWallHelpers';

describe('edgePieceKind', () => {
  it('maps DOOR_CLOSED and DOOR_OPEN to "door"', () => {
    expect(edgePieceKind(WallKind.DOOR_CLOSED)).toBe('door');
    expect(edgePieceKind(WallKind.DOOR_OPEN)).toBe('door');
  });

  it('maps SOLID, UNSPECIFIED, and WINDOW to "wall" (no window piece yet)', () => {
    expect(edgePieceKind(WallKind.SOLID)).toBe('wall');
    expect(edgePieceKind(WallKind.UNSPECIFIED)).toBe('wall');
    expect(edgePieceKind(WallKind.WINDOW)).toBe('wall');
  });
});

function wall(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  kind: WallKind = WallKind.SOLID
): Wall {
  return { from, to, kind } as unknown as Wall;
}

describe('buildDungeonWallSegments', () => {
  it('returns [] for an empty wall list', () => {
    expect(buildDungeonWallSegments([], 1)).toEqual([]);
  });

  it('produces 6 segments for a single isolated wall hex (every edge faces open space)', () => {
    // Matches real server data verified live: every Wall the server emits
    // today is single-cell (from === to). An isolated wall hex with no
    // wall neighbors should get a piece on all 6 of its edges.
    const walls = [wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })];
    const segments = buildDungeonWallSegments(walls, 1);
    expect(segments).toHaveLength(6);
    expect(segments.every((s) => s.kind === WallKind.SOLID)).toBe(true);
  });

  it('does not render an edge between two ADJACENT wall hexes (interior edge)', () => {
    // Two wall hexes that are neighbors of each other: (0,0,0) and its E
    // neighbor (1,-1,0). The shared edge between them should be skipped —
    // it's interior to the wall mass, not a boundary.
    const walls = [
      wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      wall({ x: 1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }),
    ];
    const segments = buildDungeonWallSegments(walls, 1);
    // Each hex has 6 edges, 1 is shared/interior -> 5 open edges each = 10.
    expect(segments).toHaveLength(10);
    // No segment should connect (0,0,0) and (1,-1,0) in either direction.
    const keys = segments.map((s) => s.key);
    expect(keys).not.toContain('0,0,0->1,-1,0');
    expect(keys).not.toContain('1,-1,0->0,0,0');
  });

  it('assigns each segment the WallKind of the Wall object its hex came from', () => {
    const walls = [
      wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, WallKind.DOOR_CLOSED),
    ];
    const segments = buildDungeonWallSegments(walls, 1);
    expect(segments.every((s) => s.kind === WallKind.DOOR_CLOSED)).toBe(true);
  });

  it('decomposes a hypothetical multi-hex wall via getHexLine before building segments', () => {
    // Not observed in real data (every wall today is single-cell), but the
    // API contract allows a multi-hex from/to — this should still work.
    const walls = [wall({ x: 0, y: 0, z: 0 }, { x: 2, y: -2, z: 0 })];
    const segments = buildDungeonWallSegments(walls, 1);
    // 3 hexes in a straight line; each end hex has 1 in-line wall
    // neighbor (5 open edges), the middle hex has 2 (4 open edges) ->
    // 5 + 4 + 5 = 14.
    expect(segments).toHaveLength(14);
  });

  it('scales edge geometry with hexSize', () => {
    const walls = [wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })];
    const unit = buildDungeonWallSegments(walls, 1)[0]!;
    const doubled = buildDungeonWallSegments(walls, 2).find(
      (s) => s.key === unit.key
    )!;
    expect(doubled.edge.a.x).toBeCloseTo(unit.edge.a.x * 2, 3);
  });
});
