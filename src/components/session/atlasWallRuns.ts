/**
 * atlasWallRuns — turns the session wire's DECLARED interior boundaries
 * and doorways into straight wall RUNS, by chaining the AUTHORED edges
 * themselves (rpg-dnd5e-web#787) — not by reconstructing "chamber"
 * geometry the wire never declares, and NOT by inventing a wall at the
 * floor's own outer edge.
 *
 * # Why this is no longer chamber-based
 *
 * The previous version of this module (PR #762/#764) recovered "chamber"
 * membership via connected-components over the floor mask, then derived
 * each seam as a straight line between two chambers' bounding-box
 * columns and the outer envelope as one rectangle around the whole
 * floor's bounding box. Kirk's live walk (#787) found the lie: "the
 * walls I can place are not straight. The walls are assumed on a
 * region — but we decided that regions do not necessarily have walls
 * automatically." Three concrete failures fell out of the chamber
 * reconstruction: an L-shaped or horizontal seam came out slanted (the
 * bounding-box-column math only modeled a vertical seam spanning a full
 * row range); a wall chain that didn't fully split the floor into two
 * components was silently dropped (`chamberFrom.id === chamberTo.id` ->
 * skip); and a non-rectangular floor's envelope followed its bounding
 * RECTANGLE, not its real outline.
 *
 * # No more envelope at all (Kirk's ruling, same day, after seeing the
 * outline-traced version live): "draw nothing, floor ends into
 * darkness. that seems more honest about the void." The first fix for
 * #787 (still traced from the real floor mask instead of a bounding
 * rectangle) was itself superseded before merge — the floor's own
 * outer edge draws NOTHING now, authored or implied. The void already
 * blocks movement/sight mechanically (an opaque void blocks the whole
 * hex, Kirk's separate standing ruling) with no visual masonry needed
 * to sell it; a floor that just ends into darkness IS the honest
 * picture. An author who wants a visible outer wall draws one like any
 * other wall — `atlas.boundaries` — no special-cased "envelope" concept
 * survives this file at all.
 *
 * # The fix: chain the real authored edges, don't infer regions or an
 * outer wall
 *
 * `atlas.boundaries` + `atlas.doorways` already carry everything this
 * module draws. It builds one flat list of hex-adjacency edges — every
 * declared boundary, every doorway (as a break point, see below) — and
 * hands the whole thing to `authoredWallRuns.computeAuthoredWallRuns`,
 * the chaining engine an earlier slice (rpg-dnd5e-web#723-family)
 * already built and proved for exactly this problem: walk a graph of
 * real hex edges into straight runs via a Douglas-Peucker-style
 * distance tolerance (a real zigzag "eats" only a bounded amount before
 * a chord across it stops matching every visited vertex; a genuine
 * corner's deviation grows unboundedly the moment the walk is forced
 * past it), breaking at branches, dead ends, and door-adjacent
 * vertices. It already handles isolated single-edge chains (a partial
 * interior wall that doesn't split anything renders as its own one-edge
 * run, nothing to drop) — the closed-loop handling it also has (its own
 * Phase 2) simply never triggers here anymore, since there is no
 * implied outer loop being fed in.
 *
 * # Doors: aligned to the run they interrupt, AND forced to meet it
 * exactly, AND their flanking runs forced to agree on facing
 *
 * Every `atlas.doorways` entry gets its own gap + frame independently —
 * no Map keyed by "chamber pair" to lose a second door on the same seam
 * to (rpg-dnd5e-web#782), because there is no such Map anymore: every
 * doorway is processed once, unconditionally.
 *
 * Two live-walk findings on this same PR, in sequence:
 *
 * 1. "walls look straight now but the door follows the hex edge." The
 *    chaining engine trims a door-adjacent run by exactly
 *    `DOOR_FRAME_CALIBRATED_WIDTH/2` back from the door's own hex
 *    CORNER — a known, exact distance, used below to recognize, from
 *    the OUTSIDE, which run a door interrupts on each side, with no
 *    change to the chaining engine itself.
 * 2. "while I think our walls should be double sided... the gap is
 *    what I am most concerned with" + a screenshot showing bare floor
 *    on BOTH sides of the door frame, and the two flanking runs facing
 *    opposite ways. Root cause: the engine's own trim (measured from
 *    the door's raw hex CORNER) and this module's gap placement
 *    (projected from the door's raw hex-edge MIDPOINT) are two
 *    INDEPENDENT computations that only approximately agree — the
 *    exact defect class Kirk found once before, pre-#787 ("the walls
 *    do not touch"), in different clothes. The fix removes the second
 *    computation's independence entirely: once the gap's own boundary
 *    points are known, this module FORCES each flanking run's endpoint
 *    to sit at that exact point (trim or extend, whichever the
 *    engine's own trim over- or under-shot by) — the runs meet the
 *    frame by construction, not by two formulas landing close. The
 *    same pass unions every run that shares an endpoint (real chain
 *    adjacency) OR is linked by a door (the two runs a door's own gap
 *    now provably connects, even though their endpoints sit on
 *    opposite sides of the frame) into one component, then makes every
 *    run in it agree on which SIDE is outward — deterministic
 *    (whichever run is encountered first in array order becomes the
 *    reference), negating any disagreeing run's own `facing` (never
 *    replacing it with another run's value: each run's `facing` stays
 *    perpendicular to THAT run's own geometry, which is what
 *    `WallRunMesh` compares it against) rather than leaving each
 *    fragment's independently-computed facing free to disagree.
 * 3. "the wall from the top seems like it is at an angle" — a screenshot
 *    (top-down) showing a column seam visibly tilted a few degrees off
 *    vertical while the floor's own hex columns run dead straight.
 *    Root cause: the engine's own run is the CHORD between the chain's
 *    first and last vertex only. A hex-column seam's real vertices
 *    zigzag +-half a hex by ROW PARITY (even/odd row lands the vertex a
 *    half-hex-width to one side or the other of the seam's true,
 *    parity-averaged line) — the chord happens to connect whichever two
 *    parities the chain's own first/last vertex landed on, inheriting a
 *    few degrees of tilt from that essentially arbitrary pair instead
 *    of the seam's real direction. Fixed by re-deriving each run's line
 *    via a total-least-squares fit over EVERY vertex the chain actually
 *    passed through (recovered by parsing the run's own `key` — see
 *    `parseChainVertices`'s doc comment for why that's safe here — not
 *    just its two endpoints), then re-extending to the chain's own
 *    extreme vertices projected onto the fitted line. Fit over the
 *    WHOLE door-split chain's combined vertex set, not each post-split
 *    run alone (see the fit-grouping comment at its own call site for
 *    why a short, door-truncated fragment's own parity mix can still be
 *    unbalanced on its own). The alternating +-half-hex parity offsets
 *    cancel MOSTLY in the fit — verified against the real reference-
 *    tomb data: reduced from up to ~80 degrees of tilt on the worse of
 *    a door-split seam's two per-run-only fragments down to ~1.6
 *    degrees for the fitted whole chain. Not exactly zero: the real
 *    authored edge list's own near/far cell selection is not perfectly
 *    parity-balanced (verified: seam1's 14 edges split 11-odd/3-even by
 *    row parity on their own "near" side) — an idealized, perfectly
 *    alternating zigzag would cancel to exactly vertical, but forcing
 *    that here would mean snapping toward a preferred axis instead of
 *    fitting the real, slightly asymmetric data, which is exactly what
 *    this fix must NOT do (a genuinely diagonal authored chain must
 *    still fit its own true diagonal). This replaces each run's
 *    start/end BEFORE door planning (finding 1) and force-closure
 *    (finding 2) run, so both inherit the corrected line for free.
 *
 * A door whose edge touches no wall run's trimmed endpoint on EITHER
 * side (a standalone doorway with no wall around it — legal: a doorway
 * is a door with no state) falls back to its own raw `hexEdgeBetween`
 * geometry, since nothing straighter exists to align or close against.
 *
 * Double-sided walls themselves (Kirk: "I think our walls should be
 * double sided") are explicitly OUT of scope here — filed as a
 * follow-up; this fix only makes the single face every run already has
 * agree with its neighbors', not add a second face.
 */

