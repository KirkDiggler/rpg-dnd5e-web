/**
 * creationTypes — geometry primitives for the "New Dungeon" freeform
 * canvas. Used to also hold the whole `CreationState` data model
 * (`Placement`, `Tool`, a bespoke `WallKind`, the state shape itself) —
 * that's gone now that creation mode authors onto the SAME `DungeonDoc`/
 * CST edit mode does (CONTRACT.md's "unifying New Dungeon onto the
 * shared CST" section). What's left is pure edge-addressing math
 * `creationGeometry.ts` still needs, kept separate from `dungeonYaml.ts`
 * because it's about hit-testing a rectangular canvas, not about the
 * document shape.
 */

/** A rectangular canvas of cells, addressed [col,row] like dungeonspec's
 * own `place: {at: [col,row]}` — same addressing convention, deliberately,
 * so a from-scratch canvas needs no second coordinate system. Unlike edit
 * mode's FloorPlan (a chain of fixed-width rooms), creation mode is ONE
 * freeform canvas walls carve into rooms. */
export interface CreationGrid {
  width: number;
  height: number;
}

/** An internal edge is the shared boundary between two hex-adjacent cells
 * — HEX-TRUE since 2026-08-03 (`creationGeometry.ts`'s own header
 * comment), so a cell has up to 6 of these, not the 4 (h/v) a square grid
 * would have. The canvas perimeter is an always-on boundary, not a member
 * of this set — only internal edges are toggleable, matching "carve the
 * space into rooms" (you start inside a bounded region and cut it up, you
 * don't have to draw the outer walls). Geometry-only — the actual
 * authored wall lives in `doc.walls` (`WallDoc[]`, dungeonYaml.ts),
 * addressed by `from`/`to` cells directly. */
