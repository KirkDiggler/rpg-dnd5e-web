/**
 * hexCorner — corner-lattice addressing for straight-wall (`wallLines:`)
 * endpoints (rpg-project#169's "corner-anchored straight walls" unit).
 *
 * Straight walls used to anchor `from`/`to` at cell CENTERS
 * (`straightWallGeometry.ts`'s original shape). Kirk's live feedback
 * drawing them: "I could not get the edges quite right... it always
 * hangs over a little." That hangover isn't a bug in the clipping math —
 * it's the anchor lattice being too coarse: a wall meant to stop at a
 * room's boundary can only ever start/end at whichever cell's CENTER is
 * nearest that boundary, so it always overshoots by up to half a hex at
 * each end, by construction, no matter how carefully it's drawn. Fine
 * tuning was equally impossible for the same reason — there was no finer
 * lattice to fine-tune INTO.
 *
 * The fix: anchor `from`/`to` at hex CORNERS instead — the finest lattice
 * this hex grid actually has (a corner is where a real wall run's own
 * boundary lives; `hexEdgeBetween`'s edge geometry is already
 * corner-to-corner). A corner is where a hex wall belongs; a cell center
 * never was.
 *
 * **Dedup convention.** Every interior corner is shared by exactly 3 hex
 * cells (an edge/canvas-boundary corner by 1 or 2) — verified directly
 * (`hexCorner.test.ts`'s `cornerOwners` cases), not assumed. So the same
 * real-world point has up to 3 equally valid `{cell, corner}`
 * representations, and two authors (or the same wallLine's own from/to
 * drawn from either side) need to serialize the SAME physical corner
 * IDENTICALLY for equality/hit-testing to work without a geometry
 * comparison every time. The rule: **canonical = the owner with the
 * lexicographically smallest `[col, row]`** (ties broken by the smaller
 * corner index, though two owners never share a cell in practice).
 * Candidates are restricted to `col >= 0 && row >= 0` — a corner's
 * off-grid geometric owner (e.g. `col: -1` at the canvas edge) is a real
 * point-of-agreement mathematically but not a cell any author could have
 * drawn from, so it's never eligible to BE the canonical address (see
 * `cornerOwners`'s own doc comment for why no upper bound is needed).
 *
 * **Dependency-free of `boardGeometry.ts`, deliberately.** This module
 * sits BELOW `dungeonYaml.ts` in the dependency graph — `parseDungeon`
 * calls `migrateLegacyCenterEndpoint` at parse time — while
 * `boardGeometry.ts` sits ABOVE `dungeonYaml.ts` (it imports
 * `resolvePlacement`/`DungeonDoc` from there). Importing
 * `boardGeometry.ts`'s own `neighborCell` here would create
 * `dungeonYaml.ts -> hexCorner.ts -> boardGeometry.ts -> dungeonYaml.ts`,
 * an import cycle that crashes with "Cannot access ... before
 * initialization" under Vite's ESM interop — hit directly while building
 * this, not theorized. `neighborCell` below is a small, deliberate
 * duplication of `boardGeometry.ts`'s own version, built from the same
 * lower-level primitives, to keep this module leaf-level.
 */
import { facingDirection } from '@/components/hex-grid/authorGridHelpers';
import {
  BOARD_HEX_SIZE,
  cellCenter,
  cellCorners,
  cubeAtColRow,
  hexColumn,
  hexRow,
  worldToCube,
  type CellPos,
} from '../hexLayout';
import type { CreationGrid } from './creationTypes';

/** Duplicated from `boardGeometry.ts`'s own `neighborCell` — see this
 * module's header comment for why it can't just import that one.
 * Exported (wallLines->edges projection unit, rpg-project#169) so
 * `straightWallGeometry.ts`/`creationGeometry.ts` can use THIS copy
 * instead of `boardGeometry.ts`'s — those two files sit BELOW
 * `dungeonYaml.ts` too (both leaf-computable pure geometry, no doc-shape
 * awareness), so importing `boardGeometry.ts` from either one for a
 * single function was already the same class of mistake this module's
 * own header comment names: `dungeonYaml.ts -> straightWallGeometry.ts ->
 * boardGeometry.ts -> dungeonYaml.ts` is a real, crashing cycle,
 * necessary the moment `dungeonYaml.ts`'s own `stripToV1Subset` needs to
 * call `straightWallFootprint`/`straightWallCrossedEdges` directly to
 * project `wallLines:` into wire `walls:` edges. Redirecting both
 * consumers to this already-duplicated, already-leaf copy severs that
 * path at its root instead of adding a THIRD duplicate. */
