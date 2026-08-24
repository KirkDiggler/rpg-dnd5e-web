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
 * # Doors are placed from their own edge, not a derived row fraction —
 * but ALIGNED to the straightened run they interrupt, not their own raw
 * hex-edge angle
 *
 * Every `atlas.doorways` entry gets its own gap + frame independently —
 * no Map keyed by "chamber pair" to lose a second door on the same seam
 * to (rpg-dnd5e-web#782), because there is no such Map anymore: every
 * doorway is processed once, unconditionally.
 *
 * Kirk's live walk on this same PR, after the walls were straightened:
 * "walls look straight now but the door follows the hex edge." The
 * chaining call trims the run(s) flanking a door by exactly
 * `DOOR_FRAME_CALIBRATED_WIDTH/2` back from the door's own hex corner
 * (`computeAuthoredWallRuns`'s own `emitRun`) — so a run's trimmed
 * endpoint sits at a KNOWN, exact distance from that corner. Finding
 * whichever run has an endpoint at that exact distance from one of the
 * door's own two corners recovers, from the outside, which run the door
 * interrupts and on which side, with no change to the chaining engine
 * itself. The door's gap CENTER is the door's own real edge midpoint
 * PROJECTED onto that run's straightened line (not the run's own
 * midpoint, and not the door's raw hex-edge midpoint used verbatim) —
 * a straight run only approximates the real zigzag it replaces, so the
 * two midpoints generally differ by a small amount; projecting keeps
 * the door glued to the wall plane it actually renders in. Rotation
 * matches the run's own direction, not the door's raw hex edge's — the
 * defect Kirk found. A door whose edge touches no wall run's trimmed
 * endpoint on EITHER side (a standalone doorway with no wall around it
 * — legal: a doorway is a door with no state) falls back to its own raw
 * `hexEdgeBetween` geometry, since nothing straighter exists to align
 * with.
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
  /** Frame placement — the doorway's own edge midpoint. */
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

/** Whichever run in `wallRuns` has an endpoint at EXACTLY `DOOR_TRIM`
 * from `corner` (one of a doorway's own two hex-edge corners) -- the run
 * that corner's own trim pulled back, i.e. the run this door interrupts
 * on that side. Returns the matched endpoint and the run's OTHER
 * endpoint (enough to reconstruct the run's line without re-deriving
 * direction ambiguity), or undefined if no run was trimmed against this
 * corner (a standalone doorway with no wall on that side). */
function runTrimmedAgainst(
  corner: WorldPos,
  wallRuns: readonly AuthoredWallRun[]
): { near: WorldPos; far: WorldPos } | undefined {
  for (const run of wallRuns) {
    if (Math.abs(distance(run.start, corner) - DOOR_TRIM) < 1e-6) {
      return { near: run.start, far: run.end };
    }
    if (Math.abs(distance(run.end, corner) - DOOR_TRIM) < 1e-6) {
      return { near: run.end, far: run.start };
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

  const wallRuns = computeAuthoredWallRuns(edges, hexSize, cubes);

  const doorGaps: DoorGapPiece[] = [];
  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    const from = positionToCube(d.from);
    const to = positionToCube(d.to);
    const { a, b, mid, rotationY } = hexEdgeBetween(from, to, hexSize);
    const rawDir = unitDirection(a, b);

    // Prefer whichever side of the door has a real trimmed run to align
    // with (the corner named `a` first, purely a deterministic tie-break
    // when both sides do — the two flanking runs are parts of the same
    // authored seam, so their lines are already close). Neither side
    // found -> standalone doorway, fall back to the door's own raw edge.
    const ref =
      runTrimmedAgainst(a, wallRuns) ?? runTrimmedAgainst(b, wallRuns);

    let gapCenter = mid;
    let dir = rawDir;
    if (ref) {
      const lineDir = unitDirection(ref.far, ref.near);
      // Orient the run's line direction to agree with the door's own
      // raw edge direction (a run's start/end order is arbitrary --
      // authoredWallRuns.ts's own doc: "the run's own start/end may
      // match either direction the chain happened to walk from") so the
      // gap/leaf convention below stays consistent with the untrimmed
      // fallback path.
      const agrees = lineDir.x * rawDir.x + lineDir.z * rawDir.z >= 0;
      dir = agrees ? lineDir : { x: -lineDir.x, z: -lineDir.z };
      gapCenter = projectOntoLine(mid, ref.near, dir);
    }

    const halfGap = DOOR_FRAME_CALIBRATED_WIDTH / 2;
    doorGaps.push({
      key: d.connection || `door:${coordToKey(from)}|${coordToKey(to)}`,
      connection: d.connection,
      position: gapCenter,
      leafPosition: {
        x: gapCenter.x - dir.x * halfGap,
        z: gapCenter.z - dir.z * halfGap,
      },
      rotationY: ref ? Math.atan2(-dir.z, dir.x) : rotationY,
    });
  }

  return { wallRuns, doorGaps };
}

export type { CubeCoord };
