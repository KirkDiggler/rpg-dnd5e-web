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