export function neighborCell(
  col: number,
  row: number,
  facing: number
): { col: number; row: number } {
  const here = cubeAtColRow(col, row);
  const dir = facingDirection(facing);
  const there = { x: here.x + dir.x, y: here.y + dir.y, z: here.z + dir.z };
  return { col: hexColumn(there), row: hexRow(there) };
}

/** One (cell, corner-index) address of a hex-lattice vertex. `corner` is
 * 0-5, matching `hexCorners`' own `30° + 60°·i` convention
 * (`hexMath.ts`) — the SAME indexing every hex-corner consumer in this
 * codebase already uses, not a new convention. */
export interface CornerRef {
  cell: [number, number];
  corner: number;
}

/** Two floating-point evaluations of the exact same real corner (via
 * `cubeToWorld`'s trig) agree to ~1e-13 at this board's scale (verified
 * elsewhere in this concept — `straightWallGeometry.ts`'s own
 * `FOOTPRINT_EPSILON` doc comment) — this is several orders of magnitude
 * looser than that, just tight enough to never confuse two DIFFERENT
 * corners (which sit `BOARD_HEX_SIZE`-scale board units apart) while
 * comfortably absorbing trig noise. */
const CORNER_MATCH_EPSILON = 1e-6;

function normalizeCornerIndex(i: number): number {
  return ((i % 6) + 6) % 6;
}

/** The board-space world point `ref` addresses. */
export function cornerPoint(ref: CornerRef): CellPos {
  const corners = cellCorners(
    cellCenter(ref.cell[0], ref.cell[1]),
    BOARD_HEX_SIZE
  );
  const p = corners[normalizeCornerIndex(ref.corner)];
  return { x: p[0], y: p[1] };
}

/**
 * Every `{cell, corner}` pair whose corner point coincides with `ref`'s
 * own — geometric neighbors only (`ref.cell` plus its up to 6 hex
 * neighbors, the only cells that CAN share a vertex with it), restricted
 * to `col >= 0 && row >= 0`. No upper bound is needed: canonicalization
 * always picks the SMALLEST `[col, row]`, and a candidate with a larger
 * coordinate can never win that comparison regardless of any grid
 * width/height — the only coordinates that need excluding are negative
 * ones, which WOULD otherwise wrongly win by being "smaller."
 */
