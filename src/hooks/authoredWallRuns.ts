/**
 * authoredWallRuns — chains an AUTHORED (canvas) dungeon's real wall edges
 * into straight RUNS and renders them through the same tiled-Synty-piece
 * language wallRuns.ts/WallRunMesh.tsx already use for chain-generated
 * rooms (rpg-project#133's envelope/connector runs), instead of the legacy
 * per-hex-edge renderer (SyntyHexWall) that produces one small piece per
 * single hex edge at that edge's own local rotation — the "vertical
 * blinds" jagged look a straight authored wall currently renders as.
 *
 * Why this can't reuse wallRuns.ts's `computeWallRuns` as-is: that module
 * derives a room's envelope purely from a REGION's bounding rectangle
 * (min/max col/row over its revealed hex membership) — correct only when
 * the region genuinely IS the room (a chain-generated dungeon, where the
 * toolkit's generator emits perimeter/connector Wall entries for exactly
 * that rectangle). An authored dungeon's `regions:` are semantic-only
 * zones (fog/reveal/naming, spec §4.10.2.4) with no guaranteed
 * relationship to the real wall shape (rpg-dnd5e-web#720 "zones are not
 * rooms": a painted zone can be non-rectangular, can extend past the real
 * walls, or can have no wall truth behind it at all) — synthesizing an
 * envelope from its bounding box would draw fictional walls again, the
 * exact bug #720 fixed. The only trustworthy input for an authored wall's
 * shape is the real wall EDGES themselves (wallLines->edges projection,
 * PR #723) — this module chains THOSE into runs directly, with no notion
 * of region/zone geometry at all.
 *
 * The chaining rule (a Douglas-Peucker-style greedy walk — see
 * `CHAIN_TOLERANCE`'s own doc comment for why a distance test replaced
 * this file's first design, a "cap at 2 direction families" rule that
 * real wire data broke): starting from one wall edge, extend the chain
 * edge by edge through the shared-vertex graph as long as EVERY vertex
 * visited so far stays within one hex radius of the straight chord from
 * the chain's own start to the current candidate end. A real hex-grid
 * "staircase" boundary (the same zigzag wallRuns.ts's own top/bottom
 * envelope sides already collapse into one straight chord) never departs
 * from its own true chord by more than a fraction of a hex radius, so the
 * walk sails through it; a genuine corner's deviation grows without bound
 * the moment the chain is forced past the turn, so it reliably breaks
 * there within a step or two. This needs no assumption about axis
 * alignment or a fixed number of edge orientations, so it generalizes to
 * an arbitrarily-angled hand-drawn wall, not just rectangles. Chains also
 * break at any branch/junction (a vertex with more than 2 wall edges) or
 * dead end (1 edge), and at any vertex a DOOR edge touches (a door is its
 * own separate piece, rendered by the existing per-edge door path — see
 * this file's own `isDoor` doc on `AuthoredWallEdgeInput`).
 */

