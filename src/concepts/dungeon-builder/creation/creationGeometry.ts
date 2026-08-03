/**
 * creationGeometry — pure position/hit-testing math for the creation
 * board. Kept separate from rendering per the same split as
 * `boardGeometry.ts`/`Board.tsx`.
 *
 * **HEX-TRUE (2026-08-03)**: this used to be a flat rectangular-canvas
 * renderer's own geometry (`FLAT_COL_SPACING`/`FLAT_ROW_SPACING`, an
 * axis-aligned dx-vs-dy pick between a horizontal/vertical edge) — see
 * `hexLayout.ts`'s own header comment for Kirk's diagnosis of why that
 * was wrong (a square grid only draws 4 of a hex's 6 real adjacencies,
 * and produces disconnected "vertical blinds" wall segments instead of a
 * continuous run). This module now builds every position from the SAME
 * hex math the compiled edit-mode board renders with (`hexLayout.ts`'s
 * `cellCenter`/`edgeBetweenCells`/`worldToCube`, `boardGeometry.ts`'s
 * `neighborCell`) — one coordinate space for both boards. The canvas
 * dimension semantics (a `{width,height}` grid of `[col,row]` cells,
 * `CreationGrid`) are UNCHANGED; only the geometry each `[col,row]`
 * resolves to is different.
 *
 * A hex cell has 6 edges, not 4 — `EdgeGeometry` below is keyed by a
 * canonical `cellA`/`cellB` pair (see `canonicalHexEdge`'s own doc
 * comment) rather than an 'h'/'v' orientation tag, which had no hex
 * analog once a cell stopped having exactly two edge orientations.
 */
import { neighborCell } from '../boardGeometry';
import {
  BOARD_HEX_SIZE,
  cellCenter,
  cellCorners,
  edgeBetweenCells,
  hexColumn,
  hexRow,
  worldToCube,
  type CellPos,
} from '../hexLayout';
import type { Cell } from '../regionGeometry';
import { type CreationGrid } from './creationTypes';

export function creationCellCenter(col: number, row: number): CellPos {
  return cellCenter(col, row);
}

/** The hex polygon (as SVG-ready `[x,y]` pairs) for one canvas cell —
 * used by `CreationBoard.tsx` for the base grid, region overlays, and
 * hole markers, all of which used to draw an axis-aligned `<rect>`. */
export function creationCellPolygon(
  col: number,
  row: number,
  size: number = BOARD_HEX_SIZE - 1.5
): [number, number][] {
  return cellCorners(cellCenter(col, row), size);
}

export interface EdgeGeometry {
  cellA: [number, number];
  cellB: [number, number];
  a: CellPos;
  b: CellPos;
  mid: CellPos;
}

function inBounds(col: number, row: number, grid: CreationGrid): boolean {
  return col >= 0 && col < grid.width && row >= 0 && row < grid.height;
}

/** The edge between `(col,row)` and its `facing` (0-5) neighbor, in the
 * ONE canonical `cellA`/`cellB` order regardless of which of the two
 * cells this call started from — matching `dungeonYaml.ts`'s
 * `wallIndexAtEdge` contract ("callers are responsible for passing
 * from/to in ONE canonical order"; it does not check the reverse
 * pairing). Facings 0-2 (E, NE, NW) are treated as PRIMARY: `cellA =
 * (col,row)`, `cellB = neighbor`. Facings 3-5 (W, SW, SE) are the exact
 * same three physical edges seen from the opposite cell (facing `f` and
 * `f-3` are opposite directions — `authorGridHelpers.ts`'s
 * `HEX_DIRECTIONS`), so they're normalized to their primary form
 * (`cellA = neighbor`, `cellB = (col,row)`) instead of being treated as
 * three more distinct edges — a hex cell has 6 neighbor directions but
 * only 3 distinct edges shared with THIS cell's own 6 neighbors once
 * both sides collapse to one canonical form. */
export function canonicalHexEdge(
  col: number,
  row: number,
  facing: number
): EdgeGeometry {
  const n = neighborCell(col, row, facing);
  const [cellA, cellB]: [[number, number], [number, number]] =
    facing < 3
      ? [
          [col, row],
          [n.col, n.row],
        ]
      : [
          [n.col, n.row],
          [col, row],
        ];
  const edge = edgeBetweenCells(cellA[0], cellA[1], cellB[0], cellB[1]);
  return { cellA, cellB, a: edge.a, b: edge.b, mid: edge.mid };
}

/** A stored wall's own line geometry, from its `from`/`to` cells directly
 * — no orientation to detect (unlike the square predecessor's
 * `wallGeometry`, which had to sniff h-vs-v from the coordinate delta):
 * `edgeBetweenCells` takes any two adjacent cells as-is. */
