/**
 * wallGesture — the PURE derivation behind the wall tool's
 * press–drag–release (rpg-dnd5e-web#804; design + rulings:
 * rpg-project#267 `ideas/dungeon-builder/wall-authoring-gesture.md`).
 * Zero React: geometry in, edge lists out; `CreationBoard.tsx` only
 * holds pointer state and calls down here.
 *
 * The governing principle (recorded on #800): the old builder felt
 * right because the gesture itself was straight — the author drew the
 * line, the tool derived the cells. So the drag's endpoints snap to the
 * hex CORNER lattice (`hexCorner.ts`, the finest honest lattice this
 * grid has), the dragged segment derives its chain as the TAUT PATH
 * along the lattice, and each lattice edge walked separates exactly one
 * adjacent cell pair — that pair is one `walls[]` edge. Mechanics stay
 * the edge chain; the straight run is how it reads.
 *
 * # The preview IS the commit
 *
 * `applyWallDraw` / `applyWallErase` / `applyDoorDraw` / `applyReshape`
 * are used by BOTH the board's mid-drag candidate document (whose runs
 * `boardWallScene` renders live) and the release commit — one mutator
 * composition, so what the author sees mid-drag is float-identical to
 * what release produces. Never write a second geometry formula here:
 * the door-frame lesson (#787's "the walls do not touch") is exactly
 * two independent computations that only approximately agree.
 *
 * # The taut path
 *
 * Walk corner-to-corner from A, at each corner stepping to the incident
 * lattice edge that ADVANCES toward B (strictly decreases the distance;
 * on the honeycomb such a step always exists while v ≠ B) with LEAST
 * deviation from the infinite line AB. A drag along one of the grid's
 * own seam directions derives exactly the chain whose rendered run IS
 * that line — the column/row cases axis-true by the authored-pair
 * declaration (#802), pinned by `wallGesture.test.ts`; any other angle
 * derives the zigzag chain whose fitted run best expresses AB, visible
 * live: angle as intent, never an emergent surprise.
 *
 * One deliberate deterministic choice, pinned by the drag table: at a
 * corner where BOTH zigzag sides advance with identical deviation (a
 * drag lying exactly on a corner column), the tie breaks toward the
 * candidate with the greater x (then greater y). Geometric, so the
 * same line derives the same chain dragged from either end — an erase
 * drag re-derives what the draw derived.
 *
 * # Rulings encoded here (Kirk, 2026-08-25, PR #267)
 *
 * 1. Angle magnetism ON by default: a drag within ~6° of a seam family
 *    snaps the endpoint onto the dragged line; Alt = free angle
 *    (`snapGesturePoint`).
 * 2. Endpoint drag re-derives the WHOLE chain from the fixed far
 *    endpoint (`applyReshape` with one chain).
 * 3. Erase = shift/right-drag along a line, the region brush's own
 *    grammar (`deriveWallErase` — door edges never touched).
 * 4. A shared corner vertex is a drag handle: every incident chain
 *    re-derives from its own far endpoint to the new vertex
 *    (`runVertices` finds them; `applyReshape` with many chains).
 */
import type { Point } from '../../concepts/session-tomb/atlas';
import {
  addDoor,
  addWalls,
  doorEdgeOwners,
  floorOwners,
  removeWalls,
  wallKeys,
  type DungeonDoc,
} from '../dungeonYaml';
import { axialKey, edgeKey, type Edge, type Orientation } from '../hexOffset';
import { edgeSegment } from './canvasGeometry';
import {
  cornerKey,
  cornerNeighbors,
  cornerPoint,
  latticeEdgeCells,
  nearestCorner,
  sameCorner,
  type CornerRef,
} from './hexCorner';

/**
 * Every tuning constant of the gesture, in ONE exported place, pinned
 * by tests (the design's own rule). Radii are fractions of the board's
 * hex size. These are STARTING points — Kirk's walk on :3001 is the
 * calibration instrument, the same way facing yaw was measured, not
 * inferred; recalibration lands here and re-pins.
 */
export const GESTURE_TUNING = {
  /** Handle pickup radius around a selected run's RENDERED endpoint
   * or shared corner (Select tool — manipulation rides selection,
   * Kirk's walk ruling). */
  cornerSnapRadius: 0.4,
  /** Existing-wall-vertex magnetism on the drag endpoints, measured at
   * the RENDERED endpoint the author aims at (never the lattice vertex
   * behind it — see RunVertex) and STRONGER than the plain lattice
   * snap: landing on a chain's vertex is what closes a corner by
   * construction. */
  wallVertexSnapRadius: 0.6,
  /** Ruling 1: drag direction within this many degrees of a seam
   * family snaps the endpoint onto the dragged line; Alt bypasses. */
  angleToleranceDeg: 6,
  /** Select-tool hit radius around a rendered run's segment. */
  runHitRadius: 0.25,
} as const;