import {
  cubeToWorld,
  HEX_SIZE,
  hexEdgeBetween,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import type { WallRunSegment } from './wallRuns';

/**
 * One real wall edge between two adjacent hexes — `from`/`to` must be
 * exactly one hex step apart (the "boundary-edge" wire shape a real
 * authored wall or a chain dungeon's own perimeter/connector entry takes;
 * see syntyHexWallHelpers.ts's `collectWallHexes` doc comment for the full
 * wire-shape taxonomy). A degenerate (from === to, "blocked cell") entry
 * is a different shape entirely (a genuine obstacle, e.g. a crypt pillar)
 * and does not belong in this module's input at all — the caller
 * (wallRunAdapters.ts's `authoredWallRunEdgeInputs`) filters those out
 * before this module ever sees them.
 */
export interface AuthoredWallEdgeInput {
  /** Wall.id, when present (doors carry one; plain wall edges usually
   * don't) — carried through onto the resulting run's own `key` so a
   * caller can trace a run back to its source data if needed. */
  id?: string;
  from: CubeCoord;
  to: CubeCoord;
  /**
   * True for a DOOR_* kind edge. A door edge is never itself tiled into a
   * run (it keeps rendering via the existing per-edge door frame/leaf
   * path, SyntyHexWall's `isDoorWallKind` branch, unaffected by this
   * module) — but it still participates in the CHAINING graph as a
   * forced break point, so the two wall runs flanking a door correctly
   * stop short of it (trimmed to the same `DOOR_FRAME_CALIBRATED_WIDTH`
   * half-width envelope wallRuns.ts's connector runs already use) instead
   * of tiling straight through the door opening.
   */
  isDoor: boolean;
}

/** One straight authored wall run — a chain of contiguous, straight-enough
 * wall edges collapsed into one straight chord, ready for the same
 * `tileWallSegment`/`GlbInstance` tiling wallRuns.ts's envelope/connector
 * runs already use. */
export interface AuthoredWallRun extends WallRunSegment {
  /** Stable React-list key: the sorted, joined ids/vertex-keys of every
   * edge this run collapsed — deterministic across renders for the same
   * input data, never array index (this module's own convention, matching
   * wallRunMeshHelpers.segmentKey's "derive from the segment's own
   * identity, not position" rule). */
  key: string;
  /** Unit vector (world x/z) this run's tiled pieces should face outward
   * — see wallRuns.ts's `EnvelopeRun.facing` doc comment for the defect
   * this corrects (a tiled piece's detailed face vs. flat back). Derived
   * from this run's own connected wall network's vertex centroid (the
   * closest available stand-in for "room center" this protocol-agnostic,
   * zone-independent module has) rather than a region's bounding box. */
  facing: WorldPos;
}

/** Exported so a caller building the same `AuthoredWallEdgeInput[]` this
 * module chains can recover, from a resulting run's own `key`, exactly
 * WHICH of the caller's own edges (real cube `from`/`to` cell identity)
 * contributed to that run -- by recomputing this SAME token for each of
 * its own edges and matching against the key's own `;`-joined tokens
 * (rpg-dnd5e-web#799: atlasWallRuns.ts's seam-fit needs each
 * constituent boundary PAIR's cell identity, which a hex-CORNER vertex
 * alone can't disambiguate -- a corner is shared by up to 3 cells). */
export function vertexKey(p: WorldPos): string {
  // Hex-corner world positions are deterministic trig results (same
  // formula, same inputs -> bit-identical floats) for any two edges
  // genuinely sharing a vertex, but round anyway as a defensive tolerance
  // against float drift between independently-computed edges.
  return `${p.x.toFixed(5)},${p.z.toFixed(5)}`;
}

function distance(a: WorldPos, b: WorldPos): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function unitDir(a: WorldPos, b: WorldPos): WorldPos {
  const len = distance(a, b);
  if (len === 0) return { x: 0, z: 0 };
  return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
}

interface EdgeGeom {
  input: AuthoredWallEdgeInput;
  a: WorldPos;
  b: WorldPos;
  aKey: string;
  bKey: string;
}

function otherEnd(
  g: EdgeGeom,
  fromKey: string
): { key: string; pos: WorldPos } {
  return g.aKey === fromKey
    ? { key: g.bKey, pos: g.b }
    : { key: g.aKey, pos: g.a };
}

/** Union-find over every vertex touched by ANY edge (door or not — a
 * "room" naturally includes its own doors) so each run can look up its
 * own connected wall network's centroid for outward-facing purposes,
 * independent of region/zone data (see AuthoredWallRun.facing's doc
 * comment). Small, self-contained; authored wall networks are never large
 * enough to need path compression's asymptotic benefit, but it costs
 * nothing to include. */
class UnionFind {
  private parent = new Map<string, string>();

  find(key: string): string {
    let root = this.parent.get(key) ?? key;
    if (!this.parent.has(key)) this.parent.set(key, key);
    while (root !== this.parent.get(root)) {
      root = this.parent.get(root)!;
    }
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Chain every non-door wall edge into straight runs, breaking at branches/
 * dead ends, door-adjacent vertices, and genuine corners (a 3rd distinct
 * edge orientation) — see this file's own header doc for the full rule.
 * `hexSize` defaults to the game's standard `HEX_SIZE` so a real caller
 * never has to pass it explicitly, matching `computeWallRuns`' own
 * convention.
 *
 * `floorHexes` (optional): every hex cell the caller independently knows
 * is real floor (e.g. `RegionInput.hexes` flattened) — used ONLY to
 * ground each run's outward `facing` in physical floor proximity rather
 * than the connected-component-centroid fallback (see
 * `facingViaFloorProximity`'s own doc comment for why the centroid
 * heuristic breaks down on a finely irregular boundary, and why this is
 * the fix). Passing region/zone hex data here does not reintroduce the
 * #720 "zones are not rooms" defect — that bug was synthesizing wall
 * GEOMETRY from a zone's bounding box; this only asks "is there floor
 * near this side of an ALREADY-real wall edge," a much weaker, orienting-
 * only use that degrades to the centroid fallback if the zone data
 * happens to be wrong or absent, never fabricates a wall that isn't
 * there. Omitted (every caller before this parameter existed) keeps the
 * centroid-based facing unchanged.
 */
export function computeAuthoredWallRuns(
  edges: AuthoredWallEdgeInput[],
  hexSize: number = HEX_SIZE,
  floorHexes?: CubeCoord[]
): AuthoredWallRun[] {
  const geoms: EdgeGeom[] = edges.map((input) => {
    const { a, b } = hexEdgeBetween(input.from, input.to, hexSize);
    return { input, a, b, aKey: vertexKey(a), bKey: vertexKey(b) };
  });

  // Connectivity (for facing centroids) uses EVERY edge, door or not.
  const componentOf = new UnionFind();
  for (const g of geoms) {
    componentOf.union(g.aKey, g.bKey);
  }
  const componentVertexSums = new Map<
    string,
    { sumX: number; sumZ: number; count: number }
  >();
  const addVertexToComponent = (key: string, pos: WorldPos) => {
    const root = componentOf.find(key);
    const entry = componentVertexSums.get(root) ?? {
      sumX: 0,
      sumZ: 0,
      count: 0,
    };
    entry.sumX += pos.x;
    entry.sumZ += pos.z;
    entry.count += 1;
    componentVertexSums.set(root, entry);
  };
  const seenVertexForCentroid = new Set<string>();
  for (const g of geoms) {
    if (!seenVertexForCentroid.has(g.aKey)) {
      seenVertexForCentroid.add(g.aKey);
      addVertexToComponent(g.aKey, g.a);
    }
    if (!seenVertexForCentroid.has(g.bKey)) {
      seenVertexForCentroid.add(g.bKey);
      addVertexToComponent(g.bKey, g.b);
    }
  }
  const centroidOfComponent = (key: string): WorldPos => {
    const root = componentOf.find(key);
    const entry = componentVertexSums.get(root);
    if (!entry || entry.count === 0) return { x: 0, z: 0 };
    return { x: entry.sumX / entry.count, z: entry.sumZ / entry.count };
  };

  // Chaining graph: non-door edges only, keyed by vertex.
  const nonDoor = geoms.filter((g) => !g.input.isDoor);
  const adjacency = new Map<string, EdgeGeom[]>();
  const pushAdj = (key: string, g: EdgeGeom) => {
    const list = adjacency.get(key);
    if (list) list.push(g);
    else adjacency.set(key, [g]);
  };
  for (const g of nonDoor) {
    pushAdj(g.aKey, g);
    pushAdj(g.bKey, g);
  }

  const doorVertexKeys = new Set<string>();
  for (const g of geoms) {
    if (g.input.isDoor) {
      doorVertexKeys.add(g.aKey);
      doorVertexKeys.add(g.bKey);
    }
  }

  const vertexPos = new Map<string, WorldPos>();
  for (const g of geoms) {
    vertexPos.set(g.aKey, g.a);
    vertexPos.set(g.bKey, g.b);
  }

  const used = new Set<EdgeGeom>();

  /**
   * Perpendicular distance from `point` to the infinite line through `a`
   * and `b` — 0 when `a`===`b` (degenerate; treated as "at the point").
   */
  function perpendicularDistance(
    point: WorldPos,
    a: WorldPos,
    b: WorldPos
  ): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) return distance(point, a);
    // |cross(point-a, dir)| / |dir|, with dir already unit via len below.
    const cross = (point.x - a.x) * dz - (point.z - a.z) * dx;
    return Math.abs(cross) / len;
  }

  /**
   * Douglas-Peucker-style chaining tolerance: how far (world units) a
   * visited vertex may stray from the run's own straight start->candidate
   * chord before the run must stop and a new one begin. A real hex-grid
   * "staircase" boundary — the zigzag wallRuns.ts's own top/bottom
   * envelope sides already treat as one straight chord — deviates from
   * its own true chord by a bounded amount at every intermediate vertex;
   * `1.5 * HEX_SIZE` is the same order of magnitude wallRuns.ts's own
   * DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES (`sqrt(3)`) uses for "how far
   * a zigzag departs from straight," and was verified directly against
   * both a real rectangular wall loop (dungeon-one's live wire data) and
   * a from-scratch fixture built the same way: it collapses each genuine
   * straight/zigzag side into one run (or a small handful on a very long
   * zigzag side, whose accumulated deviation over many hexes eventually
   * exceeds any fixed tolerance — still far fewer runs than one per edge)
   * while reliably breaking at real corners, where deviation grows
   * unboundedly the moment the chain is forced past the turn. Chosen over
   * a fixed "cap at 2 direction families" rule (this file's first design)
   * because real wire data shows a nominally-straight side can cycle
   * through more than 2 of the grid's 3 edge orientations over its length
   * without ever actually bending — a distance test judges straightness
   * by the thing that actually matters visually, not by counting
   * orientations.
   */
  const CHAIN_TOLERANCE = HEX_SIZE * 1.5;

  /** Walk a chain starting at `startKey`, taking `firstEdge` as its first
   * step, extending through soft (degree-2, non-door) vertices as long as
   * every vertex visited stays within `CHAIN_TOLERANCE` of the straight
   * chord from `startKey` to the current candidate end — see
   * `CHAIN_TOLERANCE`'s own doc comment. Returns the ordered edge list and
   * the two end vertex keys. */
  function walkChain(
    startKey: string,
    firstEdge: EdgeGeom
  ): { startKey: string; endKey: string; chainEdges: EdgeGeom[] } {
    const chainEdges: EdgeGeom[] = [firstEdge];
    used.add(firstEdge);
    const startPos = vertexPos.get(startKey)!;
    const visited: WorldPos[] = [otherEnd(firstEdge, startKey).pos];
    let currentKey = otherEnd(firstEdge, startKey).key;

    while (!doorVertexKeys.has(currentKey)) {
      // Softness is the vertex's TRUE degree, never its unused-edge
      // count (rpg-dnd5e-web#808, Kirk's walk: "the bottom room east
      // wall does not match the corner"). The original check counted
      // only UNUSED incident edges, so a genuine branch vertex
      // degraded to "soft" once an earlier chain had consumed one of
      // its edges — a later walk then continued straight THROUGH the
      // junction, absorbing the far side into its own chain (measured:
      // a 3-way corner's diagonal overshooting the junction and taking
      // two of the crossing wall's edges with it), with the outcome
      // depending on which chain happened to walk first. This module's
      // own contract (header doc: "break at any branch/junction — a
      // vertex with more than 2 wall edges") is a statement about the
      // GRAPH, so it is asked of the graph.
      const incident = adjacency.get(currentKey) ?? [];
      if (incident.length !== 2) break; // dead end (<2) or branch/junction (3+)
      const options = incident.filter((g) => !used.has(g));
      if (options.length !== 1) break; // the one continuation is already taken
      const next = options[0]!;
      const candidateEnd = otherEnd(next, currentKey);
      const fitsWithinTolerance = [...visited, candidateEnd.pos].every(
        (v) =>
          perpendicularDistance(v, startPos, candidateEnd.pos) <=
          CHAIN_TOLERANCE
      );
      if (!fitsWithinTolerance) break; // a genuine corner
      chainEdges.push(next);
      used.add(next);
      visited.push(candidateEnd.pos);
      currentKey = candidateEnd.key;
    }
    return { startKey, endKey: currentKey, chainEdges };
  }

  const floorWorldPositions: WorldPos[] = (floorHexes ?? []).map((hex) =>
    cubeToWorld(hex, hexSize)
  );

  /**
   * Ground truth for outward-ness, physically: probe a short step in each
   * perpendicular direction from a point on the run and see which probe
   * lands nearer a KNOWN floor hex — that side is inward, so facing points
   * the other way.
   *
   * Why the centroid heuristic (this module's original design) isn't
   * enough on its own: it tests "which side of THIS run's own line does
   * the WHOLE component's average vertex position fall on" — a fine
   * approximation for a room whose boundary is convex-ish (a rectangle, a
   * gentle zigzag), but it breaks down on a finely irregular boundary
   * (verified against dungeon-one's real crenellated wall pattern — small
   * triangular teeth authored directly in its wall list, not a projection
   * artifact): a short run sitting in a local concave notch can be on
   * EITHER side of the distant whole-network centroid depending on the
   * notch's own tiny-scale geometry, with no relation to which side is
   * actually the room's floor. Measured live: roughly half of that
   * pattern's individual teeth got the WRONG facing this way (pointing
   * into the room, showing tiled pieces' flat undecorated back to a
   * player standing inside — exactly Kirk's live report that authored
   * wall segments read as dark/illegible, worst under crypt's already-dim
   * mood lighting where a wrong-facing piece's flat back reads as an
   * almost featureless black silhouette). Floor proximity has no such
   * blind spot: it asks a purely LOCAL question near each run, so a
   * notch's individual teeth resolve independently and correctly instead
   * of all deferring to one distant, unrepresentative reference point.
   */
  function facingViaFloorProximity(
    mid: WorldPos,
    perp: WorldPos
  ): WorldPos | undefined {
    if (floorWorldPositions.length === 0) return undefined;
    // A pure single-direction (e.g. left/right) boundary's nearest floor
    // hex sits exactly one hex radius away, but a zigzag (e.g. top/bottom)
    // boundary's own staircase "eats" a large fraction of a naive 1-hex
    // probe before it clears the floor hexes' own footprint (the identical
    // effect wallRuns.ts's DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES =
    // sqrt(3) corrects for) — verified live: a 1.0 probe misclassified
    // most runs along a wide, shallow rectangle's top/bottom sides.
    // sqrt(3) is the same constant reused here rather than re-derived.
    const probeDist = hexSize * Math.sqrt(3);
    const probeA: WorldPos = {
      x: mid.x + perp.x * probeDist,
      z: mid.z + perp.z * probeDist,
    };
    const probeB: WorldPos = {
      x: mid.x - perp.x * probeDist,
      z: mid.z - perp.z * probeDist,
    };
    const nearestFloorDistance = (p: WorldPos): number => {
      let best = Infinity;
      for (const f of floorWorldPositions) {
        const d = distance(p, f);
        if (d < best) best = d;
      }
      return best;
    };
    const distA = nearestFloorDistance(probeA);
    const distB = nearestFloorDistance(probeB);
    if (distA === distB) return undefined; // genuinely ambiguous, fall back
    // Whichever probe is CLOSER to floor sits on the inward side, so
    // facing (outward) points along the OTHER probe's own direction —
    // i.e. away from the closer one, never toward it.
    return distA < distB ? { x: -perp.x, z: -perp.z } : perp;
  }

  const runs: AuthoredWallRun[] = [];

  function emitRun(startKey: string, endKey: string, chainEdges: EdgeGeom[]) {
    let start = vertexPos.get(startKey)!;
    let end = vertexPos.get(endKey)!;
    const dir = unitDir(start, end);
    // Door-frame trim (matches wallRuns.ts's connectorRunForDoor/
    // candidateToFallbackSegment convention): a run whose end sits ON a
    // door-touching vertex stops DOOR_FRAME_CALIBRATED_WIDTH/2 short of
    // it, so the door's own frame piece occupies the gap instead of the
    // tiled wall pieces running straight through the opening.
    if (doorVertexKeys.has(startKey)) {
      start = {
        x: start.x + dir.x * (DOOR_FRAME_CALIBRATED_WIDTH / 2),
        z: start.z + dir.z * (DOOR_FRAME_CALIBRATED_WIDTH / 2),
      };
    }
    if (doorVertexKeys.has(endKey)) {
      end = {
        x: end.x - dir.x * (DOOR_FRAME_CALIBRATED_WIDTH / 2),
        z: end.z - dir.z * (DOOR_FRAME_CALIBRATED_WIDTH / 2),
      };
    }
    const mid: WorldPos = {
      x: (start.x + end.x) / 2,
      z: (start.z + end.z) / 2,
    };
    const perp: WorldPos = { x: -dir.z, z: dir.x };
    // Prefer the physically-grounded floor-proximity test (see
    // facingViaFloorProximity's own doc comment); fall back to the
    // connected-component centroid only when no floor data was supplied,
    // or the rare case both probes tie.
    const centroid = centroidOfComponent(startKey);
    const toMid: WorldPos = { x: mid.x - centroid.x, z: mid.z - centroid.z };
    const dot = perp.x * toMid.x + perp.z * toMid.z;
    const centroidFacing: WorldPos =
      dot >= 0 ? perp : { x: -perp.x, z: -perp.z };
    const facing = facingViaFloorProximity(mid, perp) ?? centroidFacing;
    const key = chainEdges
      .map((g) => g.input.id ?? `${g.aKey}|${g.bKey}`)
      .sort()
      .join(';');
    runs.push({ start, end, key, facing });
  }

  // Phase 1: start a chain from every hard-break vertex (branch, dead end,
  // or door-adjacent) — the natural, unambiguous starting points.
  const allVertexKeys = new Set<string>(adjacency.keys());
  for (const key of allVertexKeys) {
    const degree = (adjacency.get(key) ?? []).length;
    const isHardBreak = degree !== 2 || doorVertexKeys.has(key);
    if (!isHardBreak) continue;
    for (const g of adjacency.get(key) ?? []) {
      if (used.has(g)) continue;
      const { endKey, chainEdges } = walkChain(key, g);
      emitRun(key, endKey, chainEdges);
    }
  }

  // Phase 2: any edges still unused belong to a pure closed loop with no
  // hard-break vertex reachable at all (every vertex degree-2, no doors
  // touching) — pick an arbitrary remaining edge and walk from one of its
  // endpoints. The distance tolerance guarantees a real polygon's own
  // corner eventually breaks the walk; each iteration below picks up
  // wherever the previous one left off, so a full loop still gets fully
  // covered across however many runs its own corners produce. Bounded by
  // the edge count so a pathological (non-terminating) input can't hang.
  for (let guard = 0; guard < geoms.length + 1; guard++) {
    const remaining = nonDoor.find((g) => !used.has(g));
    if (!remaining) break;
    const { endKey, chainEdges } = walkChain(remaining.aKey, remaining);
    emitRun(remaining.aKey, endKey, chainEdges);
  }

  return runs;
}
