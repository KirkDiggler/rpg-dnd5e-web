/**
 * straightWallGeometry — footprint + crossing math for STRAIGHT wall
 * segments (rpg-project#169 dungeon-builder initiative, "straight walls
 * with visible footprint" unit). Kept separate from `creationGeometry.ts`
 * because it answers a genuinely different question: not "which hex EDGE
 * is nearest a point" (the zigzag edge-wall tool's job) but "which hex
 * CELLS does an arbitrary straight WORLD-SPACE line clip through, and
 * which cell-to-cell EDGES does it cross without clipping either side."
 *
 * Kirk's rule, verbatim (CONTRACT.md's "Hex-true creation canvas"
 * section — this module exists to implement it precisely): "any hex that
 * is not 100% uncovered would not be traversable by the players." A
 * straight wall has a FOOTPRINT: every hex the line's interior genuinely
 * passes through is fully blocked — not just the edge it crosses, the
 * whole cell — regardless of how little of the hex the line clips. A hex
 * the line merely grazes (touches a vertex, or runs exactly along one of
 * its edges) is NOT footprint-blocked as a cell, but the movement
 * semantics this module also computes (`straightWallCrossedEdges`) still
 * block stepping across that specific grazed edge.
 *
 * **Why a straight line generally does NOT follow hex edges, unlike the
 * zigzag Wall tool's edge-painting** — worth stating plainly since it's
 * the entire reason this module needs to exist rather than reusing
 * `creationGeometry.ts`'s edge machinery: this grid's hexes are
 * pointy-top (`hexMath.ts`'s `hexCorners`, corners at 30°+60°·i), which
 * gives exactly 3 edge-line orientations — verified from the corner
 * angles, not assumed — at 30°, 90° (vertical), and 150° from the
 * horizontal board axis. **There is no 0°/horizontal edge family at
 * all.** So a "horizontal" straight wall (Kirk's other natural drawing
 * axis, alongside vertical) can never run along hex boundaries — it
 * always clips through hex interiors, in the "every-other-hex" pattern
 * this module's own tests demonstrate. Even "vertical" (which DOES match
 * the 90° edge family) only runs exactly along edges for specific
 * from/to combinations — a vertical line through a column of hex
 * CENTERS instead clips every hex in that column full-width (the
 * "shoulder-clipping" case), because a hex's own two vertical edges sit
 * at ±(half the flat-to-flat width) from its center, not AT the center.
 */
import { neighborCell } from '../boardGeometry';
import {
  BOARD_HEX_SIZE,
  cellCenter,
  cellCorners,
  hexColumn,
  hexRow,
  worldToCube,
  type CellPos,
} from '../hexLayout';
import {
  canonicalHexEdge,
  nearestCreationCell,
  type EdgeGeometry,
} from './creationGeometry';
import type { CreationGrid } from './creationTypes';

/**
 * How far (in board units) a half-plane is shrunk inward before testing
 * for a genuine interior clip — the concrete answer to "pick a
 * principled epsilon, document it." `BOARD_HEX_SIZE` is 24, so this is
 * ~0.024 board units: several orders of magnitude larger than the
 * floating-point noise `Math.cos`/`Math.sin` introduce computing hex
 * corners (~1e-13 at this scale, verified — double precision trig error
 * near this magnitude), so it reliably absorbs that noise, yet small
 * enough to be visually and physically meaningless at render/gameplay
 * scale (under a fortieth of a percent of the hex's own radius). A line
 * that merely touches a true vertex or runs exactly along a true edge
 * never penetrates a hex shrunk by this much; a line that genuinely
 * cuts into the interior always does, however shallow the cut.
 */
export const FOOTPRINT_EPSILON = BOARD_HEX_SIZE * 1e-3;

interface HalfPlane {
  /** Unit inward normal. */
  nx: number;
  ny: number;
  /** A point on this edge's line (one of the hex's own corners). */
  cx: number;
  cy: number;
}

/** The 6 inward-facing half-planes of the hex at (col,row), each unit-
 * normalized so `FOOTPRINT_EPSILON` below means a real board-unit
 * distance, not an arbitrary scale-dependent number. */
