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
 *
 * **v0.3 wire consumption (this unit, 2026-08-05)**: `deriveCanvasFloorCells`
 * above is now the FALLBACK, not the only source — `resolveCanvasFloor`
 * below prefers a live `FloorPlan.floor_cells` (rpg-api-protos v0.1.120,
 * spec.md §4.5.9) the moment a real response carries one. See
 * `resolveCanvasFloor`'s own doc comment for the rollout discipline (spec
 * §1 group (c) is not shipped server-side yet, so this path is dormant
 * against every live server today — verified by the
 * rpg-api-protos#214 conformance review's finding A4).
 */
import type {
  FloorPlan,
  FloorPlanCell,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { isCellOccupied } from '../boardGeometry';
import type { DungeonDoc } from '../dungeonYaml';
import { DEFAULT_CANVAS } from './emptyCanvasDoc';

export type Cell = [number, number];

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

/** Ascending lexicographic `(column, row)` — the wire's own declared
 * order for both `FloorPlan.floor_cells` and `FloorPlanRegion.cells`
 * (rpg-api-protos v0.1.120's own field comments: "producers emit cells in
 * ascending lexicographic (column, row) order"). `deriveCanvasFloorCells`
 * above happens to already produce this order today (its column-major
 * outer loop with an increasing-row inner loop IS ascending lexicographic
 * whenever there are no holes to filter out — the hole filter only ever
 * removes entries, never reorders the survivors), but its own doc comment
 * explicitly does NOT promise that ("not spatially meaningful") — so any
 * caller that needs to compare a wire cell list against a derived one
 * (rpg-api-protos#214 conformance review, finding A5) normalizes BOTH
 * sides through this function first rather than relying on the
 * coincidence. Used both by `resolveCanvasFloor` below (so its returned
 * cell list has one canonical order regardless of which source produced
 * it) and by this concept's tests. */
export function sortCellsLexicographic(cells: readonly Cell[]): Cell[] {
  return [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function floorPlanCellToTuple(cell: FloorPlanCell): Cell {
  return [cell.column, cell.row];
}

export type CanvasFloorSource = 'server' | 'derived';

export interface ResolvedCanvasFloor {
  /** Ascending-lexicographic-normalized (see `sortCellsLexicographic`),
   * regardless of source. */
  cells: Cell[];
  source: CanvasFloorSource;
}

/**
 * Chooses the creation canvas's floor cell set: the wire's own
 * `FloorPlan.floor_cells` (rpg-api-protos v0.1.120, spec.md §4.5.9) when a
 * live response carries a non-empty one, `deriveCanvasFloorCells` (this
 * file, client-derived from `doc.canvas` bounds minus `doc.holes`)
 * otherwise.
 *
 * **Rollout discipline (rpg-api-protos#214 conformance review, finding
 * A4)**: canvas mode (spec.md §1 group (c), rpg-project#192) is not
 * shipped server-side yet, and the client's own live capability probe
 * records `canvas` as decode-unknown as of 2026-08-04
 * (`capabilityProbe.ts`) — so an empty `floor_cells` from a REAL server
 * today means "the producer hasn't shipped this," never "the document
 * declares an empty floor." Gating on non-empty rather than on
 * `floorPlan !== null` is exactly what keeps this fallback-safe: a live
 * server that's reachable and answering, but pre-Wave-0, produces a
 * `FloorPlan` with `floorCells: []` (the field's zero value, same as an
 * unset repeated field), which this function treats identically to no
 * `floorPlan` at all — never an empty rendered floor.
 *
 * Does not itself validate `floorPlan.width`/`floorPlan.height` against
 * `doc.canvas` — `floor_cells` is a complete, self-describing absolute
 * cell list per its own field comment ("clients MUST render this list,
 * not infer floor from width and height"), so this function needs nothing
 * else from the response to be correct. (`FloorPlan.height`'s canvas-mode
 * meaning is independently ambiguous on the wire today — conformance
 * review finding A1 — one more reason not to lean on it here.)
 */
export function resolveCanvasFloor(
  doc: Pick<DungeonDoc, 'canvas' | 'holes'>,
  floorPlan: FloorPlan | null
): ResolvedCanvasFloor {
  if (floorPlan && floorPlan.floorCells.length > 0) {
    return {
      cells: sortCellsLexicographic(
        floorPlan.floorCells.map(floorPlanCellToTuple)
      ),
      source: 'server',
    };
  }
  return {
    cells: sortCellsLexicographic(deriveCanvasFloorCells(doc)),
    source: 'derived',
  };
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
 *    Applies regardless of `requiresStandable` — a footprint cell still
 *    has a floor tile (see gate 2's own note), but a hole or an
 *    off-canvas cell has none at all, for ANY kind of placement.
 * 2. **Not a straight-wall (`doc.wallLines`) footprint cell — PLACEABLE
 *    vs. STANDABLE split** (`requiresStandable`, rpg-project#169's "props
 *    on footprint cells" unit — Kirk's exact ask: a bookcase standing
 *    against a drawn wall — refined by the coverage-based-standability
 *    live design round, same day: "if you can say we won't clip we can
 *    go on those squares... the small triangles on the edge we could
 *    prob allow those to be placed on"). The ORIGINAL binary rule ("any
 *    hex that is not 100% uncovered would not be traversable") is
 *    retired for STANDING purposes: `wallLineFootprint` here is expected
 *    to be the COVERAGE-FILTERED subset
 *    (`creation/straightWallGeometry.ts`'s `standableFootprintKeys`,
 *    cells at/above `STANDABLE_COVERAGE_THRESHOLD`), not every cell the
 *    wall merely touches — a lightly-clipped cell is real, standable
 *    floor again. The floor tile itself is always there regardless
 *    (`deriveCanvasFloorCells` never excludes a footprint cell, clipped
 *    lightly or fully), and nothing about the rule ever said a prop
 *    can't rest against/on the wall that covers it. `requiresStandable`
 *    names which of the two a given placement needs: `true` for anything
 *    that must be able to stand there (monsters, boss — a creature
 *    genuinely occupying the cell), `false` for a prop (decor, furniture
 *    — placeable on any real floor cell, footprint included, at ANY
 *    coverage). This gate is SKIPPED entirely when `requiresStandable` is
 *    `false`; every other gate still applies (a prop still needs real
 *    floor and an unoccupied cell). Start/end markers are deliberately
 *    NOT routed through this function at all — they keep their own
 *    pre-existing, different treatment (a retroactive "⚠ START
 *    (BLOCKED!)" flag on an already-placed marker, never a placement-time
 *    reject — see `CreationBoard.tsx`'s own "flag, never silently delete
 *    or move" rendering and TARGET-YAML.md's "Interactions with
 *    everything else" section), so this parameter only ever needs to
 *    distinguish prop from creature, not a third case. `wallLineFootprint`
 *    is a caller-supplied set rather than recomputed here, so a caller
 *    checking many cells (the 3D click layer) computes it once, not once
 *    per cell — which specific set (raw vs. coverage-filtered) is the
 *    caller's own choice; every current caller passes the
 *    coverage-filtered one.
 * 3. **Not already occupied** — `boardGeometry.ts`'s `isCellOccupied`,
 *    called with no `floorPlan` (a from-scratch canvas has none — see
 *    `isCellOccupied`'s own doc comment for why that's safe: its
 *    room-scoped loop is a no-op for `doc.rooms === []` regardless, and
 *    the top-level `doc.place` loop this actually needs never depended on
 *    `floorPlan` in the first place). Applies regardless of
 *    `requiresStandable` — a footprint cell holding a bookcase is a
 *    legal target for a SECOND prop only in the same sense any other
 *    occupied cell is (it isn't; stack elsewhere), no different rule for
 *    footprint cells specifically.
 */
export function canvasPlacementRejectReason(
  doc: DungeonDoc,
  col: number,
  row: number,
  wallLineFootprint: ReadonlySet<string>,
  requiresStandable: boolean
): string | null {
  const grid = doc.canvas ?? DEFAULT_CANVAS;
  const inBounds =
    col >= 0 && col < grid.width && row >= 0 && row < grid.height;
  const isHole = doc.holes.some(([c, r]) => c === col && r === row);
  if (!inBounds || isHole) {
    return 'No floor there — off the canvas, or a hole.';
  }
  if (requiresStandable && wallLineFootprint.has(`${col},${row}`)) {
    return "That cell is blocked by a straight wall's footprint — pick an uncovered cell.";
  }
  if (isCellOccupied(undefined, doc, col, row)) {
    return 'That cell already holds a placement.';
  }
  return null;
}
