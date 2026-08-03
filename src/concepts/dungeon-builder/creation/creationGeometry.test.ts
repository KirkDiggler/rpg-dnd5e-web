import { describe, expect, it } from 'vitest';
import { FLAT_COL_SPACING, FLAT_ROW_SPACING } from '../hexLayout';
import { nearestCreationCell, nearestEdge } from './creationGeometry';
import type { CreationGrid } from './creationTypes';

const grid: CreationGrid = { width: 20, height: 20 };

// A point built from fractional (col, row) coordinates, the same way
// nearestEdge internally divides point.x/point.y by FLAT_COL_SPACING/
// FLAT_ROW_SPACING to recover them -- keeps these tests independent of
// the actual spacing constant values.
function pointAt(colF: number, rowF: number) {
  return { x: colF * FLAT_COL_SPACING, y: rowF * FLAT_ROW_SPACING };
}

describe('nearestEdge', () => {
  it('resolves the horizontal edge for a point centered in a cell, closer to the row boundary below', () => {
    const edge = nearestEdge(pointAt(5, 5.5), grid);
    expect(edge?.orientation).toBe('h');
    expect(edge?.cellA).toEqual([5, 5]);
    expect(edge?.cellB).toEqual([5, 6]);
  });

  it('resolves the vertical edge for a point centered in a cell, closer to the column boundary to the right', () => {
    const edge = nearestEdge(pointAt(5.5, 5), grid);
    expect(edge?.orientation).toBe('v');
    expect(edge?.cellA).toEqual([5, 5]);
    expect(edge?.cellB).toEqual([6, 5]);
  });

  it('returns null off the canvas perimeter (no togglable internal edge there)', () => {
    expect(nearestEdge(pointAt(-0.5, 5), grid)).toBeNull();
    expect(nearestEdge(pointAt(5, grid.height - 0.5 + 0.6), grid)).toBeNull();
  });

  describe("orientation lock (CONTRACT.md's wall-interaction finding: a straight drag must hold one orientation)", () => {
    // row=5, y fixed 0.4 of a row-height off the row-5/row-6 boundary
    // (deliberately NOT exactly on it -- see this test's own assertion
    // below for why the exact-boundary case doesn't actually surface the
    // bug). Sweeping colF across a single cell's width (3.0 -> 3.49)
    // means dx grows from 0 toward 0.5 while dy stays fixed at 0.4, so dx
    // overtakes dy partway across the cell -- exactly the "the pointer
    // crosses a cell boundary" moment CONTRACT.md describes.
    const row = 5;
    const rowF = row + 0.4;
    const colFsAcrossOneCell = [3.0, 3.1, 3.2, 3.3, 3.45, 3.49];

    it('WITHOUT a lock, a straight horizontal drag flips to a vertical edge as the pointer nears each column boundary -- the bug the lock exists to fix', () => {
      const orientations = colFsAcrossOneCell.map(
        (colF) => nearestEdge(pointAt(colF, rowF), grid)?.orientation
      );
      // Starts horizontal (pointer away from the column boundary)...
      expect(orientations[0]).toBe('h');
      // ...and flips to vertical once dx (growing toward 0.5) overtakes
      // the fixed dy=0.4, well before the drag has actually left the row.
      expect(orientations[orientations.length - 1]).toBe('v');
      expect(new Set(orientations).size).toBeGreaterThan(1);
    });

    it('WITH lockOrientation: "h", the SAME straight horizontal drag stays on the SAME (row 5) horizontal edge the whole way -- never alternates', () => {
      const edges = colFsAcrossOneCell.map((colF) =>
        nearestEdge(pointAt(colF, rowF), grid, 'h')
      );
      expect(edges.every((e) => e?.orientation === 'h')).toBe(true);
      expect(
        edges.every((e) => e?.cellA[1] === row && e?.cellB[1] === row + 1)
      ).toBe(true);
    });

    it('WITH lockOrientation: "v", a straight vertical drag stays vertical even where the unlocked comparison would pick horizontal', () => {
      const col = 5;
      const colFAcrossOneCell = col + 0.4;
      const rowFsAcrossOneCell = [3.0, 3.1, 3.2, 3.3, 3.45, 3.49];
      const edges = rowFsAcrossOneCell.map((rf) =>
        nearestEdge(pointAt(colFAcrossOneCell, rf), grid, 'v')
      );
      expect(edges.every((e) => e?.orientation === 'v')).toBe(true);
      expect(
        edges.every((e) => e?.cellA[0] === col && e?.cellB[0] === col + 1)
      ).toBe(true);
    });
  });
});

describe('nearestCreationCell', () => {
  it('rounds to the nearest cell', () => {
    expect(nearestCreationCell(pointAt(5.4, 5.4), grid)).toEqual([5, 5]);
    expect(nearestCreationCell(pointAt(5.6, 5.6), grid)).toEqual([6, 6]);
  });

  it('clamps to the grid bounds', () => {
    expect(nearestCreationCell(pointAt(-3, -3), grid)).toEqual([0, 0]);
    expect(nearestCreationCell(pointAt(99, 99), grid)).toEqual([
      grid.width - 1,
      grid.height - 1,
    ]);
  });
});