export function wallGeometry(
  from: [number, number],
  to: [number, number]
): EdgeGeometry {
  const edge = edgeBetweenCells(from[0], from[1], to[0], to[1]);
  return { cellA: from, cellB: to, a: edge.a, b: edge.b, mid: edge.mid };
}

function pointToSegmentDistSq(p: CellPos, a: CellPos, b: CellPos): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return (p.x - cx) ** 2 + (p.y - cy) ** 2;
}

/**
 * Nearest hex edge to a board-space point — used to resolve a wall/door
 * click or drag. Nearest CELL is found in O(1) via the real inverse hex
 * transform (`worldToCube`), then whichever of that cell's (up to) 6
 * edges is nearest by real point-to-segment distance wins — cheap enough
 * to run on every pointer-move (at most 6 segment-distance checks, never
 * a scan over the grid's full edge set).
 *
 * Only INTERNAL edges (both cells inside `grid`) are returned — the same
 * "canvas perimeter is an always-on boundary, not togglable" rule the
 * square predecessor used (`creationTypes.ts`'s own doc comment), now
 * expressed as a hex bounds check on the neighbor cell instead of a
 * col/row range clamp.
 *
 * **No dx-vs-dy orientation heuristic is needed here, unlike the square
 * predecessor** — and that's not an oversight, it's the actual fix for
 * the bug `lockOrientation` existed to paper over. The square version's
 * crenellated-comb bug (CONTRACT.md's wall-interaction finding) came from
 * comparing a point's fractional offset within ONE cell along two
 * independent axes (dx, dy) and picking whichever was larger — a
 * comparison that flips mid-cell, at a point with no relationship to any
 * real edge boundary, producing a disconnected tooth. A hex cell's 6
 * "nearest to this edge" regions instead TILE the cell with shared
 * boundaries at the corners themselves (verified numerically while
 * building this: sampling points along a straight world-space line and
 * calling this function at each one produces a sequence of edges where
 * every consecutive pair shares a real corner, for a plain nearest-edge
 * pick with no lock at all — see this unit's PR description for the
 * check). `lockFamily` below still exists, but for a different, weaker
 * reason than the square lock had: not to prevent disconnection (nothing
 * here can produce a gap), but to hold a long stroke to one deliberate
 * "which of the 3 parallel-edge families" choice so it can't drift onto
 * an unrelated third family over a long drag.
 */
export function nearestEdge(
  point: CellPos,
  grid: CreationGrid,
  lockFamily?: 0 | 1 | 2
): EdgeGeometry | null {
  const cube = worldToCube(point);
  const col = hexColumn(cube);
  const row = hexRow(cube);
  if (!inBounds(col, row, grid)) return null;

  let best: EdgeGeometry | null = null;
  let bestDist = Infinity;
  for (let facing = 0; facing < 6; facing++) {
    if (lockFamily !== undefined && facing % 3 !== lockFamily) continue;
    const n = neighborCell(col, row, facing);
    if (!inBounds(n.col, n.row, grid)) continue;
    const edge = canonicalHexEdge(col, row, facing);
    const d = pointToSegmentDistSq(point, edge.a, edge.b);
    if (d < bestDist) {
      bestDist = d;
      best = edge;
    }
  }
  return best;
}

// The screen-space direction of each of the 3 parallel-edge families,
// computed once from the SAME `canonicalHexEdge`/`edgeBetweenCells`
// geometry every wall segment renders with (a real derivation, not a
// hand-typed angle table). Translation-invariant — a hex grid's 6
// neighbor directions don't depend on which cell you start from, so
// deriving all 3 from cell (0,0) gives the same 3 angles anywhere on the
// canvas.
const FAMILY_EDGE_ANGLE: readonly [number, number, number] = (() => {
  const angleOf = (facing: 0 | 1 | 2) => {
    const e = canonicalHexEdge(0, 0, facing);
    return Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x);
  };
  return [angleOf(0), angleOf(1), angleOf(2)];
})();

/**
 * Which of the 3 edge families (0/1/2) a drag vector most likely
 * intends — the family whose own edge LINE is most nearly PARALLEL to
 * the drag (tracing a wall means dragging roughly along it, the same
 * "which way is the user tracing" question the square predecessor's
 * `Math.abs(dx) >= Math.abs(dy)` answered for its 2 axes, generalized to
 * hex's 3). `CreationBoard.tsx` calls this once, at the drag's
 * direction-lock threshold, and holds the result for the rest of the
 * stroke via `nearestEdge`'s `lockFamily`.
 */
