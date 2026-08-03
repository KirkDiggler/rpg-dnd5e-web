/**
 * creationGeometry — pure position/hit-testing math for the creation
 * board. Kept separate from rendering per the same split as
 * `boardGeometry.ts`/`Board.tsx`.
 */
import { FLAT_COL_SPACING, FLAT_ROW_SPACING, type CellPos } from '../hexLayout';
import { type CreationGrid } from './creationTypes';

export function creationCellCenter(col: number, row: number): CellPos {
  return { x: col * FLAT_COL_SPACING, y: row * FLAT_ROW_SPACING };
}

export interface EdgeGeometry {
  orientation: 'h' | 'v';
  /** The two cells the edge sits between. */
  cellA: [number, number];
  cellB: [number, number];
  /** Line endpoints in board space. */
  a: CellPos;
  b: CellPos;
  mid: CellPos;
}

export function hEdgeGeometry(col: number, row: number): EdgeGeometry {
  const y = (row + 0.5) * FLAT_ROW_SPACING;
  const x0 = (col - 0.5) * FLAT_COL_SPACING;
  const x1 = (col + 0.5) * FLAT_COL_SPACING;
  return {
    orientation: 'h',
    cellA: [col, row],
    cellB: [col, row + 1],
    a: { x: x0, y },
    b: { x: x1, y },
    mid: { x: (x0 + x1) / 2, y },
  };
}

export function vEdgeGeometry(col: number, row: number): EdgeGeometry {
  const x = (col + 0.5) * FLAT_COL_SPACING;
  const y0 = (row - 0.5) * FLAT_ROW_SPACING;
  const y1 = (row + 0.5) * FLAT_ROW_SPACING;
  return {
    orientation: 'v',
    cellA: [col, row],
    cellB: [col + 1, row],
    a: { x, y: y0 },
    b: { x, y: y1 },
    mid: { x, y: (y0 + y1) / 2 },
  };
}

/** Nearest internal edge to a board-space point — computed analytically
 * (O(1)) rather than by scanning every edge, since this runs on every
 * pointer-move during a wall-drawing drag: on a 20x30 grid that's ~1150
 * edges recomputed per pixel of mouse movement with a brute-force scan,
 * easily enough to feel laggy. A regular grid makes the direct form
 * cheap: round to the nearest cell, then use the point's fractional
 * offset within that cell to decide whether it's closer to a vertical or
 * horizontal edge, and which side. Returns null for the canvas perimeter
 * (not a togglable internal edge) or genuinely out-of-grid points. */
/**
 * `lockOrientation`, when passed, skips the dx-vs-dy comparison and
 * always resolves to an edge of that orientation. `CreationBoard.tsx`
 * uses this to hold a wall-drawing stroke to one orientation for its
 * whole duration once the drag direction is known — without it, the
 * per-point dx/dy comparison flips which axis "wins" every time the
 * pointer crosses a cell boundary, turning a straight drag into a
 * crenellated comb instead of a straight wall (see CONTRACT.md's
 * wall-interaction finding for the concrete before/after).
 */
export function nearestEdge(
  point: CellPos,
  grid: CreationGrid,
  lockOrientation?: 'h' | 'v'
): EdgeGeometry | null {
  const colF = point.x / FLAT_COL_SPACING;
  const rowF = point.y / FLAT_ROW_SPACING;
  const c0 = Math.round(colF);
  const r0 = Math.round(rowF);
  const dx = colF - c0;
  const dy = rowF - r0;

  const wantVertical = lockOrientation
    ? lockOrientation === 'v'
    : Math.abs(dx) > Math.abs(dy);

  if (wantVertical) {
    const col = dx > 0 ? c0 : c0 - 1;
    if (col < 0 || col > grid.width - 2 || r0 < 0 || r0 > grid.height - 1)
      return null;
    return vEdgeGeometry(col, r0);
  }
  const row = dy > 0 ? r0 : r0 - 1;
  if (row < 0 || row > grid.height - 2 || c0 < 0 || c0 > grid.width - 1)
    return null;
  return hEdgeGeometry(c0, row);
}

export function nearestCreationCell(
  point: CellPos,
  grid: CreationGrid
): [number, number] {
  const col = Math.max(
    0,
    Math.min(grid.width - 1, Math.round(point.x / FLAT_COL_SPACING))
  );
  const row = Math.max(
    0,
    Math.min(grid.height - 1, Math.round(point.y / FLAT_ROW_SPACING))
  );
  return [col, row];
}
