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
 * # Doors are placed from their own edge, not a derived row fraction
 *
 * Every `atlas.doorways` entry gets its own gap + frame independently,
 * computed straight from that doorway's own `hexEdgeBetween` geometry
 * (mid + rotation) — no Map keyed by "chamber pair" to lose a second
 * door on the same seam to (rpg-dnd5e-web#782), because there is no such
 * Map anymore: every doorway is processed once, unconditionally. The
 * chaining call above independently guarantees the wall runs stop short
 * of every doorway's own vertex (the engine's own
 * `DOOR_FRAME_CALIBRATED_WIDTH/2` trim), so the two never disagree about
 * where the gap is.
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

function unitDirection(a: WorldPos, b: WorldPos): WorldPos {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
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
    const dir = unitDirection(a, b);
    const halfGap = DOOR_FRAME_CALIBRATED_WIDTH / 2;
    doorGaps.push({
      key: d.connection || `door:${coordToKey(from)}|${coordToKey(to)}`,
      connection: d.connection,
      position: mid,
      leafPosition: {
        x: mid.x - dir.x * halfGap,
        z: mid.z - dir.z * halfGap,
      },
      rotationY,
    });
  }

  return { wallRuns, doorGaps };
}

export type { CubeCoord };