function hexHalfPlanes(col: number, row: number): HalfPlane[] {
  const center = cellCenter(col, row);
  const corners = cellCorners(center, BOARD_HEX_SIZE);
  const planes: HalfPlane[] = [];
  for (let i = 0; i < 6; i++) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % 6];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    let nx = dy / len;
    let ny = -dx / len;
    // Orient inward: the hex's own center must satisfy nx*(center-c1) < 0.
    if (nx * (center.x - x1) + ny * (center.y - y1) > 0) {
      nx = -nx;
      ny = -ny;
    }
    planes.push({ nx, ny, cx: x1, cy: y1 });
  }
  return planes;
}

/**
 * Clips segment `a`->`b` against the hex at (col,row), shrunk inward by
 * `epsilon` on every side (Cyrus-Beck half-plane clipping — 6 planes,
 * not 4, since a hex has 6 edges). Returns the surviving `[t0,t1]`
 * parametric interval along `a`->`b` if the segment enters the SHRUNK
 * hex's interior, or `null` otherwise — `null` covers both "misses the
 * hex entirely" and "only touches its TRUE boundary" (a vertex, or a run
 * along one edge), which is exactly the distinction Kirk's footprint
 * rule needs: a touch is not a clip.
 */
export function clipSegmentToShrunkHex(
  a: CellPos,
  b: CellPos,
  col: number,
  row: number,
  epsilon: number = FOOTPRINT_EPSILON
): [number, number] | null {
  let tMin = 0;
  let tMax = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const plane of hexHalfPlanes(col, row)) {
    const f0 =
      plane.nx * (a.x - plane.cx) + plane.ny * (a.y - plane.cy) + epsilon;
    const slope = plane.nx * dx + plane.ny * dy;
    if (Math.abs(slope) < 1e-12) {
      // Segment is parallel to this (shrunk) edge's line.
      if (f0 > 0) return null; // entirely on the outside side — no clip.
      continue; // entirely satisfies this plane — doesn't constrain t.
    }
    const tStar = -f0 / slope;
    if (slope > 0) {
      if (tStar < tMax) tMax = tStar;
    } else {
      if (tStar > tMin) tMin = tStar;
    }
    if (tMin > tMax) return null;
  }
  // A tiny positive-length floor (in t, not board units) so float noise
  // at exactly tMin===tMax can't register as a clip — a real clip from a
  // shrunk-by-FOOTPRINT_EPSILON hex always has materially more overlap
  // than this once it happens at all.
  return tMax - tMin > 1e-9 ? [tMin, tMax] : null;
}

/** Whether segment `a`->`b` genuinely clips (not merely touches) the hex
 * at (col,row) — see `clipSegmentToShrunkHex`'s own doc comment. */
export function isCellClipped(
  a: CellPos,
  b: CellPos,
  col: number,
  row: number,
  epsilon: number = FOOTPRINT_EPSILON
): boolean {
  return clipSegmentToShrunkHex(a, b, col, row, epsilon) !== null;
}

/**
 * Every candidate cell whose polygon could plausibly intersect segment
 * `a`->`b` — derived from the segment's own bounding box (expanded by
 * 1.5 hex radii) converted to a col/row range via the real inverse hex
 * transform at the box's 4 corners, the same "derive the range from real
 * geometry, don't hand-guess a formula" discipline `nearestEdge`/
 * `nearestCreationCell` already follow elsewhere in this concept.
 * Because `worldToCube` (before its final rounding step) is a LINEAR
 * map, the box's 4 corners are always where its col/row extremes land —
 * a box's interior can't map to a wider range than its corners under a
 * linear transform — so checking only the 4 corners is exact up to the
 * ±1 rounding slop this function already pads for. Clamped to the canvas
 * grid: a straight wall's footprint only ever marks real canvas cells.
 */
function candidateCells(
  a: CellPos,
  b: CellPos,
  grid: CreationGrid
): [number, number][] {
  const margin = BOARD_HEX_SIZE * 1.5;
  const minX = Math.min(a.x, b.x) - margin;
  const maxX = Math.max(a.x, b.x) + margin;
  const minY = Math.min(a.y, b.y) - margin;
  const maxY = Math.max(a.y, b.y) + margin;
  const corners: CellPos[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
  ];
  let minCol = Infinity,
    maxCol = -Infinity,
    minRow = Infinity,
    maxRow = -Infinity;
  for (const c of corners) {
    const cube = worldToCube(c);
    const col = hexColumn(cube);
    const row = hexRow(cube);
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  minCol = Math.max(0, minCol - 1);
  maxCol = Math.min(grid.width - 1, maxCol + 1);
  minRow = Math.max(0, minRow - 1);
  maxRow = Math.min(grid.height - 1, maxRow + 1);
  const cells: [number, number][] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      cells.push([col, row]);
    }
  }
  return cells;
}

