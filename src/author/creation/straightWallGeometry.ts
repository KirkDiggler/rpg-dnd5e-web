/**
 * straightWallGeometry — footprint + crossing math for STRAIGHT wall
 * segments (rpg-project#169 dungeon-builder initiative, "straight walls
 * with visible footprint" unit; corner-anchored since the follow-up
 * "corner-anchored straight walls + line doors" unit). Kept separate from
 * `creationGeometry.ts` because it answers a genuinely different
 * question: not "which hex EDGE is nearest a point" (the zigzag edge-wall
 * tool's job) but "which hex CELLS does an arbitrary straight WORLD-SPACE
 * line clip through, and which cell-to-cell EDGES does it cross without
 * clipping either side."
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
 *
 * **Corner anchoring (this unit).** `from`/`to` are now `CornerRef`s
 * (`hexCorner.ts`) — hex CORNERS, not cell centers. Kirk's live
 * feedback: "it always hangs over a little" — a cell-center-anchored
 * wall overshoots its intended extent by up to half a hex at each end,
 * by construction, and there was no finer lattice to fine-tune into. All
 * of this module's actual clipping math (`hexHalfPlanes`,
 * `clipSegmentToShrunkHex`, `isCellClipped`, `candidateCells`) already
 * operated on raw world-space `CellPos` points and needed ZERO changes —
 * only the higher-level functions that used to resolve `from`/`to` via
 * `cellCenter` now resolve them via `cornerPoint` instead. See
 * `hexCorner.ts`'s own header comment for the corner-lattice addressing
 * and dedup rule this implies.
 */