import {
  coordToKey,
  hexEdgeBetween,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import {
  computeAuthoredWallRuns,
  type AuthoredWallEdgeInput,
  type AuthoredWallRun,
} from '@/hooks/authoredWallRuns';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasBoundary,
  AtlasDoorway,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { positionToCube } from './positionBridge';

/** Where a door's frame+leaf go — the gap this run's own chained wall
 * segments leave, rendered separately by the caller (matches the old
 * route's own convention: `WallRunMesh` tiles the segments, it never
 * places doors). */
export interface DoorGapPiece {
  key: string;
  connection: string;
  /** Frame placement — the gap's own center. */
  position: WorldPos;
  /** Leaf placement — one end of the gap (the leaf's local pivot sits at
   * one end, like every other door piece in this codebase — see
   * SyntyHexWall.tsx's own `edge.a`/`edge.mid` convention this mirrors). */
  leafPosition: WorldPos;
  rotationY: number;
}

export interface WallRunScene {
  /** Every straight wall run — envelope and interior seams alike, no
   * longer a separate shape for each (see this module's own header doc
   * for why unifying them is correct, not merely convenient): both are
   * chained by the same engine off the same real-edge graph. Rendered by
   * `WallRunMesh`'s own `authoredRuns` prop, the same tiled-Synty-piece
   * path an unrelated (OLD wire) authored-dungeon route already proved
   * out. */
  wallRuns: AuthoredWallRun[];
  doorGaps: DoorGapPiece[];
}

function distance(a: WorldPos, b: WorldPos): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function unitDirection(a: WorldPos, b: WorldPos): WorldPos {
  const len = distance(a, b);
  if (len === 0) return { x: 0, z: 0 };
  return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
}

/** A stable, order-independent key for an unordered pair of hex
 * coordinates -- used to detect a doorway occupying the same cell pair
 * as a declared boundary (see the doorway/boundary overlap guard
 * above). */
function pairKey(a: CubeCoord, b: CubeCoord): string {
  const ka = coordToKey(a);
  const kb = coordToKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Half the calibrated door-frame width -- the EXACT distance
 * `computeAuthoredWallRuns`'s own `emitRun` trims a run's endpoint back
 * from a door-adjacent hex corner (authoredWallRuns.ts's own doc
 * comment: "a run whose end sits ON a door-touching vertex stops
 * DOOR_FRAME_CALIBRATED_WIDTH/2 short of it"). Used below to recognize,
 * from the OUTSIDE, which run's endpoint was trimmed against a given
 * door corner -- no change to that engine needed.
 */
const DOOR_TRIM = DOOR_FRAME_CALIBRATED_WIDTH / 2;

interface RunEndpointRef {
  runIndex: number;
  end: 'start' | 'end';
}

/** A mutable working copy of one AuthoredWallRun -- this module force-
 * corrects a door-adjacent run's endpoint and, separately, may flip its
 * facing to agree with the rest of its connected component (see this
 * file's own header doc, finding 2). Plain fields, not a class: cheap
 * to construct one per run, once, per call. */
interface MutableRun {
  start: WorldPos;
  end: WorldPos;
  key: string;
  facing: WorldPos;
}

/** Whichever run has an endpoint at EXACTLY `DOOR_TRIM` from `corner`
 * (one of a doorway's own two hex-edge corners) -- the run that
 * corner's own engine-side trim pulled back, i.e. the run this door
 * interrupts on that side. undefined if no run was trimmed against this
 * corner (a standalone doorway with no wall on that side). */
function runIndexTrimmedAgainst(
  corner: WorldPos,
  runs: readonly MutableRun[]
): RunEndpointRef | undefined {
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    if (Math.abs(distance(run.start, corner) - DOOR_TRIM) < 1e-6) {
      return { runIndex: i, end: 'start' };
    }
    if (Math.abs(distance(run.end, corner) - DOOR_TRIM) < 1e-6) {
      return { runIndex: i, end: 'end' };
    }
  }
  return undefined;
}

/** The point on the infinite line through `linePoint` along unit `dir`
 * closest to `point` -- projects a door's own raw edge midpoint onto the
 * straightened run line it should sit in, rather than using the raw
 * midpoint (which sits on the zigzag the run only approximates)
 * verbatim. */
function projectOntoLine(
  point: WorldPos,
  linePoint: WorldPos,
  dir: WorldPos
): WorldPos {
  const t = (point.x - linePoint.x) * dir.x + (point.z - linePoint.z) * dir.z;
  return { x: linePoint.x + dir.x * t, z: linePoint.z + dir.z * t };
}

/**
 * Recovers every real hex-corner vertex a chained run actually passed
 * through, by parsing the run's own `key` -- `computeAuthoredWallRuns`'s
 * `emitRun` builds it as `chainEdges.map(g => g.input.id ?? (aKey+"|"+bKey)).sort().join(';')`,
 * and this module never sets `AuthoredWallEdgeInput.id` on any edge it
 * builds, so every token is guaranteed to be a real `vertexA|vertexB`
 * pair (each vertex `x.xxxxx,z.zzzzz` to 5 decimals, `vertexKey`'s own
 * format) rather than an opaque id. This is reading a field that field's
 * own doc already promises is "deterministic across renders for the
 * same input data" -- not reaching into a private implementation
 * detail, but it IS coupled to that key format staying vertex-pair
 * shaped for this caller; if a future edit to this module ever sets
 * `id` on an edge, this stops finding any vertices and the fit below
 * safely falls back to the original two-point chord (see `fitRunLine`).
 */
function parseChainVertices(key: string): WorldPos[] {
  const points: WorldPos[] = [];
  const seen = new Set<string>();
  for (const token of key.split(';')) {
    const [aStr, bStr] = token.split('|');
    for (const vertexStr of [aStr, bStr]) {
      if (!vertexStr || seen.has(vertexStr)) continue;
      const [xStr, zStr] = vertexStr.split(',');
      const x = Number(xStr);
      const z = Number(zStr);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      seen.add(vertexStr);
      points.push({ x, z });
    }
  }
  return points;
}

/**
 * Fits the TRUE direction of a straight chain via total-least-squares
 * (the principal axis of the vertex cloud, not a simple x-on-z or
 * z-on-x regression, which fails for a near-vertical or near-horizontal
 * seam) over every vertex the chain actually passed through — Kirk's
 * live-walk finding: "the wall from the top seems like it is at an
 * angle." The engine's own run is only the CHORD between the chain's
 * first and last vertex; a hex-column seam's real vertices zigzag
 * +-half a hex by row parity, so that chord inherits a few degrees of
 * tilt from whichever two parities the endpoints happened to land on.
 * The fit's alternating offsets cancel over a large-enough, balanced
 * vertex set (see the module's own header doc, finding 3, for how
 * close this gets on the real reference-tomb data specifically, and
 * why it's not exactly zero there); a genuinely diagonal authored chain
 * still fits its own true diagonal (no axis is preferred). Returns
 * undefined for
 * a degenerate cloud (fewer than 2 distinct vertices, or all
 * coincident) — callers fall back to the engine's own raw chord.
 */
function fitLineDirection(
  vertices: readonly WorldPos[]
): { dir: WorldPos; centroid: WorldPos } | undefined {
  if (vertices.length < 2) return undefined;

  let meanX = 0;
  let meanZ = 0;
  for (const p of vertices) {
    meanX += p.x;
    meanZ += p.z;
  }
  meanX /= vertices.length;
  meanZ /= vertices.length;

  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (const p of vertices) {
    const dx = p.x - meanX;
    const dz = p.z - meanZ;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
  }
  if (sxx === 0 && szz === 0) return undefined;

  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  return {
    dir: { x: Math.cos(theta), z: Math.sin(theta) },
    centroid: { x: meanX, z: meanZ },
  };
}

/**
 * Re-extends ONE run onto a fitted line: its own two ALREADY-KNOWN
 * extreme points (the engine's own `rawStart`/`rawEnd` -- a chain's
 * first and last vertex ARE its extremes by construction of the
 * chaining walk itself, so no extra vertex scan is needed here),
 * projected onto that line. Deliberately projects the engine's own
 * FULL-PRECISION endpoints rather than any of the `key`-parsed vertices
 * (only accurate to the 5 decimals `vertexKey` formats to, plenty for
 * fitting a DIRECTION by averaging over many points, nowhere near
 * enough for a single run's own final position -- an early version of
 * this function used parsed vertices for the extent too, and a
 * single-edge chain's fitted position landed ~2.5e-6 off the true hex
 * corner, well past this module's own 1e-6 exact-match tests). Falls
 * back to the raw chord unchanged when no fitted `line` is available
 * (a degenerate cloud). Preserves the raw chord's own start/end
 * correspondence trivially, by construction (start always projects
 * from rawStart, end from rawEnd) -- door-side lookups keyed by
 * `RunEndpointRef.end` stay valid against the result.
 */
function extentAlongLine(
  rawStart: WorldPos,
  rawEnd: WorldPos,
  line: { dir: WorldPos; centroid: WorldPos } | undefined
): { start: WorldPos; end: WorldPos } {
  if (!line) return { start: rawStart, end: rawEnd };
  return {
    start: projectOntoLine(rawStart, line.centroid, line.dir),
    end: projectOntoLine(rawEnd, line.centroid, line.dir),
  };
}

/** Small array-backed union-find over run indices -- groups runs into
 * connected chains (shares an endpoint, or linked across a door's own
 * gap) so facing can be propagated per component below. */
class RunUnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root]!;
    let cur = x;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur]!;
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

