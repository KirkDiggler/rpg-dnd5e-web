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
 * **HEX-TRUE CREATION CANVAS (2026-08-03)**: creation mode's own
 * rectangular-canvas spacing, `FLAT_COL_SPACING`/`FLAT_ROW_SPACING`, USED
 * to live here — a deliberately separate square-grid renderer for a
 * freeform drawing canvas that (per this file's own header comment,
 * before this round) was "never claiming hex adjacency in the first
 * place." That exemption is retired: Kirk, diagnosing the square canvas
 * directly, "that new dungeon is squares... our walls as we lay them out
 * cannot follow along the edge... any hex that is not 100% uncovered
 * would not be traversable by the players" — a square grid only exposes
 * 4 of a hex's 6 real adjacencies, so a region that reads as fully
 * enclosed on squares can have two invisible open edges in hex reality,
 * and "walls look like vertical blinds along the side edges" (disconnected
 * parallel slats, where real hex edges share corners and chain into a
 * continuous run). `creation/creationGeometry.ts` now builds its geometry
 * from this file's own `cellCenter`/`cellCorners`/`edgeBetweenCells` —
 * the SAME functions this hex-true edit board renders with — instead of
 * a second, square coordinate system. One board geometry, not two.
 */
import {
  cubeToWorld,
  hexEdgeBetween,
  hexCorners as realHexCorners,
  worldToCube as realWorldToCube,
} from '@/components/hex-grid/hexMath';
import { cubeAtColRow, hexColumn, hexRow } from '@/hooks/wallRuns';

/** Board-space hex radius. Smaller than the 3D game's world-unit
 * `HEX_SIZE` (which is 1.0 world unit) — this is a 2D SVG pixel radius,
 * a purely local rendering choice with no wire representation (see
 * CONTRACT.md's "cell-size/aspect for rendering" finding). Shared by
 * BOTH boards now (creation mode included) — one hex size, not two. */
export const BOARD_HEX_SIZE = 24;

export interface CellPos {
  x: number;
  y: number;
}

/** The inverse of `cellCenter`: the cube coordinate nearest a board-space
 * point, at this file's own `BOARD_HEX_SIZE`. Exposed here (rather than
 * making every caller import `hexMath.ts`'s `worldToCube` directly and
 * juggle the `{x,z}`/`{x,y}` naming difference itself) so hit-testing
 * code — `boardGeometry.ts`'s drag-drop resolution, `creationGeometry.ts`'s
 * `nearestEdge`/`nearestCreationCell` — has one real inverse-transform
 * entry point at the SAME size every renderer draws with. */
export function worldToCube(point: CellPos) {
  return realWorldToCube({ x: point.x, z: point.y }, BOARD_HEX_SIZE);
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

export interface CellEdge {
  a: CellPos;
  b: CellPos;
  mid: CellPos;
}

/** The shared edge between two adjacent hex cells, in this file's board
 * space — the SAME `hexEdgeBetween` geometry the 3D preview's wall boxes
 * and wall-mount rotation use (`preview3d/DungeonPreview3D.tsx`'s
 * `edgeBetweenCells`/`wallBoxTransform`/`wallMountRotationY`), just
 * projected onto `CellPos`'s 2D plane instead of a Three.js Y rotation.
 * Lets the 2D edit board draw walls as real edge segments (graduation
 * audit item: it used to draw a dashed full-cell rect at the wall's
 * `from` cell instead of the actual shared edge, the one place in this
 * concept still drawing wall geometry wrong). */
export function edgeBetweenCells(
  colA: number,
  rowA: number,
  colB: number,
  rowB: number
): CellEdge {
  const edge = hexEdgeBetween(
    cubeAtColRow(colA, rowA),
    cubeAtColRow(colB, rowB),
    BOARD_HEX_SIZE
  );
  return {
    a: { x: edge.a.x, y: edge.a.z },
    b: { x: edge.b.x, y: edge.b.z },
    mid: { x: edge.mid.x, y: edge.mid.z },
  };
}

// Re-exported so callers doing manual col/row bookkeeping (e.g. nearest-cell
// hit testing during a drag) use the same real conversion, never a second
// hand-rolled one.
export { cubeAtColRow, hexColumn, hexRow };