export function dragFamily(dx: number, dy: number): 0 | 1 | 2 {
  const dragAngle = Math.atan2(dy, dx);
  let best: 0 | 1 | 2 = 0;
  let bestScore = Infinity;
  for (const f of [0, 1, 2] as const) {
    // Circular distance mod PI — an edge is an undirected LINE, so an
    // angle and its +180° opposite are the same orientation.
    let d = Math.abs(dragAngle - FAMILY_EDGE_ANGLE[f]) % Math.PI;
    d = Math.min(d, Math.PI - d);
    if (d < bestScore) {
      bestScore = d;
      best = f;
    }
  }
  return best;
}

/**
 * Traces the connected sequence of hex edges a straight world-space drag
 * from `from` to `to` would draw — samples points along the segment and
 * calls `nearestEdge` at each one, deduping consecutive repeats. Used by
 * `demoScript.ts` to derive a REAL, connected wall run programmatically
 * (via this same function a live drag uses) rather than hand-transcribing
 * `[col,row]` pairs that a hex-true board might not actually connect —
 * see this module's own `nearestEdge` doc comment for why a plain
 * (unlocked) nearest-edge trace is already gap-free for a straight line.
 */
export function traceEdgeRun(
  from: CellPos,
  to: CellPos,
  grid: CreationGrid,
  samples = 400
): EdgeGeometry[] {
  const run: EdgeGeometry[] = [];
  let prevKey: string | null = null;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    const edge = nearestEdge(p, grid);
    if (!edge) continue;
    const key = `${edge.cellA.join(',')}-${edge.cellB.join(',')}`;
    if (key !== prevKey) {
      run.push(edge);
      prevKey = key;
    }
  }
  return run;
}

/**
 * Every OPEN (wall-free) boundary edge of a region's own cell set —
 * Kirk's "false enclosure" worry, made directly visible instead of left
 * for the author to notice by accident: "any hex that is not 100%
 * uncovered would not be traversable by the players." A boundary edge is
 * one of a member cell's 6 real hex edges whose neighbor is NOT another
 * member of the same region (an internal edge, membership-only, never
 * "open" regardless of walls); it's OPEN specifically when no `walls`
 * entry covers it. `CreationBoard.tsx` renders the result as a distinct
 * highlighted overlay on the currently-selected/just-created region, so
 * "is this region actually sealed" is a board fact, not something the
 * author has to reconstruct from the cell shape by eye — directly
 * relevant now that 6-adjacency is real (`regionGeometry.ts`'s own header
 * comment): an edge that a square-grid mental model wouldn't even know to
 * check.
 *
 * Cheap by construction: at most 6 neighbor checks per member cell (a
 * region this concept has authored is a handful to a few dozen cells),
 * plus a flat `walls` scan per candidate boundary edge, deduped by
 * canonical `cellA`/`cellB` so a boundary edge bordering two DIFFERENT
 * non-member cells that happen to be mutual neighbors (a thin region,
 * one cell wide) isn't double-counted. Same complexity budget
 * `sharedBoundaryEdges` already accepts for this concept's region sizes.
 */
export function openBoundaryEdges(
  cells: readonly Cell[],
  walls: readonly { from: [number, number]; to: [number, number] }[]
): EdgeGeometry[] {
  const memberKeys = new Set(cells.map((c) => `${c[0]},${c[1]}`));
  const seenEdges = new Set<string>();
  const open: EdgeGeometry[] = [];
  for (const [col, row] of cells) {
    for (let facing = 0; facing < 6; facing++) {
      const n = neighborCell(col, row, facing);
      if (memberKeys.has(`${n.col},${n.row}`)) continue; // internal, not boundary
      const edge = canonicalHexEdge(col, row, facing);
      const edgeKey = `${edge.cellA.join(',')}|${edge.cellB.join(',')}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);
      const hasWall = walls.some(
        (w) =>
          w.from[0] === edge.cellA[0] &&
          w.from[1] === edge.cellA[1] &&
          w.to[0] === edge.cellB[0] &&
          w.to[1] === edge.cellB[1]
      );
      if (!hasWall) open.push(edge);
    }
  }
  return open;
}

/** Nearest board cell to a point, clamped independently per axis to the
 * grid bounds — same clamping shape the square predecessor used (round,
 * then clamp each of col/row to `[0, dimension)`), now driven by the real
 * inverse hex transform instead of a linear divide. */
export function nearestCreationCell(
  point: CellPos,
  grid: CreationGrid
): [number, number] {
  const cube = worldToCube(point);
  const col = Math.max(0, Math.min(grid.width - 1, hexColumn(cube)));
  const row = Math.max(0, Math.min(grid.height - 1, hexRow(cube)));
  return [col, row];
}