function inBoundsGrid(col: number, row: number, grid: CreationGrid): boolean {
  return col >= 0 && col < grid.width && row >= 0 && row < grid.height;
}

/**
 * Every hex cell a straight wall from endpoint cell `from` to endpoint
 * cell `to` genuinely clips — the wall's own footprint, in Kirk's sense:
 * "any hex that is not 100% uncovered would not be traversable." The
 * line is the straight WORLD-SPACE segment between the two endpoint
 * cells' centers (`cellCenter`), not a chain of hex edges — see this
 * module's own header comment for why that line generally does NOT
 * follow hex boundaries.
 */
export function straightWallFootprint(
  from: [number, number],
  to: [number, number],
  grid: CreationGrid
): [number, number][] {
  const a = cellCenter(from[0], from[1]);
  const b = cellCenter(to[0], to[1]);
  const result: [number, number][] = [];
  for (const [col, row] of candidateCells(a, b, grid)) {
    if (isCellClipped(a, b, col, row)) result.push([col, row]);
  }
  return result;
}

/** Standard segment-vs-segment intersection test (parametric, with a
 * small tolerance so a wall that just grazes an edge — passes within
 * `FOOTPRINT_EPSILON` of it — still counts as crossing it; a graze is a
 * real crossing for movement purposes even though it isn't a cell clip).
 * Parallel (or near-parallel) segments are treated as NOT crossing: a
 * straight wall exactly collinear with one hex edge runs ALONG it, which
 * this module's footprint math already treats as a touch rather than a
 * clip, and running along an edge is not "crossing" it either. */
function segmentsIntersect(
  a1: CellPos,
  a2: CellPos,
  b1: CellPos,
  b2: CellPos,
  epsilon: number = FOOTPRINT_EPSILON
): boolean {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const ex = b1.x - a1.x;
  const ey = b1.y - a1.y;
  const t = (ex * d2y - ey * d2x) / denom;
  const u = (ex * d1y - ey * d1x) / denom;
  const len1 = Math.hypot(d1x, d1y) || 1;
  const len2 = Math.hypot(d2x, d2y) || 1;
  const tol1 = epsilon / len1;
  const tol2 = epsilon / len2;
  return t >= -tol1 && t <= 1 + tol1 && u >= -tol2 && u <= 1 + tol2;
}

/**
 * Movement semantics (b) from TARGET-YAML.md's "Straight walls" section:
 * every cell-to-cell edge the wall's line crosses BETWEEN TWO CLEAR
 * (non-footprint) cells — a crossing that blocks stepping between those
 * two cells even though neither cell itself is footprint-blocked (the
 * wall only grazed their shared boundary, per this module's own touch-
 * vs-clip distinction). A crossing where either side IS footprint-
 * blocked is deliberately omitted — it's already subsumed by that cell
 * being wholly impassable, so surfacing it separately would just be
 * noise on top of a fact the footprint already covers.
 */
