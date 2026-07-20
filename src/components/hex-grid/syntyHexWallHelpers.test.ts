import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { coordToKey, HEX_DIRECTIONS } from './hexMath';
import {
  buildDungeonWallSegments,
  classifyWallVertices,
  edgePieceKind,
  FITTINGS,
  fittingScale,
  selectWallVariant,
  WALL_VARIANTS,
  wallEndEdgeKeys,
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

describe('classifyWallVertices', () => {
  it('caps an isolated single wall hex with 6 outer corners (defect #2)', () => {
    // No wall neighbors at all -> every one of its 6 corners has exactly
    // 1-of-3 touching hexes as a wall (itself) -> all 6 are
    // wall-corner-outer, turning the "rubble ring" hex into a mitered
    // hex kiosk.
    const walls = [wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })];
    const fittings = classifyWallVertices(walls, 1);
    expect(fittings).toHaveLength(6);
    expect(fittings.every((f) => f.kind === 'wall-corner-outer')).toBe(true);
    // Every fitting's position should be exactly 1 hex-radius from origin
    // (a hex corner at hexSize 1) and every rotation a finite number.
    for (const f of fittings) {
      const dist = Math.hypot(f.position.x, f.position.z);
      expect(dist).toBeCloseTo(1, 5);
      expect(Number.isFinite(f.rotationY)).toBe(true);
    }
  });

  it('classifies a straight 3-hex run: middle (straight-through) hex contributes nothing of its own', () => {
    // H0 -(E)- H1 -(E)- H2, all collinear/all walls. H1 has exactly 2 wall
    // neighbors in OPPOSITE directions (E and W) -- a "straight-through"
    // hex per the #536 phase-2 QA fix -- so its own 2 tip vertices
    // (touching only H1) are skipped entirely. H0/H2 (degree 1, true ends)
    // are unaffected: each still contributes its own 4 outer corners, and
    // the vertices they SHARE with H1 still get an inner corner (H1 being
    // disqualified doesn't disqualify a vertex where the OTHER touching
    // hex, H0 or H2, still qualifies). Hand-verified: 4+4 = 8 outer
    // (H1's 2 own tips removed from the pre-fix 10), 2+2 = 4 inner
    // (unchanged) = 12 total (down from the unqualified rule's 14).
    const walls = [
      wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      wall({ x: 1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }),
      wall({ x: 2, y: -2, z: 0 }, { x: 2, y: -2, z: 0 }),
    ];
    const fittings = classifyWallVertices(walls, 1);
    const outer = fittings.filter((f) => f.kind === 'wall-corner-outer');
    const inner = fittings.filter((f) => f.kind === 'wall-corner-inner');
    expect(outer).toHaveLength(8);
    expect(inner).toHaveLength(4);
    expect(fittings).toHaveLength(12);
    // None of the fittings touch ONLY the middle hex (H1's own tip
    // vertices must be the ones removed, not e.g. the shared ones).
    const h1OnlyKey = '1,-1,0';
    expect(
      fittings.filter(
        (f) =>
          f.key.split('|').includes(h1OnlyKey) &&
          !f.key.includes('0,0,0') &&
          !f.key.includes('2,-2,0')
      )
    ).toHaveLength(0);
    // Vertex keys are unique (no double-placement of the same fitting).
    expect(new Set(fittings.map((f) => f.key)).size).toBe(fittings.length);
  });

  it('a longer straight run adds NO additional fittings in its interior (density stays flat, not linear)', () => {
    // 6-hex straight run: only the 2 ends (degree 1) and the 2 vertices
    // each shares with its immediate straight-through neighbor contribute
    // anything; every interior straight-through hex (degree 2, opposite
    // neighbors) -- including boundaries BETWEEN two straight-through
    // hexes -- contributes nothing. Total should match the 3-hex run's 12
    // exactly, regardless of how many extra straight hexes sit in the
    // middle -- this is the core of the #536 phase-2 QA fix (corner
    // fittings were "cluttering entire wall boundaries" because the old
    // per-vertex-only rule scaled linearly with run length).
    const walls = Array.from({ length: 6 }, (_, i) =>
      wall({ x: i, y: -i, z: 0 }, { x: i, y: -i, z: 0 })
    );
    const fittings = classifyWallVertices(walls, 1);
    expect(fittings).toHaveLength(12);
  });

  it('classifies a 60-degree turn: the bend hex has no skipped corners, mixing outer and inner', () => {
    // H0 -(E)- H1 -(NE)- H2: direction changes by 60 degrees at H1. H1's
    // two wall-neighbor directions (W and NE) are never the SAME
    // consecutive corner-pair, so every one of H1's 6 corners gets
    // classified (none skipped) -- hand-verified as 2 outer (H1's own
    // "short way" tips) + 4 inner (2 shared with H0, 2 shared with H2).
    const h1Key = '1,-1,0';
    const walls = [
      wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      wall({ x: 1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }),
      wall({ x: 2, y: -1, z: -1 }, { x: 2, y: -1, z: -1 }),
    ];
    const fittings = classifyWallVertices(walls, 1);
    const touchingH1 = fittings.filter((f) => f.key.split('|').includes(h1Key));
    // H1 is wall for every one of its own 6 corners (0 skipped), so all 6
    // corners are classified as touching H1 in some fitting.
    expect(touchingH1).toHaveLength(6);
    expect(
      touchingH1.filter((f) => f.kind === 'wall-corner-outer')
    ).toHaveLength(2);
    expect(
      touchingH1.filter((f) => f.kind === 'wall-corner-inner')
    ).toHaveLength(4);
  });

  it('skips a fully-enclosed vertex (3 of 3 touching hexes are walls)', () => {
    // A "flower": a center hex plus its full ring of 6, all marked wall.
    // Every corner of the CENTER hex touches {center, ring[i], ring[i+1]}
    // -- all 3 are walls, so none of the center's 6 corners should ever
    // appear as a classified fitting (fully buried inside the mass).
    const center = { x: 0, y: 0, z: 0 };
    const ring = HEX_DIRECTIONS.map((d) => ({
      x: center.x + d.x,
      y: center.y + d.y,
      z: center.z + d.z,
    }));
    const walls = [center, ...ring].map((c) => wall(c, c));
    const fittings = classifyWallVertices(walls, 1);

    const centerKey = coordToKey(center);
    for (let i = 0; i < HEX_DIRECTIONS.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % HEX_DIRECTIONS.length]!;
      const enclosedVertexKey = [centerKey, coordToKey(a), coordToKey(b)]
        .sort()
        .join('|');
      expect(fittings.some((f) => f.key === enclosedVertexKey)).toBe(false);
    }
    // Sanity: the flower still has plenty of boundary fittings around its
    // outer edge (not an empty result).
    expect(fittings.length).toBeGreaterThan(0);
  });
});