export function cornerOwners(ref: CornerRef): CornerRef[] {
  const target = cornerPoint(ref);
  const candidateCells: [number, number][] = [ref.cell];
  for (let f = 0; f < 6; f++) {
    const n = neighborCell(ref.cell[0], ref.cell[1], f);
    candidateCells.push([n.col, n.row]);
  }
  const owners: CornerRef[] = [];
  const seen = new Set<string>();
  for (const [col, row] of candidateCells) {
    if (col < 0 || row < 0) continue;
    const key = `${col},${row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const corners = cellCorners(cellCenter(col, row), BOARD_HEX_SIZE);
    corners.forEach((p, ci) => {
      if (Math.hypot(p[0] - target.x, p[1] - target.y) < CORNER_MATCH_EPSILON) {
        owners.push({ cell: [col, row], corner: ci });
      }
    });
  }
  return owners;
}

/** The one canonical `{cell, corner}` representation of the point `ref`
 * addresses — see this module's own header comment for the exact rule.
 * Always returns at least `ref` itself (canonicalized), since `ref.cell`
 * is always one of its own owners. */
export function canonicalCorner(ref: CornerRef): CornerRef {
  const normalized: CornerRef = {
    cell: ref.cell,
    corner: normalizeCornerIndex(ref.corner),
  };
  const owners = cornerOwners(normalized);
  let best = owners[0] ?? normalized;
  for (const o of owners) {
    if (
      o.cell[0] < best.cell[0] ||
      (o.cell[0] === best.cell[0] &&
        (o.cell[1] < best.cell[1] ||
          (o.cell[1] === best.cell[1] && o.corner < best.corner)))
    ) {
      best = o;
    }
  }
  return best;
}

/** Two `CornerRef`s addressing the identical real-world point, regardless
 * of which of their (up to 3) equally-valid owner cells each happens to
 * use — the equality a raw `{cell,corner}` deep-equal can't give across
 * differently-chosen (but physically identical) owners. Compares
 * canonical forms rather than world points directly so this stays exact
 * (integer/tuple comparison) instead of an epsilon-tolerant float
 * comparison at every call site. */
export function sameCorner(a: CornerRef, b: CornerRef): boolean {
  const ca = canonicalCorner(a);
  const cb = canonicalCorner(b);
  return (
    ca.cell[0] === cb.cell[0] &&
    ca.cell[1] === cb.cell[1] &&
    ca.corner === cb.corner
  );
}

function inBoundsGrid(col: number, row: number, grid: CreationGrid): boolean {
  return col >= 0 && col < grid.width && row >= 0 && row < grid.height;
}

/**
 * Nearest corner-lattice point to a board-space point, canonicalized —
 * what drawing a new wallLine or dragging an existing endpoint handle
 * snaps to. The nearest CELL (clamped to the canvas) anchors the search;
 * that cell's own 6 corners plus its neighbors' cells' corners are
 * checked by real distance, not just "the nearest cell's own corners" —
 * a point near a cell boundary can have its TRUE nearest corner belong
 * to a neighboring cell first.
 */
export function nearestCorner(point: CellPos, grid: CreationGrid): CornerRef {
  const cube = worldToCube(point);
  const col0 = Math.max(0, Math.min(grid.width - 1, hexColumn(cube)));
  const row0 = Math.max(0, Math.min(grid.height - 1, hexRow(cube)));
  const candidateCells: [number, number][] = [[col0, row0]];
  for (let f = 0; f < 6; f++) {
    const n = neighborCell(col0, row0, f);
    candidateCells.push([n.col, n.row]);
  }
  let best: CornerRef = { cell: [col0, row0], corner: 0 };
  let bestDistSq = Infinity;
  for (const [col, row] of candidateCells) {
    if (!inBoundsGrid(col, row, grid)) continue;
    const corners = cellCorners(cellCenter(col, row), BOARD_HEX_SIZE);
    corners.forEach((p, ci) => {
      const d = (p[0] - point.x) ** 2 + (p[1] - point.y) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        best = { cell: [col, row], corner: ci };
      }
    });
  }
  return canonicalCorner(best);
}

/**
 * Parse-time migration for a PRE-corner-anchoring `wallLines:` endpoint
 * (`from`/`to` was a bare `[col, row]` cell — the original rpg-project#169
 * shape). Self-heals to the corner-anchored shape: picks whichever of
 * `cell`'s own 6 corners sits closest to `otherEndpointPoint` (the OTHER
 * end of the same line, already resolved to a world point) — the
 * migrated line keeps pointing the same direction it always drew,
 * rather than snapping to an arbitrary corner. See TARGET-YAML.md's
 * "Straight walls: corner anchoring" section for the full migration
 * writeup.
 */
export function migrateLegacyCenterEndpoint(
  cell: [number, number],
  otherEndpointPoint: CellPos
): CornerRef {
  const corners = cellCorners(cellCenter(cell[0], cell[1]), BOARD_HEX_SIZE);
  let bestIdx = 0;
  let bestDistSq = Infinity;
  corners.forEach((p, i) => {
    const d =
      (p[0] - otherEndpointPoint.x) ** 2 + (p[1] - otherEndpointPoint.y) ** 2;
    if (d < bestDistSq) {
      bestDistSq = d;
      bestIdx = i;
    }
  });
  return canonicalCorner({ cell, corner: bestIdx });
}
