/**
 * hexLayout — board cell positioning for the dungeon-builder concept.
 *
 * `hexTrueCellCenter` reuses the game's REAL hex math (`hexMath.ts`'s
 * `cubeToWorld`, `wallRuns.ts`'s `cubeAtColRow`) rather than re-deriving
 * it — the standalone HTML concept ported these functions by hand because
 * it had no module system; this one imports them, per the concepts
 * convention ("real components/logic, not a parallel implementation").
 *
 * `flatCellCenter` is this concept's own addition: a plain Cartesian grid
 * that ignores hex-column parity entirely. It exists because of a finding
 * from the standalone concept (see CONTRACT.md "the floor plan shears
 * diagonally"): rendering a wide multi-room FloorPlan through the game's
 * real odd-q pointy-top math produces a board that shears — "row 0"
 * drifts upward on screen by roughly half a hex per column, since
 * `hexRow(col, row) = row + floor(col/2)` at a fixed row. That's provably
 * correct hex geometry, not a bug, but it may hurt legibility for an
 * authoring tool where precise clicking matters more than exact hex
 * adjacency. The toggle lets Kirk compare both renderings of the SAME
 * FloorPlan in-app and decide — see `DungeonBuilderConcept.tsx`.
 */
import {
  cubeToWorld,
  hexCorners as realHexCorners,
} from '@/components/hex-grid/hexMath';
import { cubeAtColRow, hexColumn, hexRow } from '@/hooks/wallRuns';

export type LayoutMode = 'hex-true' | 'flattened';

/** Board-space hex radius. Smaller than the 3D game's world-unit
 * `HEX_SIZE` (which is 1.0 world unit) — this is a 2D SVG pixel radius,
 * a purely local rendering choice with no wire representation (see
 * CONTRACT.md's "cell-size/aspect for rendering" finding). */
export const BOARD_HEX_SIZE = 24;

export interface CellPos {
  x: number;
  y: number;
}

/** Same odd-q pointy-top math the real 3D floor renders with. */
export function hexTrueCellCenter(col: number, row: number): CellPos {
  const cube = cubeAtColRow(col, row);
  const world = cubeToWorld(cube, BOARD_HEX_SIZE);
  return { x: world.x, y: world.z };
}

/** Plain rectangular grid — no hex-column parity correction. Spacing
 * chosen to roughly match hex-true's average column/row pitch so toggling
 * between modes doesn't wildly rescale the board. */
export const FLAT_COL_SPACING = BOARD_HEX_SIZE * Math.sqrt(3);
export const FLAT_ROW_SPACING = BOARD_HEX_SIZE * 1.5;

export function flatCellCenter(col: number, row: number): CellPos {
  return { x: col * FLAT_COL_SPACING, y: row * FLAT_ROW_SPACING };
}

export function cellCenter(
  mode: LayoutMode,
  col: number,
  row: number
): CellPos {
  return mode === 'hex-true'
    ? hexTrueCellCenter(col, row)
    : flatCellCenter(col, row);
}

/** Hex corner points for `hex-true` mode (reused from hexMath.ts).
 * `flattened` mode draws simple squares — it's explicitly not claiming
 * hex adjacency, so a hex outline there would be misleading. */
export function cellCorners(
  mode: LayoutMode,
  center: CellPos,
  size: number
): [number, number][] {
  if (mode === 'hex-true') {
    return realHexCorners({ x: center.x, z: center.y }, size).map(
      (c) => [c.x, c.z] as [number, number]
    );
  }
  const half = size * 0.85;
  return [
    [center.x - half, center.y - half],
    [center.x + half, center.y - half],
    [center.x + half, center.y + half],
    [center.x - half, center.y + half],
  ];
}

// Re-exported so callers doing manual col/row bookkeeping (e.g. nearest-cell
// hit testing during a drag) use the same real conversion, never a second
// hand-rolled one.
export { cubeAtColRow, hexColumn, hexRow };