/**
 * The four seam-direction families of ruling 1, as SVG-space angles
 * mod 180° (y-down, `atan2(dy, dx)`): the horizontal row seam, the two
 * diagonal families (the axial r and q−r cell-chain directions), and
 * the vertical column seam. Flat-top is the same lattice rotated 30°.
 */
export function seamAngles(o: Orientation): readonly number[] {
  return o === 'pointy' ? [0, 60, 90, 120] : [30, 90, 120, 150];
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * The taut path from corner A to corner B: the chain of `walls[]`-shaped
 * cell-pair edges whose lattice edges the walk crosses, in walk order.
 * A = B derives nothing (the release-cancel case). The walk terminates
 * by construction — every step strictly decreases the distance to B,
 * and on the honeycomb a strictly-decreasing neighbor always exists
 * while v ≠ B (the three incident edge directions are 120° apart, so
 * one is always within 60° of "toward B"; the step-count guard is a
 * defensive floor, not a reachable exit).
 */
export function tautPath(
  a: CornerRef,
  b: CornerRef,
  size: number,
  o: Orientation
): Edge[] {
  if (sameCorner(a, b, size, o)) return [];
  const pa = cornerPoint(a, size, o);
  const pb = cornerPoint(b, size, o);
  const len = distance(pa, pb);
  const ux = (pb.x - pa.x) / len;
  const uy = (pb.y - pa.y) / len;
  const stepEps = 1e-6 * size;
  const tieEps = 1e-9 * size;
  const maxSteps = Math.ceil(len / size) * 4 + 12;

  const edges: Edge[] = [];
  let v = a;
  let vp = pa;
  for (let step = 0; step < maxSteps; step += 1) {
    if (sameCorner(v, b, size, o)) break;
    let next: CornerRef | null = null;
    let nextPoint: Point = vp;
    let bestDeviation = Infinity;
    const dHere = distance(vp, pb);
    for (const w of cornerNeighbors(v, size, o)) {
      const wp = cornerPoint(w, size, o);
      if (distance(wp, pb) >= dHere - stepEps) continue; // must advance
      // Deviation from the infinite line AB (perpendicular distance).
      const deviation = Math.abs(ux * (wp.y - pa.y) - uy * (wp.x - pa.x));
      const better =
        deviation < bestDeviation - tieEps ||
        (Math.abs(deviation - bestDeviation) <= tieEps &&
          (wp.x > nextPoint.x + tieEps ||
            (Math.abs(wp.x - nextPoint.x) <= tieEps &&
              wp.y > nextPoint.y + tieEps)));
      if (next === null || better) {
        next = w;
        nextPoint = wp;
        bestDeviation = deviation;
      }
    }
    if (next === null) break; // unreachable on a real lattice; see doc
    const edge = latticeEdgeCells(v, next, size, o);
    if (edge) edges.push(edge);
    v = next;
    vp = nextPoint;
  }
  return edges;
}

/**
 * The derivation rules on a raw chain, for DRAWING walls: a pair that
 * is not two floor cells is skipped (the envelope is implied, never
 * authored — design §2); an edge already in `walls[]` is deduplicated
 * silently (drawing over a wall is idempotent); an edge belonging to a
 * door is skipped and the chain breaks there (runs already break at
 * doorways; an edge in both lists is a validation failure the gesture
 * never authors).
 */
export function deriveWallAdd(doc: DungeonDoc, chain: Edge[]): Edge[] {
  const floor = floorOwners(doc);
  const doors = doorEdgeOwners(doc);
  const walls = wallKeys(doc);
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const e of chain) {
    const key = edgeKey(e);
    if (
      !floor.has(axialKey(e[0])) ||
      !floor.has(axialKey(e[1])) ||
      doors.has(key) ||
      walls.has(key) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** The erase drag's edges: whatever of the chain is PRESENT in
 * `walls[]`. Door edges are never listed — they are never in `walls[]`
 * (ruling 3: the wall eraser never touches doors). */
export function deriveWallErase(doc: DungeonDoc, chain: Edge[]): Edge[] {
  const walls = wallKeys(doc);
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const e of chain) {
    const key = edgeKey(e);
    if (!walls.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** The door drag's edges: floor pairs not already claimed by a door.
 * Walls on the chain are NOT filtered here — `addDoor` replaces them
 * (an edge is a wall OR a door, `toggleDoorEdge`'s own rule). */
export function deriveDoorAdd(doc: DungeonDoc, chain: Edge[]): Edge[] {
  const floor = floorOwners(doc);
  const doors = doorEdgeOwners(doc);
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const e of chain) {
    const key = edgeKey(e);
    if (
      !floor.has(axialKey(e[0])) ||
      !floor.has(axialKey(e[1])) ||
      doors.has(key) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The one formula, applied — used by BOTH the board's mid-drag candidate
// document (the live preview) and the release commit, so preview ≡ commit
// by construction (the design's one-formula law; wallGesture.test.ts
// asserts it float-exactly anyway).
// ---------------------------------------------------------------------------

export function applyWallDraw(doc: DungeonDoc, chain: Edge[]): DungeonDoc {
  return addWalls(doc, deriveWallAdd(doc, chain));
}

export function applyWallErase(doc: DungeonDoc, chain: Edge[]): DungeonDoc {
  return removeWalls(doc, deriveWallErase(doc, chain));
}

export function applyDoorDraw(doc: DungeonDoc, chain: Edge[]): DungeonDoc {
  return addDoor(doc, deriveDoorAdd(doc, chain));
}

/**
 * Rulings 2 and 4 in one operation: remove every dragged chain's old
 * edges, then re-derive each incident chain from its own fixed far
 * endpoint (the caller walks `tautPath` per chain and passes the raw
 * chains in). The endpoint grab is the one-incident-chain case of the
 * shared-corner grab.
 */
export function applyReshape(
  doc: DungeonDoc,
  oldChains: readonly Edge[][],
  newChains: readonly Edge[][]
): DungeonDoc {
  let next = removeWalls(
    doc,
    oldChains.flatMap((chain) => chain)
  );
  for (const chain of newChains) {
    next = applyWallDraw(next, chain);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Vertices and snapping
// ---------------------------------------------------------------------------

/** A vertex where rendered runs end: the drag handles and the
 * wall-vertex magnetism targets. `ref` is the chain-end LATTICE vertex
 * (what derivation anchors to); `point` is the RENDERED endpoint the
 * author actually sees. The two differ by up to ~half a hex — the
 * least-squares/axis fit, corner closure, and overlap margin all move
 * a run's drawn end off the raw lattice (measured live on Kirk's walk:
 * 0.15–0.52·size depending on chain angle, vs a 0.6·size magnet
 * radius). Magnetism centered on the lattice vertex therefore missed
 * exactly where he aimed — "I cannot get that upper right corner to
 * snap in." Select the thing you see applies to magnetism too: snap
 * and display live on `point`, derivation on `ref`. `runs` holds the
 * indices of every incident run — 1 = an endpoint handle, 2+ = a
 * shared corner (ruling 4). */
export interface RunVertex {
  ref: CornerRef;
  point: Point;
  runs: number[];
}

/** A run's chain endpoints: the odd-degree vertices of its own lattice
 * segments (a run's chain is a path, so exactly two). The lattice
 * segment of each doc edge comes from `edgeSegment` — the SAME
 * corner-to-corner geometry the board draws literal edges with. */
export function chainEndpoints(
  edges: readonly Edge[],
  size: number,
  o: Orientation
): CornerRef[] {
  const degree = new Map<string, { ref: CornerRef; count: number }>();
  for (const e of edges) {
    const seg = edgeSegment(e, size, o);
    if (!seg) continue;
    for (const p of [seg.a, seg.b]) {
      const ref = nearestCorner(p, size, o);
      const key = cornerKey(ref, size, o);
      const entry = degree.get(key);
      if (entry) entry.count += 1;
      else degree.set(key, { ref, count: 1 });
    }
  }
  return [...degree.values()]
    .filter((v) => v.count % 2 === 1)
    .map((v) => v.ref);
}

/** A scene-shaped run: its rendered segment plus the doc edges behind
 * it (`BoardWallRun`'s own shape, structurally). */
export interface SceneRunLike {
  a: Point;
  b: Point;
  edges: readonly Edge[];
}

/**
 * Every run-endpoint vertex over the rendered runs, grouped by
 * physical lattice vertex — the magnetism targets and the handles.
 * Each vertex's `point` is the mean of the incident runs' own rendered
 * endpoints on that side (each run's endpoint is matched to whichever
 * of its two chain-end lattice vertices sits nearer): at a closed
 * corner the incident runs' drawn ends all sit within the overlap
 * margin of the shared joint, so the mean is the visible corner point.
 */
export function runVertices(
  runs: readonly SceneRunLike[],
  size: number,
  o: Orientation
): RunVertex[] {
  const byKey = new Map<
    string,
    {
      ref: CornerRef;
      sumX: number;
      sumY: number;
      count: number;
      runs: number[];
    }
  >();
  runs.forEach((run, runIndex) => {
    const ends = chainEndpoints(run.edges, size, o);
    if (ends.length !== 2) return; // degenerate (loop / empty) — no handles
    // Match each lattice endpoint to the nearer rendered endpoint; the
    // fit preserves the chain's extremes, so the pairing is unambiguous.
    const [e0, e1] = ends;
    const p0 = cornerPoint(e0, size, o);
    const assignAtoE0 =
      Math.hypot(run.a.x - p0.x, run.a.y - p0.y) <=
      Math.hypot(run.b.x - p0.x, run.b.y - p0.y);
    const pairs: [CornerRef, Point][] = assignAtoE0
      ? [
          [e0, run.a],
          [e1, run.b],
        ]
      : [
          [e0, run.b],
          [e1, run.a],
        ];
    for (const [ref, rendered] of pairs) {
      const key = cornerKey(ref, size, o);
      const entry = byKey.get(key);
      if (entry) {
        entry.sumX += rendered.x;
        entry.sumY += rendered.y;
        entry.count += 1;
        entry.runs.push(runIndex);
      } else {
        byKey.set(key, {
          ref,
          sumX: rendered.x,
          sumY: rendered.y,
          count: 1,
          runs: [runIndex],
        });
      }
    }
  });
  return [...byKey.values()].map((v) => ({
    ref: v.ref,
    point: { x: v.sumX / v.count, y: v.sumY / v.count },
    runs: v.runs,
  }));
}

export interface SnapOptions {
  /** The press anchor A's own point — enables angle magnetism. */
  origin?: Point;
  /** Ruling 1: Alt = free angle (no seam snapping). */
  alt?: boolean;
  /** Existing wall vertices — the STRONGEST magnetism; landing on one
   * shares it, and a shared vertex IS a closed corner. */
  wallVertices?: readonly RunVertex[];
}

/**
 * Where a gesture endpoint lands for a raw pointer position — the two
 * magnetisms of the design, strongest first: (1) an existing wall
 * vertex within `wallVertexSnapRadius`, else (2) the corner lattice,
 * with the drag direction angle-snapped onto the nearest seam family
 * within `angleToleranceDeg` first (unless Alt): the pointer projects
 * onto the seam line through the press anchor, and the projection's
 * nearest corner is the endpoint.
 */
export function snapGesturePoint(
  point: Point,
  size: number,
  o: Orientation,
  opts: SnapOptions = {}
): CornerRef {
  const magnetRadius = GESTURE_TUNING.wallVertexSnapRadius * size;
  let magnet: RunVertex | null = null;
  let magnetDist = Infinity;
  for (const v of opts.wallVertices ?? []) {
    const d = distance(point, v.point);
    if (d <= magnetRadius && d < magnetDist) {
      magnet = v;
      magnetDist = d;
    }
  }
  if (magnet) return magnet.ref;

  let target = point;
  if (opts.origin && !opts.alt) {
    const dx = point.x - opts.origin.x;
    const dy = point.y - opts.origin.y;
    if (dx !== 0 || dy !== 0) {
      const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 180) % 180;
      let best: number | null = null;
      let bestDelta = Infinity;
      for (const seam of seamAngles(o)) {
        const raw = Math.abs(angle - seam);
        const delta = Math.min(raw, 180 - raw);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = seam;
        }
      }
      if (best !== null && bestDelta <= GESTURE_TUNING.angleToleranceDeg) {
        const rad = (best * Math.PI) / 180;
        const ux = Math.cos(rad);
        const uy = Math.sin(rad);
        const t = dx * ux + dy * uy;
        target = {
          x: opts.origin.x + ux * t,
          y: opts.origin.y + uy * t,
        };
      }
    }
  }
  return nearestCorner(target, size, o);
}

/**
 * Select the thing you see: the index of the run whose rendered segment
 * `point` sits within `runHitRadius` of (nearest wins), or null. Runs
 * are the board's own projected segments (`BoardWallRun.a`/`b`).
 */
export function nearestRunIndex(
  runs: readonly { a: Point; b: Point }[],
  point: Point,
  size: number
): number | null {
  const radius = GESTURE_TUNING.runHitRadius * size;
  let best: number | null = null;
  let bestDist = Infinity;
  runs.forEach((run, i) => {
    const vx = run.b.x - run.a.x;
    const vy = run.b.y - run.a.y;
    const lenSq = vx * vx + vy * vy;
    const t =
      lenSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - run.a.x) * vx + (point.y - run.a.y) * vy) / lenSq
            )
          );
    const d = Math.hypot(
      run.a.x + vx * t - point.x,
      run.a.y + vy * t - point.y
    );
    if (d <= radius && d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}