interface DoorPlan {
  doorway: AtlasDoorway;
  from: CubeCoord;
  to: CubeCoord;
  gapCenter: WorldPos;
  gapStart: WorldPos;
  gapEnd: WorldPos;
  rotationY: number;
  aRef?: RunEndpointRef;
  bRef?: RunEndpointRef;
}

/**
 * boundariesToWallRuns is the module's one entry point: every declared
 * boundary and every doorway (as a chain break point) become one
 * straight-run scene, plus one DoorGapPiece per doorway. The floor's own
 * outer edge draws nothing — Kirk's ruling, same day as #787: "draw
 * nothing, floor ends into darkness. that seems more honest about the
 * void." An author who wants a visible outer wall draws one via
 * `atlas.boundaries`, same as any interior wall.
 */
export function boundariesToWallRuns(
  atlas: Pick<GetAtlasResponse, 'cells' | 'boundaries' | 'doorways'>,
  hexSize: number
): WallRunScene {
  // An empty floor has no doorway/boundary geometry worth deriving —
  // report an obviously-empty scene rather than let downstream geometry
  // silently degenerate (Copilot review, PR #764, the same guard this
  // module has always needed).
  if (atlas.cells.length === 0) {
    return { wallRuns: [], doorGaps: [] };
  }

  const cubes = atlas.cells.map(positionToCube);

  // A doorway "punches through" a boundary on the same cell pair -- a
  // shape this codebase already treats as valid (Copilot review, PR
  // #788). If both edges were fed to the chaining engine, the boundary
  // would still tile as a normal wall (the engine only uses door edges
  // as BREAK points; it doesn't remove an overlapping non-door edge),
  // covering the door opening with wall geometry. Precomputing every
  // doorway's own pair key lets the boundary loop below skip any
  // boundary edge a doorway already occupies, while the doorway edge
  // itself still goes in as `isDoor: true` so chaining trims/breaks
  // correctly around it.
  const doorwayPairs = new Set<string>();
  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    doorwayPairs.add(pairKey(positionToCube(d.from), positionToCube(d.to)));
  }

  const edges: AuthoredWallEdgeInput[] = [];

  for (const b of atlas.boundaries as AtlasBoundary[]) {
    if (!b.from || !b.to) continue;
    const from = positionToCube(b.from);
    const to = positionToCube(b.to);
    if (doorwayPairs.has(pairKey(from, to))) continue;
    edges.push({ from, to, isDoor: false });
  }

  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    edges.push({
      from: positionToCube(d.from),
      to: positionToCube(d.to),
      isDoor: true,
    });
  }

  const rawRuns = computeAuthoredWallRuns(edges, hexSize, cubes);

  // Find which run (if any) flanks each door on each side, against the
  // ENGINE'S OWN raw run positions -- the only place the DOOR_TRIM-
  // from-corner invariant `runIndexTrimmedAgainst` relies on actually
  // holds (the least-squares fit below moves every run's own endpoints
  // off that exact distance).
  interface DoorInfo {
    doorway: AtlasDoorway;
    from: CubeCoord;
    to: CubeCoord;
    a: WorldPos;
    b: WorldPos;
    mid: WorldPos;
    rawDir: WorldPos;
    rawRotationY: number;
    aRef?: RunEndpointRef;
    bRef?: RunEndpointRef;
  }
  const doorInfos: DoorInfo[] = [];
  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    const from = positionToCube(d.from);
    const to = positionToCube(d.to);
    const {
      a,
      b,
      mid,
      rotationY: rawRotationY,
    } = hexEdgeBetween(from, to, hexSize);
    doorInfos.push({
      doorway: d,
      from,
      to,
      a,
      b,
      mid,
      rawDir: unitDirection(a, b),
      rawRotationY,
      aRef: runIndexTrimmedAgainst(a, rawRuns),
      bRef: runIndexTrimmedAgainst(b, rawRuns),
    });
  }

  // Group runs into FITTING chains by door-link ONLY (not general
  // endpoint-adjacency): a door-adjacent hard break is an ARTIFACT of
  // this module's own door handling, not an authored corner, so the two
  // runs it splits are still one straight authored wall for fitting
  // purposes and should share ONE fitted line over their combined
  // vertex set (Kirk's live-walk finding: fitting a short, door-
  // truncated fragment ALONE can still carry a real residual tilt if
  // that one fragment's own parity mix isn't balanced -- the fit only
  // fully cancels the zigzag over the seam's real full extent). A
  // genuine corner (no door) is a REAL authored direction change with
  // no trim at all -- computeAuthoredWallRuns's own emitRun only trims
  // door-adjacent vertices -- so its two legs' raw endpoints coincide
  // at the exact corner vertex; grouping by general endpoint-adjacency
  // would indistinguishably merge that real corner's two legs into one
  // averaged (wrong) direction, which is exactly the zigzag-vs-corner
  // distinction CHAIN_TOLERANCE already drew once and this must not
  // re-blur. Facing propagation (below) deliberately uses a BROADER
  // grouping that also includes ordinary endpoint-adjacency -- that's
  // fine (even desirable) for facing, wrong for line-fitting.
  const fitChainUf = new RunUnionFind(rawRuns.length);
  for (const info of doorInfos) {
    if (info.aRef && info.bRef)
      fitChainUf.union(info.aRef.runIndex, info.bRef.runIndex);
  }

  // Direction fit input: the (5-decimal-rounded, see parseChainVertices'
  // own doc comment) parsed vertices -- fine for a direction estimate
  // averaged over many points, never used for a final position (see
  // extentAlongLine's own doc comment for the precision bug that
  // taught this).
  const chainVerticesByRoot = new Map<number, WorldPos[]>();
  for (let i = 0; i < rawRuns.length; i++) {
    const root = fitChainUf.find(i);
    const list = chainVerticesByRoot.get(root) ?? [];
    list.push(...parseChainVertices(rawRuns[i]!.key));
    chainVerticesByRoot.set(root, list);
  }
  const directionByRoot = new Map<number, WorldPos>();
  for (const [root, vertices] of chainVerticesByRoot) {
    const fit = fitLineDirection(vertices);
    if (fit) directionByRoot.set(root, fit.dir);
  }

  // Line anchor: the FULL-PRECISION mean of the chain's own real run
  // endpoints (never the rounded parsed vertices) -- any point genuinely
  // ON the fitted line works as an anchor for `projectOntoLine`, and
  // this one costs no precision.
  const anchorSumByRoot = new Map<number, WorldPos>();
  const anchorCountByRoot = new Map<number, number>();
  for (let i = 0; i < rawRuns.length; i++) {
    const root = fitChainUf.find(i);
    const sum = anchorSumByRoot.get(root) ?? { x: 0, z: 0 };
    sum.x += rawRuns[i]!.start.x + rawRuns[i]!.end.x;
    sum.z += rawRuns[i]!.start.z + rawRuns[i]!.end.z;
    anchorSumByRoot.set(root, sum);
    anchorCountByRoot.set(root, (anchorCountByRoot.get(root) ?? 0) + 2);
  }

  const runs: MutableRun[] = rawRuns.map((r, i) => {
    const root = fitChainUf.find(i);
    const dir = directionByRoot.get(root);
    const line = dir
      ? {
          dir,
          centroid: {
            x: anchorSumByRoot.get(root)!.x / anchorCountByRoot.get(root)!,
            z: anchorSumByRoot.get(root)!.z / anchorCountByRoot.get(root)!,
          },
        }
      : undefined;
    const fitted = extentAlongLine(r.start, r.end, line);
    return {
      start: fitted.start,
      end: fitted.end,
      key: r.key,
      facing: r.facing,
    };
  });

  // Pass 1: finalize every door's gap geometry against the FITTED
  // `runs` (the run INDEX each `DoorInfo` found is valid against both
  // `rawRuns` and `runs` -- same length, same order, no runs added or
  // removed).
  const plans: DoorPlan[] = [];
  for (const info of doorInfos) {
    const { doorway: d, from, to, mid, rawDir, rawRotationY } = info;
    const ref = info.aRef ?? info.bRef;

    let gapCenter = mid;
    let dir = rawDir;
    let rotationY = rawRotationY;
    if (ref) {
      const refRun = runs[ref.runIndex]!;
      const refNear = ref.end === 'start' ? refRun.start : refRun.end;
      const refFar = ref.end === 'start' ? refRun.end : refRun.start;
      const lineDir = unitDirection(refFar, refNear);
      // Orient the run's line direction to agree with the door's own
      // raw edge direction (a run's start/end order is arbitrary --
      // authoredWallRuns.ts's own doc: "the run's own start/end may
      // match either direction the chain happened to walk from").
      const agrees = lineDir.x * rawDir.x + lineDir.z * rawDir.z >= 0;
      dir = agrees ? lineDir : { x: -lineDir.x, z: -lineDir.z };
      gapCenter = projectOntoLine(mid, refNear, dir);
      rotationY = Math.atan2(-dir.z, dir.x);
    }

    const halfGap = DOOR_FRAME_CALIBRATED_WIDTH / 2;
    // gapStart sits on the `a`-corner side (dir was oriented to agree
    // with a->b), gapEnd on the `b`-corner side -- see the force-close
    // pass below, which relies on this correspondence.
    const gapStart: WorldPos = {
      x: gapCenter.x - dir.x * halfGap,
      z: gapCenter.z - dir.z * halfGap,
    };
    const gapEnd: WorldPos = {
      x: gapCenter.x + dir.x * halfGap,
      z: gapCenter.z + dir.z * halfGap,
    };

    plans.push({
      doorway: d,
      from,
      to,
      gapCenter,
      gapStart,
      gapEnd,
      rotationY,
      aRef: info.aRef,
      bRef: info.bRef,
    });
  }

  // Pass 2: force every flanking run to meet its door's own gap
  // boundary EXACTLY -- Kirk's live-walk finding ("the gap is what I
  // am most concerned with", a screenshot showing bare floor on both
  // sides of the frame): the engine's own corner-based trim and this
  // module's midpoint-based gap placement are two independent
  // computations that only approximately agree. Overwriting the
  // flanking run's endpoint with the gap's own boundary point removes
  // the second computation's independence entirely -- they meet by
  // construction, the same defect class ("the walls do not touch",
  // pre-#787) closed the same way it was closed the first time.
  for (const plan of plans) {
    if (plan.aRef) {
      const run = runs[plan.aRef.runIndex]!;
      if (plan.aRef.end === 'start') run.start = plan.gapStart;
      else run.end = plan.gapStart;
    }
    if (plan.bRef) {
      const run = runs[plan.bRef.runIndex]!;
      if (plan.bRef.end === 'start') run.start = plan.gapEnd;
      else run.end = plan.gapEnd;
    }
  }

  // Pass 3: propagate ONE facing per connected chain. Two runs are in
  // the same chain if they share a real endpoint (ordinary fragmentation
  // adjacency) or are the two runs one door's own gap now provably
  // connects (their endpoints sit on opposite sides of the frame, so
  // they never coincide, but the physical wall is continuous through
  // it) -- Kirk's live-walk finding: "one side is facing one way and
  // the other is the other."
  const uf = new RunUnionFind(runs.length);
  const ENDPOINT_EPS = 1e-6;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const ri = runs[i]!;
      const rj = runs[j]!;
      const shares =
        distance(ri.start, rj.start) < ENDPOINT_EPS ||
        distance(ri.start, rj.end) < ENDPOINT_EPS ||
        distance(ri.end, rj.start) < ENDPOINT_EPS ||
        distance(ri.end, rj.end) < ENDPOINT_EPS;
      if (shares) uf.union(i, j);
    }
  }
  for (const plan of plans) {
    if (plan.aRef && plan.bRef)
      uf.union(plan.aRef.runIndex, plan.bRef.runIndex);
  }
  // Flip (negate) a disagreeing run's OWN facing to agree with its
  // component's reference -- NOT replaced with the reference value
  // itself. `facing` is always perpendicular to the RUN IT CAME FROM
  // (computeAuthoredWallRuns derives it from that run's own direction);
  // WallRunMesh compares it against a naive orientation it derives from
  // that SAME run's own start/end to decide whether to flip a tile's
  // texture. Overwriting a run's facing with a DIFFERENT run's value
  // (one perpendicular to a different direction, however close) would
  // desync that comparison instead of fixing it. Negating a run's own
  // facing preserves "perpendicular to this run's own line" exactly
  // while correcting only which of the two perpendiculars it names.
  const referenceFacingByRoot = new Map<number, WorldPos>();
  for (let i = 0; i < runs.length; i++) {
    const root = uf.find(i);
    const reference = referenceFacingByRoot.get(root);
    if (!reference) {
      referenceFacingByRoot.set(root, runs[i]!.facing);
      continue; // this run IS the component's reference; keep its own value
    }
    const facing = runs[i]!.facing;
    const agrees = facing.x * reference.x + facing.z * reference.z >= 0;
    if (!agrees) {
      runs[i]!.facing = { x: -facing.x, z: -facing.z };
    }
  }

  const doorGaps: DoorGapPiece[] = plans.map((plan) => ({
    key:
      plan.doorway.connection ||
      `door:${coordToKey(plan.from)}|${coordToKey(plan.to)}`,
    connection: plan.doorway.connection,
    position: plan.gapCenter,
    leafPosition: plan.gapStart,
    rotationY: plan.rotationY,
  }));

  return { wallRuns: runs, doorGaps };
}

export type { CubeCoord };
