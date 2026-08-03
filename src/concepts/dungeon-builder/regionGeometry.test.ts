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

describe('cellsAdjacent', () => {
  it('is true for orthogonal neighbors only', () => {
    expect(cellsAdjacent([1, 1], [2, 1])).toBe(true);
    expect(cellsAdjacent([1, 1], [1, 2])).toBe(true);
    expect(cellsAdjacent([1, 1], [0, 1])).toBe(true);
    expect(cellsAdjacent([1, 1], [1, 0])).toBe(true);
  });

  it('is false for diagonal neighbors', () => {
    expect(cellsAdjacent([1, 1], [2, 2])).toBe(false);
    expect(cellsAdjacent([1, 1], [0, 0])).toBe(false);
  });

  it('is false for the same cell or a non-adjacent cell', () => {
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

  it('is true for an orthogonally connected run, any authoring order', () => {
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
  it('finds every orthogonal edge between two cell sets', () => {
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
    expect(edges).toHaveLength(2);
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: [0, 0], to: [0, 1] },
        { from: [1, 0], to: [1, 1] },
      ])
    );
  });

  it('is empty when the two regions are not adjacent at all', () => {
    const a: [number, number][] = [[0, 0]];
    const b: [number, number][] = [[5, 5]];
    expect(sharedBoundaryEdges(a, b)).toEqual([]);
  });

  it('is empty for two regions that only touch diagonally', () => {
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