export function straightWallCrossedEdges(
  from: [number, number],
  to: [number, number],
  grid: CreationGrid,
  footprint?: readonly [number, number][]
): EdgeGeometry[] {
  const a = cellCenter(from[0], from[1]);
  const b = cellCenter(to[0], to[1]);
  const resolvedFootprint = footprint ?? straightWallFootprint(from, to, grid);
  const footprintSet = new Set(resolvedFootprint.map(([c, r]) => `${c},${r}`));
  const candidates = candidateCells(a, b, grid);
  const seen = new Set<string>();
  const crossed: EdgeGeometry[] = [];
  for (const [col, row] of candidates) {
    if (footprintSet.has(`${col},${row}`)) continue;
    for (let facing = 0; facing < 6; facing++) {
      const n = neighborCell(col, row, facing);
      if (!inBoundsGrid(n.col, n.row, grid)) continue;
      if (footprintSet.has(`${n.col},${n.row}`)) continue;
      const edge = canonicalHexEdge(col, row, facing);
      const edgeKey = `${edge.cellA.join(',')}|${edge.cellB.join(',')}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      if (segmentsIntersect(a, b, edge.a, edge.b)) crossed.push(edge);
    }
  }
  return crossed;
}

/** The union of every drawn straight wall's own footprint, as a
 * `"col,row"`-keyed Set — what `CreationBoard.tsx` checks placements/
 * start/end/region cells against to flag (never silently delete/move)
 * anything a newly-drawn footprint now covers. */
export function straightWallsFootprintSet(
  lines: readonly { from: [number, number]; to: [number, number] }[],
  grid: CreationGrid
): Set<string> {
  const set = new Set<string>();
  for (const line of lines) {
    for (const [c, r] of straightWallFootprint(line.from, line.to, grid)) {
      set.add(`${c},${r}`);
    }
  }
  return set;
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export type StraightAxis = 'vertical' | 'horizontal';

/**
 * Which screen axis a drag most likely intends — a 2-way analog of
 * `creationGeometry.ts`'s `dragFamily` (which picks among the hex grid's
 * 3 EDGE families for the zigzag Wall tool). A straight wall's two
 * "natural axes" are literal SCREEN/board-space axes, not hex edge
 * families — see this module's own header comment for why board-space
 * "horizontal" has no hex-edge analog at all (that absence is exactly
 * why a horizontal straight wall clips hexes instead of running along
 * their boundaries — it's the whole reason this tool exists). 60°/120°
 * diagonal snapping was considered and skipped this round: cheap to add
 * later (a 4-way `pickStraightAxis` instead of this 2-way one, using the
 * same score-based `snapStraightEndpoint` search below with 4 target
 * directions instead of 2) but not needed to prove the footprint
 * mechanic, which is this unit's actual point.
 */
export function pickStraightAxis(dx: number, dy: number): StraightAxis {
  return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
}

/**
 * The best "to" cell for continuing a straight wall from `fromCell`
 * toward `pointer`, locked to `axis`. This is a DISCRETE hex grid, so an
 * exactly vertical or horizontal line generally isn't reachable between
 * two integer cell centers at all (see this module's own header comment:
 * no edge family is horizontal, and "vertical" only lines up exactly for
 * specific from/to combinations) — this searches a small window of
 * columns/rows around the pointer's own nearest cell and picks whichever
 * candidate keeps the OTHER world-space coordinate closest to
 * `fromCell`'s own (vertical mode holds worldX as steady as the grid
 * allows; horizontal mode holds worldY steady), tie-broken toward
 * whichever candidate is nearest the pointer along the free axis. The
 * result is the closest AVAILABLE approximation, not a mathematically
 * exact one — `straightWallFootprint` above computes the footprint from
 * whatever line actually results, honestly, rather than pretending the
 * snap was exact.
 */
export function snapStraightEndpoint(
  fromCell: [number, number],
  pointer: CellPos,
  axis: StraightAxis,
  grid: CreationGrid
): [number, number] {
  const fromCenter = cellCenter(fromCell[0], fromCell[1]);
  const [pCol, pRow] = nearestCreationCell(pointer, grid);
  const WINDOW = 3;
  let best: [number, number] = [pCol, pRow];
  let bestScore = Infinity;
  for (let dCol = -WINDOW; dCol <= WINDOW; dCol++) {
    for (let dRow = -WINDOW; dRow <= WINDOW; dRow++) {
      const col = pCol + dCol;
      const row = pRow + dRow;
      if (!inBoundsGrid(col, row, grid)) continue;
      const center = cellCenter(col, row);
      const alignDelta =
        axis === 'vertical'
          ? Math.abs(center.x - fromCenter.x)
          : Math.abs(center.y - fromCenter.y);
      const nearPointer =
        axis === 'vertical' ? Math.abs(row - pRow) : Math.abs(col - pCol);
      // Alignment to the locked axis dominates; nearness to the pointer
      // along the free axis is only a tiebreak among near-equally-aligned
      // candidates.
      const score = alignDelta * 1000 + nearPointer;
      if (score < bestScore) {
        bestScore = score;
        best = [col, row];
      }
    }
  }
  return best;
}
