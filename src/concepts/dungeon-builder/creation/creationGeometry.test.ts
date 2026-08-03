import { describe, expect, it } from 'vitest';
import { cellCenter } from '../hexLayout';
import {
  canonicalHexEdge,
  dragFamily,
  nearestCreationCell,
  nearestEdge,
  openBoundaryEdges,
  traceEdgeRun,
} from './creationGeometry';
import type { CreationGrid } from './creationTypes';

const grid: CreationGrid = { width: 20, height: 20 };

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('nearestEdge', () => {
  it('resolves to the SAME canonical edge at its own midpoint, for all 6 facings of an interior cell', () => {
    for (let facing = 0; facing < 6; facing++) {
      const expected = canonicalHexEdge(10, 10, facing);
      const found = nearestEdge(expected.mid, grid);
      expect(found?.cellA).toEqual(expected.cellA);
      expect(found?.cellB).toEqual(expected.cellB);
    }
  });

  it("canonicalizes to the SAME cellA/cellB pair whichever of the edge's two cells a query point sits nearest to — matching dungeonYaml.ts's wallIndexAtEdge contract of ONE canonical from/to order per physical edge", () => {
    const facing = 1; // NE — a "primary" facing (0-2)
    const edge = canonicalHexEdge(10, 10, facing);
    const hereCenter = cellCenter(10, 10);
    const thereCenter = cellCenter(edge.cellB[0], edge.cellB[1]);
    const nearHereSide = {
      x: hereCenter.x * 0.4 + edge.mid.x * 0.6,
      y: hereCenter.y * 0.4 + edge.mid.y * 0.6,
    };
    const nearThereSide = {
      x: thereCenter.x * 0.4 + edge.mid.x * 0.6,
      y: thereCenter.y * 0.4 + edge.mid.y * 0.6,
    };
    const foundHere = nearestEdge(nearHereSide, grid);
    const foundThere = nearestEdge(nearThereSide, grid);
    expect(foundHere?.cellA).toEqual(edge.cellA);
    expect(foundHere?.cellB).toEqual(edge.cellB);
    expect(foundThere?.cellA).toEqual(edge.cellA);
    expect(foundThere?.cellB).toEqual(edge.cellB);
  });

  it('returns null once the nearest cell itself falls outside the grid — the perimeter is an always-on boundary, not togglable (creationTypes.ts)', () => {
    expect(nearestEdge(cellCenter(-1, 5), grid)).toBeNull();
    expect(nearestEdge(cellCenter(5, grid.height), grid)).toBeNull();
  });

  it('lockFamily restricts candidates to exactly one of the 3 parallel-edge families', () => {
    for (let family = 0 as 0 | 1 | 2; family < 3; family++) {
      const edge = canonicalHexEdge(10, 10, family);
      const found = nearestEdge(edge.mid, grid, family);
      expect(found?.cellA).toEqual(edge.cellA);
      expect(found?.cellB).toEqual(edge.cellB);
    }
    // Locked to family 0 (E/W), a point sitting exactly on family 1's own
    // edge midpoint must NOT resolve to that family-1 edge.
    const family1Edge = canonicalHexEdge(10, 10, 1);
    const lockedToFamily0 = nearestEdge(family1Edge.mid, grid, 0);
    expect(lockedToFamily0).not.toEqual(
      expect.objectContaining({
        cellA: family1Edge.cellA,
        cellB: family1Edge.cellB,
      })
    );
  });

  describe("hex-true fix for the square predecessor's crenellated-comb bug (CONTRACT.md's wall-interaction finding)", () => {
    // The square board's `nearestEdge` picked between exactly 2 candidate
    // edges via a dx-vs-dy comparison that flipped mid-cell, at a point
    // with no relationship to a real edge boundary — producing a
    // disconnected "comb" instead of a straight wall. This hex version
    // picks among a cell's up to 6 REAL edges by point-to-segment
    // distance; unlike the square case, that partition tiles the cell
    // with no gap, so a plain (unlocked) sweep along a straight
    // world-space line never produces a disconnected pick. Verified here
    // the same way the bug was originally diagnosed: sweep a straight
    // line and check every transition connects.
    it('a straight horizontal sweep near a row boundary never produces two DISCONNECTED consecutive edges, even with no lock at all', () => {
      const boundaryY = canonicalHexEdge(8, 14, 5).mid.y; // row14/row15 boundary near col 8
      let prev: ReturnType<typeof nearestEdge> = null;
      let sawMultipleEdges = false;
      for (let x = cellCenter(3, 14).x; x <= cellCenter(12, 14).x; x += 2) {
        const found = nearestEdge({ x, y: boundaryY }, grid);
        if (!found) continue;
        if (
          prev &&
          (prev.cellA[0] !== found.cellA[0] ||
            prev.cellA[1] !== found.cellA[1] ||
            prev.cellB[0] !== found.cellB[0] ||
            prev.cellB[1] !== found.cellB[1])
        ) {
          sawMultipleEdges = true;
          // The transition itself must be corner-connected — a shared
          // endpoint between the previous edge and this one.
          const shared =
            dist(prev.a, found.a) < 0.5 ||
            dist(prev.a, found.b) < 0.5 ||
            dist(prev.b, found.a) < 0.5 ||
            dist(prev.b, found.b) < 0.5;
          expect(shared).toBe(true);
        }
        prev = found;
      }
      // Sanity: the sweep actually crossed more than one edge (otherwise
      // the connectivity assertion above never ran).
      expect(sawMultipleEdges).toBe(true);
    });
  });
});

