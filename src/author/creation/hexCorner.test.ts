import { describe, expect, it } from 'vitest';
import { BOARD_HEX_SIZE, cellCenter, cellCorners } from '../hexLayout';
import {
  canonicalCorner,
  cornerOwners,
  cornerPoint,
  migrateLegacyCenterEndpoint,
  nearestCorner,
  sameCorner,
  type CornerRef,
} from './hexCorner';

const GRID = { width: 20, height: 30 };

describe('cornerOwners — every interior corner is shared by exactly 3 cells', () => {
  // Verified directly (not assumed): corner 0 of (5,5) is also corner 2
  // of (6,6) and corner 4 of (6,5) — all three resolve to the identical
  // world point.
  it('finds all 3 owners of an interior corner, all at the same world point', () => {
    const owners = cornerOwners({ cell: [5, 5], corner: 0 });
    expect(owners).toHaveLength(3);
    expect(owners).toEqual(
      expect.arrayContaining([
        { cell: [5, 5], corner: 0 },
        { cell: [6, 6], corner: 2 },
        { cell: [6, 5], corner: 4 },
      ])
    );
    const points = owners.map((o) => cornerPoint(o));
    for (const p of points) {
      expect(p.x).toBeCloseTo(points[0].x, 6);
      expect(p.y).toBeCloseTo(points[0].y, 6);
    }
  });

  it('finds all 3 owners of a different interior corner (corner 1 of (5,5))', () => {
    const owners = cornerOwners({ cell: [5, 5], corner: 1 });
    expect(owners).toEqual(
      expect.arrayContaining([
        { cell: [5, 5], corner: 1 },
        { cell: [6, 5], corner: 3 },
        { cell: [5, 4], corner: 5 },
      ])
    );
    expect(owners).toHaveLength(3);
  });

  it('a canvas-corner vertex (0,0) has fewer owners once negative-cell candidates are excluded', () => {
    // corner 3 of (0,0)'s true geometric co-owners are (-1,-1) and
    // (-1,0) — both off-grid (negative column). Only (0,0) itself
    // survives the col>=0/row>=0 filter.
    const owners = cornerOwners({ cell: [0, 0], corner: 3 });
    expect(owners).toEqual([{ cell: [0, 0], corner: 3 }]);
  });

  it('a canvas-edge vertex still finds its one valid in-grid co-owner', () => {
    // corner 0 of (0,0)'s owners are (0,0)#0, (1,0)#2, (1,-1)#4 — the
    // last is off-grid, the other two are real in-grid co-owners.
    const owners = cornerOwners({ cell: [0, 0], corner: 0 });
    expect(owners).toEqual(
      expect.arrayContaining([
        { cell: [0, 0], corner: 0 },
        { cell: [1, 0], corner: 2 },
      ])
    );
    expect(owners).toHaveLength(2);
  });
});

describe('canonicalCorner — deterministic single owner, smallest [col,row] wins', () => {
  it('picks the smallest-column owner when columns differ', () => {
    // (5,5)#0's owners are (5,5), (6,6), (6,5) — column 5 beats column 6.
    expect(canonicalCorner({ cell: [5, 5], corner: 0 })).toEqual({
      cell: [5, 5],
      corner: 0,
    });
  });

  it('picks the smallest-row owner when columns tie', () => {
    // (5,5)#1's owners are (5,5) col5/row5, (6,5) col6, (5,4) col5/row4.
    // Two candidates tie on column 5; row 4 beats row 5 — so the
    // "obvious" owner (the cell you drew from) is NOT always canonical.
    expect(canonicalCorner({ cell: [5, 5], corner: 1 })).toEqual({
      cell: [5, 4],
      corner: 5,
    });
  });

  it('every owner of the same vertex canonicalizes to the identical answer', () => {
    const owners = cornerOwners({ cell: [5, 5], corner: 1 });
    const canonical = owners.map((o) => canonicalCorner(o));
    for (const c of canonical) {
      expect(c).toEqual(canonical[0]);
    }
  });

  it('a canvas-boundary vertex with no valid alternate owner canonicalizes to itself', () => {
    expect(canonicalCorner({ cell: [0, 0], corner: 3 })).toEqual({
      cell: [0, 0],
      corner: 3,
    });
  });
});

