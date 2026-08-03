/**
 * hexLayout — board cell positioning for the dungeon-builder concept.
 *
 * `cellCenter` reuses the game's REAL hex math (`hexMath.ts`'s
 * `cubeToWorld`, `wallRuns.ts`'s `cubeAtColRow`) rather than re-deriving
 * it — the standalone HTML concept ported these functions by hand because
 * it had no module system; this one imports them, per the concepts
 * convention ("real components/logic, not a parallel implementation").
 *
 * Hex-true is the ONLY edit-mode board — Kirk, 2026-08-02, choosing
 * between it and a since-removed flattened/rectangular comparison
 * toggle: "I like hex. turning them into squares feels way off and not
 * what it will actually look like." The toggle existed to let him
 * compare both renderings of the same `FloorPlan` in-app and decide; he
 * decided. See CONTRACT.md's "Flattened layout mode: explored and
 * rejected" section for the full history — the diagonal-shear finding
 * that motivated building the comparison in the first place is still
 * real hex geometry, just no longer treated as a legibility problem
 * worth a second mode to work around.
 *
 * `FLAT_COL_SPACING`/`FLAT_ROW_SPACING` below are UNRELATED to that
 * removed toggle, despite the similar naming — they're creation mode's
 * own rectangular-canvas spacing (`CreationBoard.tsx`/
 * `creationGeometry.ts`), a deliberately separate, still-live renderer
 * for a freeform drawing canvas that was never claiming hex adjacency in
 * the first place (see CONTRACT.md: "CreationBoard.tsx is still its own
 * renderer, not Board.tsx itself — two genuinely different geometries").
 */
import {
  cubeToWorld,
  hexCorners as realHexCorners,
} from '@/components/hex-grid/hexMath';
import { cubeAtColRow, hexColumn, hexRow } from '@/hooks/wallRuns';

/** Board-space hex radius. Smaller than the 3D game's world-unit
 * `HEX_SIZE` (which is 1.0 world unit) — this is a 2D SVG pixel radius,
 * a purely local rendering choice with no wire representation (see
 * CONTRACT.md's "cell-size/aspect for rendering" finding). */
export const BOARD_HEX_SIZE = 24;

export interface CellPos {
  x: number;
  y: number;
}

/** Same odd-q pointy-top math the real 3D floor renders with — edit
 * mode's only board mode. */
export function cellCenter(col: number, row: number): CellPos {
  const cube = cubeAtColRow(col, row);
  const world = cubeToWorld(cube, BOARD_HEX_SIZE);
  return { x: world.x, y: world.z };
}

export function cellCorners(center: CellPos, size: number): [number, number][] {
  return realHexCorners({ x: center.x, z: center.y }, size).map(
    (c) => [c.x, c.z] as [number, number]
  );
}

/** Creation mode's rectangular-canvas spacing — see this file's header
 * doc comment for why these live here despite the "FLAT" naming echo of
 * the removed edit-mode toggle. Spacing values unchanged from before the
 * removal (chosen to roughly match hex-true's average column/row pitch,
 * a purely cosmetic choice with no bearing on this decision). */
export const FLAT_COL_SPACING = BOARD_HEX_SIZE * Math.sqrt(3);
export const FLAT_ROW_SPACING = BOARD_HEX_SIZE * 1.5;

// Re-exported so callers doing manual col/row bookkeeping (e.g. nearest-cell
// hit testing during a drag) use the same real conversion, never a second
// hand-rolled one.
export { cubeAtColRow, hexColumn, hexRow };