describe('traceEdgeRun', () => {
  it('produces a fully connected sequence of edges for a straight world-space drag', () => {
    const boundaryY = canonicalHexEdge(8, 14, 5).mid.y;
    const run = traceEdgeRun(
      { x: cellCenter(5, 14).x, y: boundaryY },
      { x: cellCenter(12, 14).x, y: boundaryY },
      grid
    );
    expect(run.length).toBeGreaterThan(1);
    for (let i = 1; i < run.length; i++) {
      const prev = run[i - 1];
      const cur = run[i];
      const shared =
        dist(prev.a, cur.a) < 0.5 ||
        dist(prev.a, cur.b) < 0.5 ||
        dist(prev.b, cur.a) < 0.5 ||
        dist(prev.b, cur.b) < 0.5;
      expect(shared).toBe(true);
    }
  });

  it('is empty for a degenerate (zero-length) drag entirely off-grid', () => {
    expect(
      traceEdgeRun({ x: -9999, y: -9999 }, { x: -9999, y: -9999 }, grid)
    ).toEqual([]);
  });
});

describe('nearestCreationCell', () => {
  it("resolves a point at a cell's own exact center back to that cell", () => {
    const c = cellCenter(7, 7);
    expect(nearestCreationCell(c, grid)).toEqual([7, 7]);
  });

  it('clamps to the grid bounds', () => {
    expect(nearestCreationCell({ x: -9999, y: -9999 }, grid)).toEqual([0, 0]);
    expect(nearestCreationCell({ x: 9999, y: 9999 }, grid)).toEqual([
      grid.width - 1,
      grid.height - 1,
    ]);
  });
});

describe('dragFamily', () => {
  it('is stable (mod PI) for a drag and its exact opposite — an edge is an undirected line', () => {
    expect(dragFamily(10, 3)).toEqual(dragFamily(-10, -3));
  });

  it('picks a different family for drag directions ~90° apart', () => {
    const horizontal = dragFamily(10, 0);
    const vertical = dragFamily(0, 10);
    expect(horizontal).not.toEqual(vertical);
  });
});

describe("openBoundaryEdges (Kirk's false-enclosure worry, made visible)", () => {
  it('an isolated single cell has all 6 of its edges open when no walls exist', () => {
    expect(openBoundaryEdges([[10, 10]], [])).toHaveLength(6);
  });

  it('a wall on one boundary edge removes exactly that edge from the open list', () => {
    const edge = canonicalHexEdge(10, 10, 2); // NW
    const open = openBoundaryEdges(
      [[10, 10]],
      [{ from: edge.cellA, to: edge.cellB }]
    );
    expect(open).toHaveLength(5);
    expect(
      open.some(
        (e) =>
          e.cellA[0] === edge.cellA[0] &&
          e.cellA[1] === edge.cellA[1] &&
          e.cellB[0] === edge.cellB[0] &&
          e.cellB[1] === edge.cellB[1]
      )
    ).toBe(false);
  });

  it('walling all 6 boundary edges of an isolated cell fully seals it — zero open edges', () => {
    const walls = Array.from({ length: 6 }, (_, facing) => {
      const e = canonicalHexEdge(10, 10, facing);
      return { from: e.cellA, to: e.cellB };
    });
    expect(openBoundaryEdges([[10, 10]], walls)).toEqual([]);
  });

  it('the shared internal edge between two members of the SAME region is never open, wall or no wall — a real hex boundary claim, not a square-grid one', () => {
    const shared = canonicalHexEdge(10, 10, 0); // E
    const neighbor = shared.cellB;
    const cells: [number, number][] = [[10, 10], neighbor];
    const open = openBoundaryEdges(cells, []);
    const sharedIsOpen = open.some(
      (e) =>
        e.cellA[0] === shared.cellA[0] &&
        e.cellA[1] === shared.cellA[1] &&
        e.cellB[0] === shared.cellB[0] &&
        e.cellB[1] === shared.cellB[1]
    );
    expect(sharedIsOpen).toBe(false);
    // Each cell contributes 5 non-internal edges (its 6th, shared with
    // the other member, is excluded) — 10 total, none coinciding, since
    // an edge is uniquely identified by ITS OWN two cells and A !== B.
    expect(open).toHaveLength(10);
  });
});