describe('sameCorner — identity across differently-chosen owners', () => {
  it('recognizes two different (cell,corner) pairs as the same physical vertex', () => {
    expect(
      sameCorner({ cell: [5, 5], corner: 1 }, { cell: [5, 4], corner: 5 })
    ).toBe(true);
    expect(
      sameCorner({ cell: [5, 5], corner: 1 }, { cell: [6, 5], corner: 3 })
    ).toBe(true);
  });

  it('rejects two genuinely different vertices', () => {
    expect(
      sameCorner({ cell: [5, 5], corner: 0 }, { cell: [5, 5], corner: 1 })
    ).toBe(false);
  });
});

describe('corner/L continuity — two lines sharing a corner resolve to the identical world point', () => {
  it('two independently-authored endpoints of the same vertex render at the same point', () => {
    // One wallLine's `to` drawn as (5,5)#1; a second wallLine's `from`
    // drawn from the OTHER side, as (6,5)#3 — both address the same real
    // corner, per sameCorner above. A renderer must place them at the
    // identical world point for the L-join to read as clean with zero
    // gap, exactly like the original cell-center design's "shared cell
    // center" guarantee, now at the finer corner lattice.
    const a: CornerRef = { cell: [5, 5], corner: 1 };
    const b: CornerRef = { cell: [6, 5], corner: 3 };
    expect(cornerPoint(a)).toEqual(cornerPoint(b));
  });
});

describe('nearestCorner — snapping a board-space point to the corner lattice', () => {
  it('snaps exactly onto a known corner point', () => {
    const target = cornerPoint({ cell: [5, 5], corner: 2 });
    const snapped = nearestCorner(target, GRID);
    expect(cornerPoint(snapped)).toEqual(target);
  });

  it('snaps a nearby-but-off point to the true nearest corner, not just the nearest cell’s own', () => {
    // A point just outside (5,5) toward its corner-1 neighbor (5,4) — the
    // true nearest corner is shared, but approaching from a slightly
    // different angle should still resolve to the SAME canonical vertex.
    const p = cornerPoint({ cell: [5, 5], corner: 1 });
    const nudged = { x: p.x + 0.3, y: p.y - 0.2 };
    const snapped = nearestCorner(nudged, GRID);
    expect(sameCorner(snapped, { cell: [5, 5], corner: 1 })).toBe(true);
  });

  it('clamps to the grid when the point is off-canvas', () => {
    const snapped = nearestCorner({ x: -5000, y: -5000 }, GRID);
    expect(snapped.cell[0]).toBeGreaterThanOrEqual(0);
    expect(snapped.cell[1]).toBeGreaterThanOrEqual(0);
    expect(snapped.cell[0]).toBeLessThan(GRID.width);
    expect(snapped.cell[1]).toBeLessThan(GRID.height);
  });
});

describe('migrateLegacyCenterEndpoint — self-healing the pre-corner-anchoring shape', () => {
  it('picks the corner of the cell closest to the other endpoint’s own position', () => {
    // Legacy line was cell-center [4,4] -> [6,1]. Migrating the [4,4] end
    // should pick whichever of (4,4)'s 6 corners sits nearest (6,1)'s
    // center — i.e. the corner facing the wall's own direction, not an
    // arbitrary one. The result is canonicalized, so the OWNER cell it
    // reports may not be [4,4] itself (see canonicalCorner's own "not
    // always the cell you drew from" finding above) — what must hold is
    // that the resolved WORLD POINT is (4,4)'s own nearest corner.
    const otherPoint = cellCenter(6, 1);
    const migrated = migrateLegacyCenterEndpoint([4, 4], otherPoint);
    const corners = cellCorners(cellCenter(4, 4), BOARD_HEX_SIZE);
    const chosen = cornerPoint(migrated);
    const distances = corners.map(
      (c) => (c[0] - otherPoint.x) ** 2 + (c[1] - otherPoint.y) ** 2
    );
    const chosenDist =
      (chosen.x - otherPoint.x) ** 2 + (chosen.y - otherPoint.y) ** 2;
    expect(chosenDist).toBeCloseTo(Math.min(...distances), 6);
    // And it must genuinely be one of (4,4)'s own corners (pre-canonical),
    // not some unrelated point.
    expect(
      corners.some((c) => Math.hypot(c[0] - chosen.x, c[1] - chosen.y) < 1e-6)
    ).toBe(true);
  });

  it('is already canonical (idempotent under canonicalCorner)', () => {
    const migrated = migrateLegacyCenterEndpoint([4, 4], cellCenter(6, 1));
    expect(canonicalCorner(migrated)).toEqual(migrated);
  });
});
