/**
 * hexCorner — corner-lattice addressing pins (#804). Adapted from the
 * pre-restart module's own test (`git show
 * 6503936^:src/author/creation/hexCorner.test.ts`): the owner counts and
 * canonicalization invariants are re-verified in the new axial +
 * orientation-aware frame, not carried over on trust. Expected owner
 * triples are hand-derived from `hexCorners`' own angle convention
 * (pointy: corner i at −30° + 60°·i, SVG y-down) — exact addresses, not
 * just counts, so a broken owner search cannot pass by finding the
 * wrong three cells.
 */
import { describe, expect, it } from 'vitest';
import { sameCell, type Axial } from '../hexOffset';
import { cellCenter, edgeSegment } from './canvasGeometry';
import {
  canonicalCorner,
  cellAtPoint,
  cornerKey,
  cornerNeighbors,
  cornerOwners,
  cornerPoint,
  latticeEdgeCells,
  nearestCorner,
  sameCorner,
  type CornerRef,
} from './hexCorner';

const SIZE = 24;
const a = (q: number, r: number): Axial => ({ q, r });

describe('cornerOwners — every interior corner is shared by exactly 3 cells', () => {
  it('finds all 3 owners of (0,0)#0 (pointy), all at the same point', () => {
    // Corner 0 of (0,0) sits at (√3/2, −1/2)·size. Its co-owners, by
    // the corner-angle convention: (1,0)#4 (210°) and (1,−1)#2 (90°).
    const owners = cornerOwners({ cell: a(0, 0), corner: 0 }, SIZE, 'pointy');
    expect(owners).toHaveLength(3);
    expect(owners).toEqual(
      expect.arrayContaining([
        { cell: a(0, 0), corner: 0 },
        { cell: a(1, 0), corner: 4 },
        { cell: a(1, -1), corner: 2 },
      ])
    );
    const points = owners.map((o) => cornerPoint(o, SIZE, 'pointy'));
    for (const p of points) {
      expect(p.x).toBeCloseTo(points[0].x, 8);
      expect(p.y).toBeCloseTo(points[0].y, 8);
    }
  });

  it('finds all 3 owners of (0,0)#1 (pointy)', () => {
    const owners = cornerOwners({ cell: a(0, 0), corner: 1 }, SIZE, 'pointy');
    expect(owners).toHaveLength(3);
    expect(owners).toEqual(
      expect.arrayContaining([
        { cell: a(0, 0), corner: 1 },
        { cell: a(1, 0), corner: 3 },
        { cell: a(0, 1), corner: 5 },
      ])
    );
  });

  it('holds under flat-top too — 3 owners, one physical point', () => {
    const owners = cornerOwners({ cell: a(2, 3), corner: 4 }, SIZE, 'flat');
    expect(owners).toHaveLength(3);
    const points = owners.map((o) => cornerPoint(o, SIZE, 'flat'));
    for (const p of points) {
      expect(p.x).toBeCloseTo(points[0].x, 8);
      expect(p.y).toBeCloseTo(points[0].y, 8);
    }
  });
});

describe('canonicalCorner — deterministic single owner, smallest (r, q) wins', () => {
  it('picks the smallest-r owner when rows differ', () => {
    // (0,0)#0's owners are (0,0), (1,0), (1,−1) — r = −1 wins.
    expect(
      canonicalCorner({ cell: a(0, 0), corner: 0 }, SIZE, 'pointy')
    ).toEqual({ cell: a(1, -1), corner: 2 });
  });

  it('picks the smallest-q owner when rows tie', () => {
    // (0,0)#1's owners: (0,0) and (1,0) tie on r=0; q=0 beats q=1.
    expect(
      canonicalCorner({ cell: a(0, 0), corner: 1 }, SIZE, 'pointy')
    ).toEqual({ cell: a(0, 0), corner: 1 });
  });

  it('every owner of the same vertex canonicalizes to the identical answer', () => {
    for (const orientation of ['pointy', 'flat'] as const) {
      const owners = cornerOwners(
        { cell: a(3, 2), corner: 5 },
        SIZE,
        orientation
      );
      const canonical = owners.map((o) =>
        canonicalCorner(o, SIZE, orientation)
      );
      for (const c of canonical) expect(c).toEqual(canonical[0]);
    }
  });

  it('a negative-coordinate owner is a legal canonical address (the canvas grows in every direction)', () => {
    const c = canonicalCorner({ cell: a(0, 0), corner: 0 }, SIZE, 'pointy');
    expect(c.cell.r).toBe(-1);
  });
});