describe('wallEndEdgeKeys', () => {
  it('returns no end keys for an isolated wall hex (defect #2 handles it via corners alone)', () => {
    const walls = [wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })];
    expect(wallEndEdgeKeys(walls).size).toBe(0);
  });

  it("caps both ends of a 2-hex stub, one on each hex's far side", () => {
    const walls = [
      wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      wall({ x: 1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }),
    ];
    const endKeys = wallEndEdgeKeys(walls);
    expect(endKeys.size).toBe(2);
    // H0's only wall neighbor is E (H1); its far side is W.
    expect(endKeys.has('0,0,0->-1,1,0')).toBe(true);
    // H1's only wall neighbor is W (H0); its far side is E.
    expect(endKeys.has('1,-1,0->2,-2,0')).toBe(true);
  });

  it('does not mark the middle hex of a straight 3-hex run as an end (degree 2)', () => {
    const walls = [
      wall({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      wall({ x: 1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }),
      wall({ x: 2, y: -2, z: 0 }, { x: 2, y: -2, z: 0 }),
    ];
    const endKeys = wallEndEdgeKeys(walls);
    // Only the two true termini (H0, H2) get an end cap.
    expect(endKeys.size).toBe(2);
    expect(endKeys.has('0,0,0->-1,1,0')).toBe(true);
    expect(endKeys.has('2,-2,0->3,-3,0')).toBe(true);
    for (const key of endKeys) {
      expect(key.startsWith('1,-1,0->')).toBe(false);
    }
  });
});

describe('fittingScale', () => {
  it("scales X/Z by each variant's own raw width/depth (not a flat SYNTY_SCALE) so the footprint reads as slim, not a dominant slab", () => {
    // QA correction (#536 phase-2 review): the old flat SYNTY_SCALE (0.75)
    // rendered wall-corner-outer's ~0.83 raw footprint to ~0.62 -- nearly
    // double the wall segments' own ~0.327 rendered thickness. The fix
    // should land close to that thickness instead.
    const outer = FITTINGS['wall-corner-outer'];
    const [sx, sy, sz] = fittingScale(outer, 0.8);
    expect(sx).toBeCloseTo(outer.rawWidth * 0.4, 5);
    expect(sz).toBeCloseTo(outer.rawDepth * 0.4, 5);
    expect(sy).toBeCloseTo(0.8 / outer.rawHeight, 5);
    // The rendered footprint (~0.33) should be in the same order of
    // magnitude as the wall's own rendered thickness (~0.327 = 0.4357 raw *
    // 0.75 SYNTY_SCALE), not nearly double it like the old flat scale was.
    const wallRenderedThickness = 0.4357 * 0.75;
    expect(Math.abs(sx - wallRenderedThickness)).toBeLessThan(0.15);
  });

  it("uses each variant's own dims, not a shared constant (inner is chunkier than outer/end)", () => {
    const [outerSx] = fittingScale(FITTINGS['wall-corner-outer'], 0.8);
    const [innerSx] = fittingScale(FITTINGS['wall-corner-inner'], 0.8);
    expect(innerSx).toBeGreaterThan(outerSx);
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
