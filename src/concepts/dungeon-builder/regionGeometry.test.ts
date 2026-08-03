import { describe, expect, it } from 'vitest';
import {
  cellsAdjacent,
  cellsAreContiguous,
  cellsEqual,
  pickAttachmentEdge,
  regionCentroid,
  sharedBoundaryEdges,
  type RegionEdge,
} from './regionGeometry';

describe('cellsEqual', () => {
  it('compares [col,row] pairs by value', () => {
    expect(cellsEqual([1, 2], [1, 2])).toBe(true);
    expect(cellsEqual([1, 2], [2, 1])).toBe(false);
  });
});

describe("cellsAdjacent (HEX-TRUE, 2026-08-03 — see this module's own header comment for the 4-to-6-adjacency widening)", () => {
  it('is true for the 4 old "orthogonal" neighbors — every one of them is still a real hex neighbor', () => {
    expect(cellsAdjacent([1, 1], [2, 1])).toBe(true);
    expect(cellsAdjacent([1, 1], [1, 2])).toBe(true);
    expect(cellsAdjacent([1, 1], [0, 1])).toBe(true);
    expect(cellsAdjacent([1, 1], [1, 0])).toBe(true);
  });

  it('is true for ONE of a square grid\'s two "diagonal" directions — a real hex neighbor square adjacency couldn\'t represent', () => {
    // [1,1]-[2,2]: a genuine hex neighbor (verified numerically while
    // building this unit — hex distance 1, not the "false" the old
    // 4-neighbor-only rule gave it). This is exactly the kind of pair
    // Kirk's finding named: a square grid only draws 4 of a hex's 6 real
    // adjacencies, so a region that read as enclosed on squares could
    // have an invisible open edge here in hex reality.
    expect(cellsAdjacent([1, 1], [2, 2])).toBe(true);
  });

  it('is false for the OTHER "diagonal" direction — column parity means not every square-diagonal pair becomes a hex neighbor', () => {
    // [1,1]-[0,0]: hex distance 2, still non-adjacent — the widening
    // isn't "all diagonals now count," it's "exactly the diagonal that
    // is a real hex neighbor now counts."
    expect(cellsAdjacent([1, 1], [0, 0])).toBe(false);
  });

  it('is false for the same cell or a genuinely non-adjacent cell', () => {
    expect(cellsAdjacent([1, 1], [1, 1])).toBe(false);
    expect(cellsAdjacent([1, 1], [5, 5])).toBe(false);
  });
});

describe('cellsAreContiguous', () => {
  it('is false for an empty list', () => {
    expect(cellsAreContiguous([])).toBe(false);
  });

  it('is true for a single cell', () => {
    expect(cellsAreContiguous([[3, 3]])).toBe(true);
  });

  it('is true for a hex-connected run, any authoring order', () => {
    expect(
      cellsAreContiguous([
        [9, 4],
        [9, 2],
        [9, 3],
        [10, 3],
        [10, 2],
        [10, 4],
      ])
    ).toBe(true);
  });

  it('is false for two disconnected islands', () => {
    expect(
      cellsAreContiguous([
        [0, 0],
        [1, 0],
        [5, 5],
        [6, 5],
      ])
    ).toBe(false);
  });

  it('is false for cells that only touch diagonally', () => {
    expect(
      cellsAreContiguous([
        [0, 0],
        [1, 1],
      ])
    ).toBe(false);
  });
});

describe('sharedBoundaryEdges', () => {
  it('finds every hex edge between two cell sets — including a genuinely NEW one 4-adjacency missed (HEX-TRUE, 2026-08-03)', () => {
    // A 2x1 region at col 0-1, row 0, next to a 2x1 region at col 0-1, row 1.
    const a: [number, number][] = [
      [0, 0],
      [1, 0],
    ];
    const b: [number, number][] = [
      [0, 1],
      [1, 1],
    ];
    const edges = sharedBoundaryEdges(a, b);
    // The old 4-adjacency rule found exactly 2 edges here ([0,0]-[0,1],
    // [1,0]-[1,1] — same-column, consecutive-row pairs). Real hex
    // adjacency finds a THIRD: [1,0]-[0,1] is a genuine hex neighbor
    // (verified numerically while building this unit) even though it
    // reads as "diagonal" on the square grid these cells were originally
    // authored against — one more candidate boundary edge
    // `pickAttachmentEdge` now has to choose among, never fewer (6-
    // adjacency is a strict superset, so a boundary that validated before
    // still does).
    expect(edges).toHaveLength(3);
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: [0, 0], to: [0, 1] },
        { from: [1, 0], to: [1, 1] },
        { from: [1, 0], to: [0, 1] },
      ])
    );
  });

  it('is empty when the two regions are not adjacent at all', () => {
    const a: [number, number][] = [[0, 0]];
    const b: [number, number][] = [[5, 5]];
    expect(sharedBoundaryEdges(a, b)).toEqual([]);
  });

  it('is empty for two cells that are hex-distance 2 apart, even though they read as "diagonal" neighbors on a square grid', () => {
    const a: [number, number][] = [[0, 0]];
    const b: [number, number][] = [[1, 1]];
    expect(sharedBoundaryEdges(a, b)).toEqual([]);
  });
});

describe('pickAttachmentEdge', () => {
  it('returns null for an empty edge list', () => {
    expect(pickAttachmentEdge([])).toBeNull();
  });

  it('deterministically picks the same edge every call for the same input', () => {
    const edges: RegionEdge[] = [
      { from: [0, 0], to: [0, 1] },
      { from: [1, 0], to: [1, 1] },
      { from: [2, 0], to: [2, 1] },
    ];
    const first = pickAttachmentEdge(edges);
    const second = pickAttachmentEdge([...edges]);
    expect(first).toEqual(second);
    expect(first).toEqual({ from: [1, 0], to: [1, 1] }); // the middle of 3, sorted by (row, col)
  });

  it('picks a real member of the input list, not a synthesized midpoint', () => {
    const edges: RegionEdge[] = [
      { from: [0, 0], to: [0, 1] },
      { from: [4, 0], to: [4, 1] },
    ];
    const picked = pickAttachmentEdge(edges);
    expect(edges).toContainEqual(picked);
  });
});

describe('regionCentroid', () => {
  it('is the arithmetic mean of the cell list', () => {
    expect(
      regionCentroid([
        [0, 0],
        [2, 0],
      ])
    ).toEqual({ col: 1, row: 0 });
  });

  it('is {0,0} for an empty list rather than NaN', () => {
    expect(regionCentroid([])).toEqual({ col: 0, row: 0 });
  });
});