import {
  BOARD_HEX_SIZE,
  cellCenter,
  cellCorners,
  hexColumn,
  hexRow,
  worldToCube,
  type CellPos,
} from '../hexLayout';
import { canonicalHexEdge, type EdgeGeometry } from './creationGeometry';
import type { CreationGrid } from './creationTypes';
import {
  canonicalCorner,
  cornerPoint,
  nearestCorner,
  // `neighborCell` from `./hexCorner`, not `../boardGeometry` — see that
  // module's own doc comment on its exported copy: `boardGeometry.ts`
  // imports `resolvePlacement`/`DungeonDoc` from `dungeonYaml.ts`, so
  // importing it here would make THIS module (which `dungeonYaml.ts`'s
  // own `stripToV1Subset` needs to call directly, wallLines->edges
  // projection unit) part of a real, crashing import cycle.
  neighborCell,
  type CornerRef,
} from './hexCorner';

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
 * Every hex cell a straight wall from corner `from` to corner `to`
 * genuinely clips — the wall's own footprint, in Kirk's sense: "any hex
 * that is not 100% uncovered would not be traversable." The line is the
 * straight WORLD-SPACE segment between the two endpoint CORNERS
 * (`cornerPoint`), not a chain of hex edges and not a cell-center-to-
 * cell-center segment either (see this module's own header comment for
 * the corner-anchoring change, and its top-of-file comment for why the
 * line generally does NOT follow hex boundaries regardless).
 *
 * `doorCells` (a wallLine's own `doors: [{cell}]` entries — see
 * `dungeonYaml.ts`'s `WallLineDoc`) are excluded from the result: a door
 * punches its cell out of THIS wall's footprint entirely, as if the line
 * never clipped it — see TARGET-YAML.md's "Straight walls: doors" section
 * for the exact traversability semantic this gives a compiler.
 */
export function straightWallFootprint(
  from: CornerRef,
  to: CornerRef,
  grid: CreationGrid,
  doorCells: readonly [number, number][] = []
): [number, number][] {
  const a = cornerPoint(from);
  const b = cornerPoint(to);
  const doorSet = new Set(doorCells.map(([c, r]) => `${c},${r}`));
  const result: [number, number][] = [];
  for (const [col, row] of candidateCells(a, b, grid)) {
    if (doorSet.has(`${col},${row}`)) continue;
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
 *
 * `doorCells`, when `footprint` isn't already resolved by the caller, is
 * forwarded to `straightWallFootprint` so a door cell is treated as
 * "clear" here too — its own boundary crossings then fall out of the
 * SAME (b) mechanism as any other clear cell, no separate door-crossing
 * logic needed. If the caller already resolved `footprint` itself
 * (e.g. `CreationBoard.tsx`'s render pass, which computes the footprint
 * once and reuses it for both the hatch overlay and this call),
 * `doorCells` is unused — pass a footprint that's already door-excluded.
 */
export function straightWallCrossedEdges(
  from: CornerRef,
  to: CornerRef,
  grid: CreationGrid,
  footprint?: readonly [number, number][],
  doorCells: readonly [number, number][] = []
): EdgeGeometry[] {
  const a = cornerPoint(from);
  const b = cornerPoint(to);
  const resolvedFootprint =
    footprint ?? straightWallFootprint(from, to, grid, doorCells);
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

/** The union of every drawn straight wall's own footprint (door cells
 * already excluded, per-line), as a `"col,row"`-keyed Set — what
 * `CreationBoard.tsx` checks placements/start/end/region cells against to
 * flag (never silently delete/move) anything a newly-drawn footprint now
 * covers. */
export function straightWallsFootprintSet(
  lines: readonly {
    from: CornerRef;
    to: CornerRef;
    doors?: readonly { cell: [number, number] }[];
  }[],
  grid: CreationGrid
): Set<string> {
  const set = new Set<string>();
  for (const line of lines) {
    const doorCells = (line.doors ?? []).map((d) => d.cell);
    for (const [c, r] of straightWallFootprint(
      line.from,
      line.to,
      grid,
      doorCells
    )) {
      set.add(`${c},${r}`);
    }
  }
  return set;
}

/**
 * Coverage-based standability (rpg-project#169, live-design follow-up to
 * "drawn walls become real," 2026-08-07) — Kirk, live: "Nothing is set in
 * stone... if you can say we won't clip we can go on those squares, maybe
 * some percent is fine. the small triangles on the edge we could prob
 * allow those to be placed on... like we can slide a bookcase to a wall."
 * Retires the original binary rule ("any hex that is not 100% uncovered
 * would not be traversable") for STANDING purposes only.
 *
 * **What this does NOT change, deliberately**: the wall LINE's own
 * crossing prohibition (`straightWallCrossedEdges`, mechanism (b)) and
 * Half A's wire projection (`projectWallLineToEdges`, `dungeonYaml.ts`'s
 * `stripToV1Subset`) both keep using the FULL, uncovered-at-all footprint
 * (`straightWallFootprint`) exactly as before — a coverage percentage
 * changes whether a client-side preview lets an author STAND in a
 * lightly-clipped cell, never what edges the real server enforces. See
 * this module's own `projectWallLineToEdges` doc comment; nothing there
 * reads a coverage value.
 *
 * **The geometry.** `straightWallFootprint`'s existing `isCellClipped`
 * already answers "does the line's segment genuinely enter this hex" (a
 * boolean, epsilon-gated). This answers a different question for a cell
 * ALREADY known to be in that footprint: how much of the hex's own TRUE
 * area (not epsilon-shrunk — the boolean touch/clip decision is already
 * made upstream, this only refines "how much") does the line's own
 * infinite line separate off? The line divides the hex's convex polygon
 * into exactly two sub-polygons (Sutherland-Hodgman clip against the
 * line's own half-plane); their areas sum to the hex's total area (a
 * convex polygon split by one line always partitions exactly, modulo the
 * zero-area shared boundary). Coverage is the SMALLER of the two,
 * relative to the total.
 *
 * **Why the smaller side, not a directionally-consistent "wall's own
 * side"**: a single line has no inherent "this side is wall material"
 * without external context (which way the wall run continues past this
 * cell, or a designed wall thickness neither this dialect nor this
 * geometry model has) — the SAME area split (say 5%/95%) is genuinely
 * ambiguous as to which side is "the small clipped corner" without that
 * context. But Kirk's own framing ("the small triangles on the edge") is
 * exactly the min-area case: whichever side is smaller IS the clipped
 * sliver, symmetric and context-free, and it degrades correctly at both
 * ends — a pure touch (line along an edge, or through one vertex) gives
 * 0 on one side; a line through the center gives ~0.5, unambiguously
 * "blocks half the cell," comfortably above any reasonable threshold.
 */
function polygonArea(points: readonly CellPos[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

/** Sutherland-Hodgman clip of a convex polygon against ONE half-plane
 * (`nx*(x-cx) + ny*(y-cy) <= 0` is the KEPT side) — the standard
 * textbook algorithm, needed here because `hexHalfPlanes`/
 * `clipSegmentToShrunkHex` above only ever clip a LINE SEGMENT (1D)
 * against the hex's 6 edges; this clips the hex's own POLYGON (2D)
 * against the wall's single line instead, a genuinely different
 * operation this module didn't need before coverage. */
function clipPolygonToHalfPlane(
  poly: readonly CellPos[],
  nx: number,
  ny: number,
  cx: number,
  cy: number
): CellPos[] {
  if (poly.length === 0) return [];
  const side = (p: CellPos) => nx * (p.x - cx) + ny * (p.y - cy);
  const intersect = (a: CellPos, b: CellPos): CellPos => {
    const da = side(a);
    const db = side(b);
    const t = da / (da - db);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const output: CellPos[] = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const currIn = side(curr) <= 0;
    const prevIn = side(prev) <= 0;
    if (currIn) {
      if (!prevIn) output.push(intersect(prev, curr));
      output.push(curr);
    } else if (prevIn) {
      output.push(intersect(prev, curr));
    }
  }
  return output;
}

/**
 * Fraction (0..0.5) of hex (col,row)'s own true area that the wall's
 * infinite line (through corners `from`/`to`) separates into the SMALLER
 * of the two resulting sub-polygons — see this section's own header
 * comment for the full geometric/design writeup. `0` for a cell the line
 * doesn't genuinely enter at all (correct, if uninteresting — callers
 * only ever call this for a cell already confirmed in the raw footprint,
 * where it's always genuinely positive).
 */
export function hexCoverageFraction(
  from: CornerRef,
  to: CornerRef,
  col: number,
  row: number
): number {
  const a = cornerPoint(from);
  const b = cornerPoint(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const corners: CellPos[] = cellCorners(
    cellCenter(col, row),
    BOARD_HEX_SIZE
  ).map(([x, y]) => ({ x, y }));
  const totalArea = polygonArea(corners);
  if (totalArea === 0) return 0;
  const sideArea = polygonArea(
    clipPolygonToHalfPlane(corners, nx, ny, a.x, a.y)
  );
  const otherSideArea = totalArea - sideArea;
  return Math.min(sideArea, otherSideArea) / totalArea;
}

/**
 * The standability threshold (rule 1 of Kirk's live-design follow-up): a
 * footprint cell with `hexCoverageFraction` below this value is
 * STANDABLE (walkMovement/placement-legality stop blocking the CELL —
 * the line's own crossing prohibition into/out of it is unaffected, see
 * this section's header comment); at or above, blocked exactly as the
 * original binary rule always blocked it.
 *
 * **Honest status: reasoned from real geometry, NOT yet visually
 * measured in Walk mode** — Kirk's own "measured, not guessed"
 * discipline calls for walking the first-person camera against a real
 * coverage bench and observing where clipping actually starts to read as
 * wrong. That pass was ATTEMPTED, not completed: a real two-line bench
 * was built and loaded live (below), and the server-side projection was
 * confirmed correct against it (`YamlPane`'s own compile badge read "2
 * straight walls (projects to 74 wall edges)" for these exact two
 * lines — Half A's own machinery, unaffected by any of this, working
 * against real coverage-varying geometry). But the actual visual
 * inspection couldn't be finished: the shared browser debugging session
 * this environment provides collided live with a concurrent teammate
 * agent's own active session mid-pass (a `navigate_page`/click landed on
 * a DIFFERENT agent's in-progress gameplay at a different origin and
 * player identity) — continuing risked disrupting their work, so this
 * stopped rather than push through on a compromised shared resource.
 * Recorded here rather than silently shipping a number with a
 * "measured" claim that wouldn't be true.
 *
 * **The bench, reproducible for whoever picks up the real visual pass**
 * (a `wallLines:` doc, loadable via `localStorage.setItem
 * ('dungeon-builder:draft:create', JSON.stringify({yamlText, savedAt:
 * Date.now()}))` then reloading the creation-mode builder — no drag-draw
 * needed): two lines on a `canvas: {width: 50, height: 30}` —
 * `{from: {cell:[16,21],corner:0}, to: {cell:[22,20],corner:0}}` (cells
 * or a mix of ~4%/~24%/~37% coverage, alternating) and
 * `{from: {cell:[37,20],corner:0}, to: {cell:[44,18],corner:0}}` (cells
 * spanning ~1.7%/~3.8%/~10.4%/~14.7%/~29.5%/~39.7%/~44.9%) — every value
 * independently verified via `hexCoverageFraction` itself, not eyeballed
 * (this module's own test suite carries the exact fixtures and asserted
 * values, so the bench is exact, not approximate).
 *
 * **Threshold set at 10%** as the reasoned interim value: below the
 * already-well-established 16.67% reference (`straightWallFootprint`'s
 * own existing corner-to-corner-diagonal fixture, the smallest "clean"
 * symmetric corner cut reachable by connecting two of a hex's own
 * corners two apart — a real, visibly non-trivial triangular wedge, kept
 * blocked) while treating the bench's smaller measured slivers (up to
 * ~10%) as standable, matching Kirk's own qualitative framing ("the
 * small triangles on the edge") at the geometric level even without a
 * completed visual confirmation. A tunable constant, not hardcoded
 * inline at each call site, so a real Walk-mode pass (by a future
 * session without this collision) is a one-line change once it has
 * something to correct.
 */
export const STANDABLE_COVERAGE_THRESHOLD = 0.1;

/** Per-line coverage map (`"col,row"` -> fraction, `straightWallFootprint`'s
 * own door-excluded footprint) — the coverage-aware sibling of
 * `straightWallFootprint`, same cell set, richer per-cell value instead
 * of bare membership. */
export function straightWallFootprintCoverage(
  from: CornerRef,
  to: CornerRef,
  grid: CreationGrid,
  doorCells: readonly [number, number][] = []
): Map<string, number> {
  const coverage = new Map<string, number>();
  for (const [col, row] of straightWallFootprint(from, to, grid, doorCells)) {
    coverage.set(cellKey(col, row), hexCoverageFraction(from, to, col, row));
  }
  return coverage;
}

/** Multi-line union of `straightWallFootprintCoverage`, the coverage-aware
 * sibling of `straightWallsFootprintSet` — same cells, per-cell fraction
 * instead of bare membership. A cell touched by more than one drawn
 * wallLine takes the MAX of the two lines' own coverage (the more
 * restrictive claim wins) — a simplification, not a true union-of-areas
 * (two lines could together cover more than either alone), judged
 * adequate for a client-side authoring preview rather than a physically
 * exact overlap computation; recorded here rather than silently assumed
 * exact. */
export function straightWallsFootprintCoverage(
  lines: readonly {
    from: CornerRef;
    to: CornerRef;
    doors?: readonly { cell: [number, number] }[];
  }[],
  grid: CreationGrid
): Map<string, number> {
  const coverage = new Map<string, number>();
  for (const line of lines) {
    const doorCells = (line.doors ?? []).map((d) => d.cell);
    for (const [key, value] of straightWallFootprintCoverage(
      line.from,
      line.to,
      grid,
      doorCells
    )) {
      const existing = coverage.get(key);
      if (existing === undefined || value > existing) {
        coverage.set(key, value);
      }
    }
  }
  return coverage;
}

/** Filters a coverage map down to the cells at/above the standability
 * threshold — a plain `Set<string>`, the exact shape
 * `walkMovement.ts`'s `blockedCells` and `canvasFloor.ts`'s
 * `canvasPlacementRejectReason` already consume, so neither needed a
 * single signature change for this round: only WHICH set their callers
 * pass in changed (the coverage-filtered one, not the raw touch-at-all
 * one). */
export function standableFootprintKeys(
  coverage: ReadonlyMap<string, number>,
  threshold: number = STANDABLE_COVERAGE_THRESHOLD
): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of coverage) {
    if (value >= threshold) keys.add(key);
  }
  return keys;
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Standard point-onto-segment projection, clamped to `[0,1]` — the
 * straight-wall Door tool's own "where along this line did the author
 * click" step, shared with `pointToSegmentDistSq`'s distance math in
 * `creationGeometry.ts` (same clamp shape) but returning the parameter
 * itself rather than a distance. */
export function projectPointToLineParam(
  a: CellPos,
  b: CellPos,
  p: CellPos
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return 0;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  return Math.max(0, Math.min(1, t));
}

/**
 * Which footprint cell (if any) a parametric position `t` along the
 * wall's own `from`->`to` line falls inside — the exact mapping a real
 * server compiler owns for a `doors: [{cell}]` entry's placement: walk
 * every candidate cell's own clip interval (`clipSegmentToShrunkHex`,
 * the SAME primitive `straightWallFootprint` uses) and return the one
 * whose `[t0,t1]` contains `t`. `null` when `t` falls in an un-clipped
 * (touch-only) stretch of the line, or outside every candidate — the
 * caller (the Door tool's click handler) treats that as "no door placed,
 * nothing there to carve an opening into."
 */
export function footprintCellAtParam(
  from: CornerRef,
  to: CornerRef,
  grid: CreationGrid,
  t: number
): [number, number] | null {
  const a = cornerPoint(from);
  const b = cornerPoint(to);
  for (const [col, row] of candidateCells(a, b, grid)) {
    const interval = clipSegmentToShrunkHex(a, b, col, row);
    if (interval && t >= interval[0] - 1e-9 && t <= interval[1] + 1e-9) {
      return [col, row];
    }
  }
  return null;
}

/** The straight-wall Door tool's own hit-resolution: a click at board
 * point `point` on wallLine `from`->`to` resolves to the ONE footprint
 * cell it landed on (projected onto the line, then mapped through
 * `footprintCellAtParam`), or `null` if the click didn't land on any real
 * footprint cell (an un-covered "touch" stretch of the line, or a miss).
 */
export function wallLineDoorCellAt(
  from: CornerRef,
  to: CornerRef,
  grid: CreationGrid,
  point: CellPos
): [number, number] | null {
  const a = cornerPoint(from);
  const b = cornerPoint(to);
  const t = projectPointToLineParam(a, b, point);
  return footprintCellAtParam(from, to, grid, t);
}

/** Whether `cell` is one of this wall line's own RAW (door-blind)
 * footprint cells — what a door entry must reference to mean anything.
 * `CreationBoard.tsx` uses this to flag (not silently drop, per this
 * file's own discipline) a door left stranded by an endpoint drag that
 * shrank the footprint out from under it. */
export function isValidDoorCell(
  from: CornerRef,
  to: CornerRef,
  grid: CreationGrid,
  cell: [number, number]
): boolean {
  return straightWallFootprint(from, to, grid).some(
    ([c, r]) => c === cell[0] && r === cell[1]
  );
}

/**
 * wallLines->edges projection — rpg-project#169's "drawn walls become
 * real" unit. `wallLines:` has no wire representation of its own (see
 * `dungeonYaml.ts`'s `WallLineDoc` doc comment: it's this concept's own
 * client-side sugar, never sent to the real server in any form), but its
 * GEOMETRY isn't necessarily lost — when the server accepts edge-native
 * `walls:` (verified live, `capabilityProbe.ts`), a wallLine's footprint +
 * crossed-edge truth projects down into real `{from, to, kind}` pairs,
 * the same shape `walls:` already uses. This is that projection: cell-pair
 * `walls:` edges out, given one `wallLines:` entry's corner-anchored
 * endpoints and door cells in.
 */
export type ProjectedWallEdgeKind = 'solid' | 'door';

export interface ProjectedWallEdge {
  from: [number, number];
  to: [number, number];
  kind: ProjectedWallEdgeKind;
}

export interface WallLineProjection {
  /** Every distinct cell-boundary edge this ONE wallLine's geometry
   * implies, deduped within the line itself. */
  edges: ProjectedWallEdge[];
  /** Footprint-boundary edges whose neighbor falls OFF the canvas grid
   * entirely (a wall run reaching the canvas rim) — a `walls:` entry
   * needs a real cell on BOTH ends (the server's own adjacent-cell-pair
   * validation), so these have no honest wire representation. Counted,
   * never silently folded into `edges` or dropped without a trace — see
   * TARGET-YAML.md's "Straight walls: stripToV1Subset" section. */
  rimEdgeCount: number;
}

/**
 * Projects ONE `wallLines:` entry down to real edge-native `walls:`
 * pairs. Reuses this module's own `straightWallFootprint`/
 * `straightWallCrossedEdges` — the SAME functions `preview3d/walkMovement.ts`
 * already calls to enforce this exact geometry client-side — rather than
 * re-deriving it a second time.
 *
 * **Mechanism (a): every footprint cell is fully blocked.** Not
 * expressible as "this cell is non-floor" on the wire (the server has no
 * such concept — `walls:` only ever blocks a specific edge), so the
 * faithful edge-native translation is: seal EVERY one of a footprint
 * cell's 6 real neighbor edges. A neighbor that's one of this line's own
 * `doors:` cells gets `kind: 'door'` instead of `'solid'` — see this
 * function's own "door handling" note below. A neighbor off the canvas
 * grid entirely has no cell to pair with; counted in `rimEdgeCount`; a
 * cell can never seal an edge toward a footprint neighbor AND a rim in
 * the same direction, so there's no double-counting between the two.
 *
 * **Mechanism (b): a grazing crossing between two CLEAR cells**
 * (`straightWallCrossedEdges`, unchanged from its existing client-side
 * use) — always `'solid'`, no door special-case: a door only reverses ITS
 * OWNING line's own footprint claim on its one cell (TARGET-YAML.md's
 * "Doors" section, "this cell acts as though the wall line never clipped
 * it at all, nothing more, and nothing less"), never mechanism (b)'s
 * independent both-clear-cells test — a door cell whose true boundary the
 * line still grazes remains subject to that test exactly like any other
 * clear cell.
 *
 * **Door handling, the actual gap-vs-door decision** (TARGET-YAML.md has
 * the full writeup): a door cell's own edges toward its flanking
 * footprint neighbors are marked `kind: 'door'`, never omitted as a bare
 * gap and never `'solid'`. An omitted edge would render as nothing at
 * all in the real game (`syntyHexWallHelpers.ts`'s per-edge wall-piece
 * placement only draws where a `Wall` entry exists) — indistinguishable
 * from a rendering bug, not a doorway. `kind: 'door'` gives the opening a
 * real door frame via the SAME `isDoorWallKind`/`edgePieceKind` path
 * every other door in this game already renders through, so an authored
 * doorway reads as a doorway in the actual game, not an unexplained hole
 * in a wall — matching Kirk's own repeated diagnosis of the earlier
 * whole-line `kind: door` prototype ("the gashes are walls... I cannot
 * set a wall or a door").
 */
export function projectWallLineToEdges(
  line: {
    from: CornerRef;
    to: CornerRef;
    doors: readonly { cell: [number, number] }[];
  },
  grid: CreationGrid
): WallLineProjection {
  const doorCells = line.doors.map((d) => d.cell);
  const doorSet = new Set(doorCells.map(([c, r]) => cellKey(c, r)));
  const footprint = straightWallFootprint(line.from, line.to, grid, doorCells);

  const edgeMap = new Map<string, ProjectedWallEdge>();
  let rimEdgeCount = 0;

  const addEdge = (
    a: [number, number],
    b: [number, number],
    kind: ProjectedWallEdgeKind
  ) => {
    const aKey = cellKey(a[0], a[1]);
    const bKey = cellKey(b[0], b[1]);
    const [from, to] = aKey <= bKey ? [a, b] : [b, a];
    const key = `${cellKey(from[0], from[1])}|${cellKey(to[0], to[1])}`;
    const existing = edgeMap.get(key);
    if (existing) {
      // A door beats a solid found for the SAME edge from the opposite
      // direction — never the reverse (a door cell's own opening is
      // never re-sealed by a later, redundant solid derivation).
      if (kind === 'door') existing.kind = 'door';
      return;
    }
    edgeMap.set(key, { from, to, kind });
  };

  for (const [col, row] of footprint) {
    for (let facing = 0; facing < 6; facing++) {
      const n = neighborCell(col, row, facing);
      if (!inBoundsGrid(n.col, n.row, grid)) {
        rimEdgeCount++;
        continue;
      }
      const kind: ProjectedWallEdgeKind = doorSet.has(cellKey(n.col, n.row))
        ? 'door'
        : 'solid';
      addEdge([col, row], [n.col, n.row], kind);
    }
  }

  for (const edge of straightWallCrossedEdges(
    line.from,
    line.to,
    grid,
    footprint
  )) {
    addEdge(edge.cellA, edge.cellB, 'solid');
  }

  return { edges: Array.from(edgeMap.values()), rimEdgeCount };
}

/**
 * The hex grid's own 3 real edge-line orientations (degrees from the
 * horizontal board axis, mod 180 — a line's ORIENTATION has no direction,
 * so 30° and 210° are the same family). Pointy-top hex corners at
 * 30°+60°·i give edges at exactly these 3 angles (see this module's own
 * header comment) — these are the "natural families" a straight wall
 * snaps to by default (Kirk: "vertical... plus the hex edge families").
 * Superseding this module's former unconditional 2-way vertical/
 * horizontal lock (every drag forced onto one of only 2 axes, one of
 * which — horizontal, 0° — matches no real hex edge at all and so always
 * clipped through hex interiors by construction): the fix for Kirk's
 * "my line was angled ever so slightly" is a tolerance-gated snap to a
 * REAL edge family, not a wider forced choice.
 */
export const WALL_ANGLE_FAMILIES_DEG = [30, 90, 150] as const;
export type WallAxisFamily = (typeof WALL_ANGLE_FAMILIES_DEG)[number];

/**
 * How close (in degrees) a drag/endpoint-adjustment must be to one of
 * `WALL_ANGLE_FAMILIES_DEG` before it snaps — Kirk's own suggested range
 * ("~5-8°"), picked at the middle. Wide enough to correct a near-miss
 * without a steady hand; narrow enough that a drag genuinely AIMED
 * somewhere else (a deliberate free diagonal) isn't dragged onto a family
 * it was never actually close to.
 */
export const WALL_ANGLE_SNAP_TOLERANCE_DEG = 6;

function normalizeAngleDeg(deg: number): number {
  const mod = deg % 180;
  return mod < 0 ? mod + 180 : mod;
}

/** Circular distance between two line ORIENTATIONS (mod 180). */
function angleFamilyDistance(a: number, b: number): number {
  const diff = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
  return Math.min(diff, 180 - diff);
}

/**
 * Which of the 3 real hex-edge angle families (if any) a drag vector is
 * close enough to snap to. Returns `null` when the raw direction isn't
 * within `toleranceDeg` of any family — the caller then falls back to an
 * unconstrained nearest-corner snap (a deliberate free angle), never
 * forcing a family the drag wasn't actually close to. A zero-length
 * vector has no defined angle and also returns `null`.
 */
export function nearestWallAngleFamily(
  dx: number,
  dy: number,
  toleranceDeg: number = WALL_ANGLE_SNAP_TOLERANCE_DEG
): WallAxisFamily | null {
  if (dx === 0 && dy === 0) return null;
  const angle = normalizeAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI);
  let best: WallAxisFamily = WALL_ANGLE_FAMILIES_DEG[0];
  let bestDist = Infinity;
  for (const family of WALL_ANGLE_FAMILIES_DEG) {
    const dist = angleFamilyDistance(angle, family);
    if (dist < bestDist) {
      bestDist = dist;
      best = family;
    }
  }
  return bestDist <= toleranceDeg ? best : null;
}

/**
 * The best "to" CORNER for continuing/fine-tuning a straight wall from
 * `fromCorner` toward `pointer`. `axis`, when non-`null`, locks the
 * result to whichever of `WALL_ANGLE_FAMILIES_DEG` the caller already
 * decided (via `nearestWallAngleFamily`) — `null` means a free angle (the
 * modifier-key bypass, or a drag too far from every family to snap),
 * which falls straight through to `nearestCorner`'s plain nearest-point
 * search with no direction constraint at all.
 *
 * This is a DISCRETE hex grid, so an exactly-`axis`-degree line generally
 * isn't reachable between two lattice corners at all (see this module's
 * own header comment: no edge family is horizontal, and even a real
 * family only lines up exactly for specific from/to combinations) — the
 * locked-axis branch searches a small window of cells around the
 * pointer's own nearest corner (checking all 6 of each candidate cell's
 * own corners, not just cell centers) and picks whichever candidate
 * corner's direction from `fromCorner` deviates LEAST from `axis`,
 * tie-broken toward whichever candidate is nearest the pointer itself.
 * The result is the closest AVAILABLE approximation, not a
 * mathematically exact one — `straightWallFootprint` above computes the
 * footprint from whatever line actually results, honestly, rather than
 * pretending the snap was exact.
 */
export function snapStraightEndpoint(
  fromCorner: CornerRef,
  pointer: CellPos,
  axis: WallAxisFamily | null,
  grid: CreationGrid
): CornerRef {
  if (axis === null) return nearestCorner(pointer, grid);
  const fromPoint = cornerPoint(fromCorner);
  const near = nearestCorner(pointer, grid);
  const [pCol, pRow] = near.cell;
  const WINDOW = 3;
  let best: CornerRef = near;
  let bestScore = Infinity;
  for (let dCol = -WINDOW; dCol <= WINDOW; dCol++) {
    for (let dRow = -WINDOW; dRow <= WINDOW; dRow++) {
      const col = pCol + dCol;
      const row = pRow + dRow;
      if (!inBoundsGrid(col, row, grid)) continue;
      const corners = cellCorners(cellCenter(col, row), BOARD_HEX_SIZE);
      for (let corner = 0; corner < 6; corner++) {
        const point = { x: corners[corner][0], y: corners[corner][1] };
        if (point.x === fromPoint.x && point.y === fromPoint.y) continue;
        const candAngle = normalizeAngleDeg(
          (Math.atan2(point.y - fromPoint.y, point.x - fromPoint.x) * 180) /
            Math.PI
        );
        const alignDelta = angleFamilyDistance(candAngle, axis);
        const nearPointer = Math.hypot(
          point.x - pointer.x,
          point.y - pointer.y
        );
        // Alignment to the locked axis dominates; nearness to the
        // pointer is only a tiebreak among near-equally-aligned
        // candidates.
        const score = alignDelta * 1000 + nearPointer;
        if (score < bestScore) {
          bestScore = score;
          best = { cell: [col, row], corner };
        }
      }
    }
  }
  return canonicalCorner(best);
}
