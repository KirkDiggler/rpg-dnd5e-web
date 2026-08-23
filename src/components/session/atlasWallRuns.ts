/**
 * atlasWallRuns — turns the session wire's DECLARED interior boundaries,
 * doorways, and floor cell mask into straight wall RUNS, by chaining the
 * AUTHORED edges themselves (rpg-dnd5e-web#787) — not by reconstructing
 * "chamber" geometry the wire never declares.
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
 * # The fix: chain the real edges, don't infer regions
 *
 * `atlas.cells` + `atlas.boundaries` + `atlas.doorways` already carry
 * everything needed. This module builds one flat list of hex-adjacency
 * edges — every declared boundary, every doorway (as a break point, see
 * below), and every floor-cell-vs-void edge (the envelope, implied
 * exactly as the design ruling says: the author never draws it, it's
 * derived from the floor mask) — and hands the whole thing to
 * `authoredWallRuns.computeAuthoredWallRuns`, the chaining engine an
 * earlier slice (rpg-dnd5e-web#723-family) already built and proved for
 * exactly this problem: walk a graph of real hex edges into straight
 * runs via a Douglas-Peucker-style distance tolerance (a real zigzag
 * "eats" only a bounded amount before a chord across it stops matching
 * every visited vertex; a genuine corner's deviation grows unboundedly
 * the moment the walk is forced past it), breaking at branches, dead
 * ends, and door-adjacent vertices. It already handles closed loops
 * (Phase 2 of its own walk) — exactly what a floor's outer envelope is
 * — and isolated single-edge chains (a partial interior wall that
 * doesn't split anything renders as its own one-edge run, nothing to
 * drop).
 *
 * Feeding interior boundaries AND envelope edges into the SAME chaining
 * call (rather than two separate passes) is deliberate: they share the
 * real hex-corner graph, so a seam that reaches the floor's outer edge
 * MEETS the envelope run there by construction (the two runs share a
 * vertex) — Kirk's earlier "the walls do not touch" finding (PR #764)
 * doesn't need its own snapping step to not reappear; there's no seam
 * between two independently-computed pieces of geometry for it to hide
 * in anymore. `hexEdgeBetween`'s corner positions sit at the hex's own
 * apothem, not a cell center — this codebase's own
 * `DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES` doc comment (wallRuns.ts)
 * already established that the bare apothem is sufficient clearance for
 * the boundary hex's own footprint, with the old 1.0-hex value being
 * "~0.134 more than the bare apothem, a modest safety margin" — so no
 * additional outward push is applied here. If that reads as too tight
 * in-game, it's a real follow-up (a small facing-aligned nudge), not a
 * geometry bug this rewrite claims to rule out.
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
  getHexNeighbors,
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

/**
 * boundariesToWallRuns is the module's one entry point: every declared
 * boundary, every doorway (as a chain break point), and every implied
 * floor/void envelope edge become one straight-run scene, plus one
 * DoorGapPiece per doorway.
 */
export function boundariesToWallRuns(
  atlas: Pick<GetAtlasResponse, 'cells' | 'boundaries' | 'doorways'>,
  hexSize: number
): WallRunScene {
  // An empty floor has no cells to derive envelope edges from at all —
  // report an obviously-empty scene rather than let downstream geometry
  // silently degenerate (Copilot review, PR #764, the same guard this
  // module has always needed).
  if (atlas.cells.length === 0) {
    return { wallRuns: [], doorGaps: [] };
  }

  const cubes = atlas.cells.map(positionToCube);
  const floorKeys = new Set(cubes.map(coordToKey));

  const edges: AuthoredWallEdgeInput[] = [];

  for (const b of atlas.boundaries as AtlasBoundary[]) {
    if (!b.from || !b.to) continue;
    edges.push({
      from: positionToCube(b.from),
      to: positionToCube(b.to),
      isDoor: false,
    });
  }

  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) continue;
    edges.push({
      from: positionToCube(d.from),
      to: positionToCube(d.to),
      isDoor: true,
    });
  }

  // The envelope: implied, never authored — every floor cell's edge
  // against a neighbor that is NOT floor. Fed into the same chaining
  // call as the interior boundaries above (see module doc comment for
  // why that's what makes a seam MEET the envelope with no separate
  // snapping step).
  for (const cube of cubes) {
    for (const neighbor of getHexNeighbors(cube)) {
      if (floorKeys.has(coordToKey(neighbor))) continue;
      edges.push({ from: cube, to: neighbor, isDoor: false });
    }
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
