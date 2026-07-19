import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  buildDungeonWallSegments,
  edgePieceKind,
  selectWallVariant,
  WALL_VARIANTS,
  wallVariantScale,
} from './syntyHexWallHelpers';

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

describe('selectWallVariant', () => {
  it('is deterministic — the same edge key always returns the same variant', () => {
    const key = '0,0,0->1,-1,0';
    const first = selectWallVariant(key);
    for (let i = 0; i < 20; i++) {
      expect(selectWallVariant(key)).toBe(first);
    }
  });

  it('picks different variants for different edge keys — not always the same one', () => {
    // Enough distinct keys that hitting only one variant across all of
    // them would indicate a broken hash/weighting, not bad luck.
    const keys = Array.from(
      { length: 200 },
      (_, i) => `${i},0,${-i}->${i + 1},0,${-i - 1}`
    );
    const namesSeen = new Set(keys.map((k) => selectWallVariant(k).name));
    expect(namesSeen.size).toBeGreaterThan(1);
  });

  it('only ever returns a variant from WALL_VARIANTS', () => {
    const names = new Set(WALL_VARIANTS.map((v) => v.name));
    for (let i = 0; i < 50; i++) {
      expect(names.has(selectWallVariant(`edge-${i}`).name)).toBe(true);
    }
  });

  it('roughly follows the manifest weights across a large sample (plain:broken:alcove = 3:1:1)', () => {
    const counts: Record<string, number> = {};
    const sampleSize = 3000;
    for (let i = 0; i < sampleSize; i++) {
      const name = selectWallVariant(`sample-${i}`).name;
      counts[name] = (counts[name] ?? 0) + 1;
    }
    const totalWeight = WALL_VARIANTS.reduce((sum, v) => sum + v.weight, 0);
    for (const variant of WALL_VARIANTS) {
      const expected = (variant.weight / totalWeight) * sampleSize;
      // Generous tolerance — this is a distribution sanity check (hash
      // isn't badly skewed toward/away from any one variant), not a
      // precise statistical test.
      expect(counts[variant.name] ?? 0).toBeGreaterThan(expected * 0.5);
      expect(counts[variant.name] ?? 0).toBeLessThan(expected * 1.5);
    }
  });
});

describe('wallVariantScale', () => {
  it('squeezes width to exactly one hex edge and height to the game wall height', () => {
    const variant = WALL_VARIANTS[0]!; // plain: rawWidth 2.672, rawHeight 5.1022
    const [sx, sy, sz] = wallVariantScale(variant, 0.8, 0.75);
    expect(sx).toBeCloseTo(1 / 2.672, 5);
    expect(sy).toBeCloseTo(0.8 / 5.1022, 5);
    expect(sz).toBe(0.75);
  });

  it("uses each variant's own raw dimensions, not a shared constant", () => {
    const plain = WALL_VARIANTS.find((v) => v.name === 'plain')!;
    const broken = WALL_VARIANTS.find((v) => v.name === 'broken')!;
    const [plainSx] = wallVariantScale(plain, 0.8, 0.75);
    const [brokenSx] = wallVariantScale(broken, 0.8, 0.75);
    expect(plainSx).not.toBeCloseTo(brokenSx, 5);
  });
});