describe('sameCorner / cornerKey — identity across differently-chosen owners', () => {
  it('recognizes two different (cell,corner) pairs as the same physical vertex', () => {
    expect(
      sameCorner(
        { cell: a(0, 0), corner: 1 },
        { cell: a(0, 1), corner: 5 },
        SIZE,
        'pointy'
      )
    ).toBe(true);
    expect(cornerKey({ cell: a(0, 0), corner: 1 }, SIZE, 'pointy')).toBe(
      cornerKey({ cell: a(1, 0), corner: 3 }, SIZE, 'pointy')
    );
  });

  it('rejects two genuinely different vertices', () => {
    expect(
      sameCorner(
        { cell: a(0, 0), corner: 0 },
        { cell: a(0, 0), corner: 1 },
        SIZE,
        'pointy'
      )
    ).toBe(false);
  });
});

describe('nearestCorner', () => {
  it('snaps to the anchor cell’s own corner when the point sits near it', () => {
    const target: CornerRef = { cell: a(2, 2), corner: 1 };
    const p = cornerPoint(target, SIZE, 'pointy');
    const snapped = nearestCorner({ x: p.x + 2, y: p.y - 3 }, SIZE, 'pointy');
    expect(sameCorner(snapped, target, SIZE, 'pointy')).toBe(true);
  });

  it('can resolve to a neighbor cell’s corner when that one is truly nearest', () => {
    // A point just OUTSIDE the anchor cell, past its corner 0, is
    // nearest to a vertex the anchor also owns — but the check must
    // consider neighbors' corners by real distance either way. Verify
    // with a point near the MIDDLE of a neighboring cell's far edge.
    const neighborCorner: CornerRef = { cell: a(3, 2), corner: 1 };
    const p = cornerPoint(neighborCorner, SIZE, 'pointy');
    const snapped = nearestCorner({ x: p.x - 1, y: p.y + 1 }, SIZE, 'pointy');
    expect(sameCorner(snapped, neighborCorner, SIZE, 'pointy')).toBe(true);
  });
});

describe('cellAtPoint — the exact inverse of cellCenter', () => {
  it('round-trips cell centers and resolves off-center points, both orientations', () => {
    for (const orientation of ['pointy', 'flat'] as const) {
      for (const cell of [a(0, 0), a(3, 2), a(-2, 4), a(5, -3)]) {
        const c = cellCenter(cell, SIZE, orientation);
        expect(cellAtPoint(c, SIZE, orientation)).toEqual(cell);
        // A point nudged toward a corner still resolves to the same cell
        // (inside the hex), pinning the rounding correction too.
        expect(
          cellAtPoint(
            { x: c.x + SIZE * 0.4, y: c.y + SIZE * 0.2 },
            SIZE,
            orientation
          )
        ).toEqual(cell);
      }
    }
  });
});

describe('cornerNeighbors — the honeycomb’s 3 incident lattice edges', () => {
  it('an interior corner has exactly 3 neighbors, each one hex side away', () => {
    for (const orientation of ['pointy', 'flat'] as const) {
      const ref: CornerRef = { cell: a(1, 1), corner: 2 };
      const neighbors = cornerNeighbors(ref, SIZE, orientation);
      expect(neighbors).toHaveLength(3);
      const p0 = cornerPoint(ref, SIZE, orientation);
      for (const n of neighbors) {
        const p = cornerPoint(n, SIZE, orientation);
        expect(Math.hypot(p.x - p0.x, p.y - p0.y)).toBeCloseTo(SIZE, 8);
      }
      // All three are distinct vertices.
      const keys = new Set(
        neighbors.map((n) => cornerKey(n, SIZE, orientation))
      );
      expect(keys.size).toBe(3);
    }
  });
});

describe('latticeEdgeCells — a lattice edge separates exactly one adjacent cell pair', () => {
  it('recovers the cell pair whose shared side the two corners span', () => {
    // The shared side of (0,0)/(1,0) runs corner-to-corner; walking its
    // two endpoints back through the lattice must name exactly that
    // pair (cross-checked against edgeSegment, the board's own edge
    // geometry — one construction verifying the other).
    for (const orientation of ['pointy', 'flat'] as const) {
      const seg = edgeSegment([a(0, 0), a(1, 0)], SIZE, orientation)!;
      const v = nearestCorner(seg.a, SIZE, orientation);
      const w = nearestCorner(seg.b, SIZE, orientation);
      const pair = latticeEdgeCells(v, w, SIZE, orientation);
      expect(pair).not.toBeNull();
      const cells = pair!;
      expect(
        (sameCell(cells[0], a(0, 0)) && sameCell(cells[1], a(1, 0))) ||
          (sameCell(cells[0], a(1, 0)) && sameCell(cells[1], a(0, 0)))
      ).toBe(true);
    }
  });

  it('returns null for two corners that are not lattice-adjacent', () => {
    // Opposite corners of one cell span the whole hex, not one side.
    expect(
      latticeEdgeCells(
        { cell: a(0, 0), corner: 0 },
        { cell: a(0, 0), corner: 3 },
        SIZE,
        'pointy'
      )
    ).toBeNull();
  });
});
