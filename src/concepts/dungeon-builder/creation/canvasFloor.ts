/**
 * canvasFloor — the creation-mode "New Dungeon" canvas's own floor-cell
 * semantic: unlike edit mode's compiled `FloorPlan` (a chain of
 * server-generated rooms), a from-scratch canvas has no compiled floor
 * plan to render from at all (CONTRACT.md: "creation flow ... entirely
 * client-side, no schema exists for any of this"). The 3D preview still
 * needs SOME floor-cell set to hand `SyntyHexFloor` — this module derives
 * it directly from the document rather than inventing a second
 * `FloorPlan`-shaped fixture.
 *
 * **The defined semantic: every cell in `doc.canvas`'s bounds, minus
 * `doc.holes`.** Deliberately NOT also subtracting a straight-wall
 * footprint (`doc.wallLines`) or a drawn edge-wall (`doc.walls`) cell —
 * per Kirk's own rule ("any hex that is not 100% uncovered would not be
 * traversable"), a wall footprint cell is BLOCKED (impassable), not
 * FLOORLESS the way a hole is; the floor tile still belongs there, it's
 * just flagged. `preview3d/DungeonPreview3D.tsx` renders that distinction
 * separately (a dimmed/darkened overlay on top of the ordinary floor
 * tile, not an omitted one) — see its own doc comment. A hole, by
 * contrast, genuinely has no floor tile at all, matching the existing
 * edit-mode `doc.holes` treatment this module reuses verbatim.
 *
 * See TARGET-YAML.md's "canvas:" section for this semantic recorded
 * as a dialect note, not just left as an implementation detail here.
 */
import { isCellOccupied } from '../boardGeometry';
import type { DungeonDoc } from '../dungeonYaml';
import { DEFAULT_CANVAS } from './emptyCanvasDoc';

/** Every `[col, row]` cell inside `doc.canvas`'s bounds (or
 * `DEFAULT_CANVAS` when the document carries none, matching
 * `CreationBoard.tsx`'s own fallback), minus `doc.holes`. Order is
 * column-major, row-minor — not spatially meaningful, callers only need
 * the set. */
export function deriveCanvasFloorCells(
  doc: Pick<DungeonDoc, 'canvas' | 'holes'>
): [number, number][] {
  const grid = doc.canvas ?? DEFAULT_CANVAS;
  const holeSet = new Set(doc.holes.map(([c, r]) => `${c},${r}`));
  const cells: [number, number][] = [];
  for (let col = 0; col < grid.width; col++) {
    for (let row = 0; row < grid.height; row++) {
      if (holeSet.has(`${col},${row}`)) continue;
      cells.push([col, row]);
    }
  }
  return cells;
}

/**
 * The ONE placement-legality rule for a top-level (`doc.place`,
 * `roomId: null`) placement on the creation canvas — rpg-project#169's
 * creation-3D-editing unit. Returns a human-readable reject reason, or
 * `null` when `(col, row)` is a legal target.
 *
 * **Written to be the single source both the 2D brush
 * (`CreationBoard.tsx`'s click-to-place) and the 3D click-to-place layer
 * (`preview3d/DungeonPreview3D.tsx`, once wired) consult** — the two views
 * must never disagree about where a click is legal. Before this unit,
 * NEITHER actually enforced this: `CreationBoard.tsx`'s own
 * `handlePointerDown` called `edit.handlePlace(null, cell)` straight off
 * `nearestCreationCell` with no occupied/footprint/hole check at all (a
 * real, verified gap this unit closes at the root, not just in 3D — see
 * CONTRACT.md's ledger entry for this unit).
 *
 * Three gates, checked in order:
 * 1. **Real canvas floor** — in `doc.canvas`'s bounds (or
 *    `DEFAULT_CANVAS`) and not a hole, the exact same test
 *    `deriveCanvasFloorCells` applies (not re-derived as a Set lookup
 *    here, since callers building many cells at once already have that
 *    set cheaply from `deriveCanvasFloorCells` itself — this per-cell
 *    check exists for the 2D brush's single-click case, where building
 *    the whole floor set just to check one cell would be wasted work).
 * 2. **Not a straight-wall (`doc.wallLines`) footprint cell** — Kirk's
 *    rule ("any hex that is not 100% uncovered would not be traversable")
 *    makes a footprint cell BLOCKED, not floorless: the floor tile still
 *    renders (`deriveCanvasFloorCells` doesn't exclude it), but it isn't a
 *    legal placement target. `wallLineFootprint` is a caller-supplied set
 *    (`creation/straightWallGeometry.ts`'s `straightWallsFootprintSet`)
 *    rather than recomputed here, so a caller checking many cells (the 3D
 *    click layer, once wired) computes it once, not once per cell.
 * 3. **Not already occupied** — `boardGeometry.ts`'s `isCellOccupied`,
 *    called with no `floorPlan` (a from-scratch canvas has none — see
 *    `isCellOccupied`'s own doc comment for why that's safe: its
 *    room-scoped loop is a no-op for `doc.rooms === []` regardless, and
 *    the top-level `doc.place` loop this actually needs never depended on
 *    `floorPlan` in the first place).
 */
export function canvasPlacementRejectReason(
  doc: DungeonDoc,
  col: number,
  row: number,
  wallLineFootprint: ReadonlySet<string>
): string | null {
  const grid = doc.canvas ?? DEFAULT_CANVAS;
  const inBounds =
    col >= 0 && col < grid.width && row >= 0 && row < grid.height;
  const isHole = doc.holes.some(([c, r]) => c === col && r === row);
  if (!inBounds || isHole) {
    return 'No floor there — off the canvas, or a hole.';
  }
  if (wallLineFootprint.has(`${col},${row}`)) {
    return "That cell is blocked by a straight wall's footprint — pick an uncovered cell.";
  }
  if (isCellOccupied(undefined, doc, col, row)) {
    return 'That cell already holds a placement.';
  }
  return null;
}
