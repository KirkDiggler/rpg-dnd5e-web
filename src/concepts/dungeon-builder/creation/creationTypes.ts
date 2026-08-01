/**
 * creationTypes — the data model for the "New Dungeon" creation flow
 * (Kirk's day-one pitch, 2026-08-01: "20x30 room -> 2d top down board ->
 * draw the walls in place -> start here, end there -> add door here,
 * monster there, reaper statue there facing this way -> load up and
 * play"). This is entirely client-side, invented vocabulary — dungeonspec
 * cannot express drawn walls, freeform room shapes, an explicit start/end,
 * or facing today (design.md defers wall/shape authoring to P4+). See
 * CONTRACT.md's "Proposed schema from the creation flow" section — this
 * file's shapes ARE that proposal, kept separate from `dungeonYaml.ts`'s
 * real dungeonspec types on purpose (concepts-route.md's own rule: where
 * the wire doesn't carry something, keep it in a clearly separated type).
 */

/** A rectangular canvas of cells, addressed [col,row] like dungeonspec's
 * own `place: {at: [col,row]}` — same addressing convention, deliberately,
 * so a future real implementation doesn't need a second coordinate
 * system. Unlike edit mode's FloorPlan (a chain of fixed-width rooms),
 * creation mode is ONE freeform canvas walls carve into rooms. */
export interface CreationGrid {
  width: number;
  height: number;
}

export const DEFAULT_GRID: CreationGrid = { width: 20, height: 30 };

/** Internal edge between two orthogonally adjacent cells. `h:c,r` is the
 * edge BELOW cell (c,r) (shared with (c,r+1)); `v:c,r` is the edge RIGHT
 * of cell (c,r) (shared with (c+1,r)). The canvas perimeter is an
 * always-on boundary, not a member of this set — only internal edges are
 * toggleable, matching "carve the space into rooms" (you start inside a
 * bounded room and cut it up, you don't have to draw the outer walls). */
export type EdgeKey = string;

export function hEdgeKey(col: number, row: number): EdgeKey {
  return `h:${col},${row}`;
}
export function vEdgeKey(col: number, row: number): EdgeKey {
  return `v:${col},${row}`;
}

export type WallKind = 'solid' | 'door';

export interface Placement {
  id: string;
  kind: 'prop' | 'monster';
  ref: string;
  at: [number, number];
  /** Index into the SAME 6-direction hex-facing convention already
   * defined in authorGridHelpers.ts (`HEX_FACING_LABELS`), reused rather
   * than inventing a parallel 4/8-direction compass for this rectangular
   * canvas — see CONTRACT.md's "facing" finding for the tension that
   * creates (a rectangular grid doesn't map 1:1 onto 6 hex directions,
   * but reusing the one real convention in the codebase beats inventing
   * a second, incompatible one). `null` = unset/default. */
  facing: number | null;
}

export type Tool = 'wall' | 'door' | 'start' | 'end' | 'select';

export interface CreationState {
  grid: CreationGrid;
  walls: Map<EdgeKey, WallKind>;
  start: [number, number] | null;
  end: [number, number] | null;
  placements: Placement[];
  selectedPlacementId: string | null;
}

export function emptyCreationState(
  grid: CreationGrid = DEFAULT_GRID
): CreationState {
  return {
    grid,
    walls: new Map(),
    start: null,
    end: null,
    placements: [],
    selectedPlacementId: null,
  };
}
