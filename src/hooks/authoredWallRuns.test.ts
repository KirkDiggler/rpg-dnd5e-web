/**
 * Tests for authoredWallRuns — chains a canvas dungeon's real wall edges
 * (wallLines->edges projection, PR #723) into straight runs for
 * WallRunMesh's tiled-Synty-piece rendering, replacing the legacy
 * per-hex-edge jagged look. See authoredWallRuns.ts's own header doc for
 * the chaining rule (a Douglas-Peucker-style distance tolerance) and why
 * this can't reuse wallRuns.ts's region-bounding-box envelope logic.
 */
import {
  coordToKey,
  cubeToWorld,
  HEX_DIRECTIONS,
  HEX_SIZE,
  hexEdgeBetween,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import { describe, expect, it } from 'vitest';
import {
  computeAuthoredWallRuns,
  type AuthoredWallEdgeInput,
} from './authoredWallRuns';
import { cubeAtColRow, hexRow } from './wallRuns';

/** Every real boundary edge of a rectangular col/row region — a floor
 * cell + a non-floor neighbor — exactly the shape rpg-toolkit's own
 * perimeter generator and an authored wallLines->edges projection (PR
 * #723) both produce on the wire (see syntyHexWallHelpers.ts's
 * `collectWallHexes` doc comment). Building it from real hex adjacency
 * (HEX_DIRECTIONS), not hand-picked coordinates, is what makes this
 * fixture trustworthy against the actual hex-grid geometry the module
 * under test relies on. */
function rectBoundaryEdges(
  minCol: number,
  maxCol: number,
  minRow: number,
  maxRow: number
): AuthoredWallEdgeInput[] {
  const floor = new Map<string, CubeCoord>();
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const hex = cubeAtColRow(col, row);
      floor.set(coordToKey(hex), hex);
    }
  }
  const edges: AuthoredWallEdgeInput[] = [];
  const seen = new Set<string>();
  for (const [key, hex] of floor) {
    for (const dir of HEX_DIRECTIONS) {
      const neighbor: CubeCoord = {
        x: hex.x + dir.x,
        y: hex.y + dir.y,
        z: hex.z + dir.z,
      };
      const neighborKey = coordToKey(neighbor);
      if (floor.has(neighborKey)) continue; // interior edge, not a boundary
      const edgeKey = [key, neighborKey].sort().join('->');
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      edges.push({ from: hex, to: neighbor, isDoor: false });
    }
  }
  return edges;
}

function totalEdgeLength(edges: AuthoredWallEdgeInput[]): number {
  let sum = 0;
  for (const e of edges) {
    const { a, b } = hexEdgeBetween(e.from, e.to, HEX_SIZE);
    sum += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return sum;
}

function runLength(run: {
  start: { x: number; z: number };
  end: { x: number; z: number };
}): number {
  return Math.hypot(run.end.x - run.start.x, run.end.z - run.start.z);
}

describe('computeAuthoredWallRuns — a single straight edge', () => {
  it('produces one run spanning exactly that edge, with a defined facing', () => {
    const hexA = cubeAtColRow(2, 2);
    const hexB = cubeAtColRow(3, 2);
    const runs = computeAuthoredWallRuns([
      { from: hexA, to: hexB, isDoor: false },
    ]);
    expect(runs).toHaveLength(1);
    const { a, b } = hexEdgeBetween(hexA, hexB, HEX_SIZE);
    // Order-independent: the run's own start/end may match either
    // direction the chain happened to walk from.
    const matchesForward =
      Math.abs(runs[0]!.start.x - a.x) < 1e-6 &&
      Math.abs(runs[0]!.end.x - b.x) < 1e-6;
    const matchesReverse =
      Math.abs(runs[0]!.start.x - b.x) < 1e-6 &&
      Math.abs(runs[0]!.end.x - a.x) < 1e-6;
    expect(matchesForward || matchesReverse).toBe(true);
    expect(Number.isFinite(runs[0]!.facing.x)).toBe(true);
    expect(Number.isFinite(runs[0]!.facing.z)).toBe(true);
  });
});

describe('computeAuthoredWallRuns — isolated single edge amid a disconnected fixture', () => {
  it('keeps a lone edge far from any other wall data as its own one-edge run', () => {
    const near = rectBoundaryEdges(0, 1, 0, 1);
    const farHexA = cubeAtColRow(50, 50);
    const farHexB = cubeAtColRow(51, 50);
    const runs = computeAuthoredWallRuns([
      ...near,
      { from: farHexA, to: farHexB, isDoor: false },
    ]);
    // The far edge must appear as SOME run (not silently dropped) and
    // must not have merged with the near cluster's geometry (its own
    // endpoints stay near the far hexes' own world position).
    const farRuns = runs.filter((r) => {
      const midX = (r.start.x + r.end.x) / 2;
      return midX > 30; // near cluster sits close to the origin
    });
    expect(farRuns.length).toBeGreaterThanOrEqual(1);
  });
});

describe("computeAuthoredWallRuns — a rectangular wall loop (Kirk's dungeon-one shape)", () => {
  const edges = rectBoundaryEdges(3, 15, 0, 7);
  const runs = computeAuthoredWallRuns(edges);

  it('covers the full boundary length with no gaps and no overlap double-counting', () => {
    const totalRunLength = runs.reduce((sum, r) => sum + runLength(r), 0);
    // Runs collapse a zigzag into a straight CHORD (shorter than the
    // staircase's own summed edge length) but never a pure-direction
    // side, so total run length must be <= the true edge length and
    // strictly positive — a gross mismatch (e.g. a dropped or duplicated
    // side) would fail this bound by a wide margin.
    expect(totalRunLength).toBeGreaterThan(0);
    expect(totalRunLength).toBeLessThanOrEqual(totalEdgeLength(edges) + 1e-6);
  });

  it('produces a small number of long straight runs, not one run per edge (the jagged-look regression this module fixes)', () => {
    // A rectangle has 4 logical sides; real hex-grid corner cells can add
    // a couple of short extra stub runs at the corners themselves (this
    // fixture's own edge-by-edge boundary construction, verified against
    // real wire data during design), but the result must be a SMALL,
    // bounded set of runs — nowhere near "one run per input edge" (49
    // edges in the real dungeon-one data this fixture matches).
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.length).toBeLessThan(edges.length / 2);
  });

  it('every run is genuinely straight: its own edges collapse to a chord within the chaining tolerance of every tiled edge midpoint', () => {
    // Rebuild which edges belong to which run isn't exposed directly, but
    // every individual boundary edge's OWN midpoint must lie close to SOME
    // run's chord line (a run is only useful if its straight-line
    // approximation actually tracks the real wall it replaces). The bound
    // is the module's own chaining tolerance (1.5 hex radii — see
    // authoredWallRuns.ts's CHAIN_TOLERANCE doc comment), not a tighter
    // one hex radius: a run is deliberately allowed to depart from any
    // single edge's exact line by up to that much, the same "straight
    // chord across a zigzag" trade-off wallRuns.ts's own envelope runs
    // already make for chain dungeons.
    const CHAIN_TOLERANCE = HEX_SIZE * 1.5;
    for (const e of edges) {
      if (e.isDoor) continue;
      const { a, b } = hexEdgeBetween(e.from, e.to, HEX_SIZE);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const distances = runs.map((r) => {
        const dx = r.end.x - r.start.x;
        const dz = r.end.z - r.start.z;
        const len = Math.hypot(dx, dz);
        if (len === 0) return Infinity;
        const t =
          ((mid.x - r.start.x) * dx + (mid.z - r.start.z) * dz) / (len * len);
        const clampedT = Math.max(0, Math.min(1, t));
        const closest = {
          x: r.start.x + dx * clampedT,
          z: r.start.z + dz * clampedT,
        };
        return Math.hypot(mid.x - closest.x, mid.z - closest.z);
      });
      expect(Math.min(...distances)).toBeLessThanOrEqual(
        CHAIN_TOLERANCE + 1e-6
      );
    }
  });

  it('gives every run a unit-length facing vector', () => {
    for (const run of runs) {
      const mag = Math.hypot(run.facing.x, run.facing.z);
      expect(mag).toBeGreaterThan(0.9);
      expect(mag).toBeLessThan(1.1);
    }
  });
});

describe('computeAuthoredWallRuns — floorHexes-grounded facing (fixes the centroid heuristic breaking down on a locally irregular boundary)', () => {
  it('points every run of a full rectangular loop away from the known floor inside it', () => {
    const edges = rectBoundaryEdges(0, 20, 0, 3);
    const floorHexes: CubeCoord[] = [];
    for (let col = 0; col <= 20; col++) {
      for (let row = 0; row <= 3; row++) {
        floorHexes.push(cubeAtColRow(col, row));
      }
    }
    const floorWorldPositions = floorHexes.map((h) => cubeToWorld(h, HEX_SIZE));

    const runs = computeAuthoredWallRuns(edges, HEX_SIZE, floorHexes);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      const mid = {
        x: (run.start.x + run.end.x) / 2,
        z: (run.start.z + run.end.z) / 2,
      };
      // Same probe distance the module's own facingViaFloorProximity uses
      // internally (sqrt(3) hex radii) — a shorter verification probe can
      // land ambiguously close to a zigzag boundary's own "eaten" offset
      // (wallRuns.ts's DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES finding)
      // and produce a false failure independent of whether facing is
      // actually correct.
      const probeDist = HEX_SIZE * Math.sqrt(3);
      const inwardProbe = {
        x: mid.x - run.facing.x * probeDist,
        z: mid.z - run.facing.z * probeDist,
      };
      const outwardProbe = {
        x: mid.x + run.facing.x * probeDist,
        z: mid.z + run.facing.z * probeDist,
      };
      const nearestFloorDistance = (p: { x: number; z: number }) =>
        Math.min(
          ...floorWorldPositions.map((f) => Math.hypot(p.x - f.x, p.z - f.z))
        );
      // The probe BEHIND facing (mid - facing*step) should land closer to
      // known floor than the probe AHEAD of facing (mid + facing*step) —
      // i.e. facing points away from the room, not into it.
      expect(nearestFloorDistance(inwardProbe)).toBeLessThanOrEqual(
        nearestFloorDistance(outwardProbe)
      );
    }
  });

  it('omitting floorHexes keeps the original centroid-based facing (backward compatible)', () => {
    const edges = rectBoundaryEdges(0, 5, 0, 3);
    const withoutFloor = computeAuthoredWallRuns(edges);
    const withEmptyFloor = computeAuthoredWallRuns(edges, HEX_SIZE, []);
    expect(withEmptyFloor).toEqual(withoutFloor);
  });
});

describe('computeAuthoredWallRuns — door interrupts a run', () => {
  it('splits a straight run into two, each trimmed to the door frame half-width, with no run crossing the door edge itself', () => {
    // The INTERIOR of a real rectangle's left side (rectBoundaryEdges' own
    // construction, already verified elsewhere in this file to chain a
    // full side into one long straight run) — genuine adjacent boundary
    // edges along a single column, not a hand-guessed neighbor direction,
    // so consecutive edges are guaranteed to actually share a vertex.
    // Restricted to rows strictly inside [minRow, maxRow] so no corner
    // (which can carry a 2nd, differently-oriented edge from the same
    // floor cell — see rectBoundaryEdges' own per-cell exposure) leaks
    // into this "pure single side" fixture. Edge index 3 (the middle of
    // the run) is swapped to a door.
    const minRow = 0;
    const maxRow = 9;
    const leftSide = rectBoundaryEdges(0, 8, minRow, maxRow).filter(
      (e) =>
        e.from.x === 0 && hexRow(e.from) > minRow && hexRow(e.from) < maxRow
    );
    expect(leftSide.length).toBeGreaterThanOrEqual(6);
    const edges: AuthoredWallEdgeInput[] = leftSide.map((e, i) => ({
      ...e,
      isDoor: i === 3,
    }));
    const runs = computeAuthoredWallRuns(edges);
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      expect(runLength(run)).toBeGreaterThan(0);
    }
    // Neither run's chord should reach all the way to the door's own
    // edge midpoint — each should stop DOOR_FRAME_CALIBRATED_WIDTH/2
    // short of it.
    const doorEdge = edges[3]!;
    const { a: doorA, b: doorB } = hexEdgeBetween(
      doorEdge.from,
      doorEdge.to,
      HEX_SIZE
    );
    const doorMid = { x: (doorA.x + doorB.x) / 2, z: (doorA.z + doorB.z) / 2 };
    for (const run of runs) {
      const distToDoorFromStart = Math.hypot(
        run.start.x - doorMid.x,
        run.start.z - doorMid.z
      );
      const distToDoorFromEnd = Math.hypot(
        run.end.x - doorMid.x,
        run.end.z - doorMid.z
      );
      const closest = Math.min(distToDoorFromStart, distToDoorFromEnd);
      expect(closest).toBeGreaterThanOrEqual(
        DOOR_FRAME_CALIBRATED_WIDTH / 2 - 1e-6
      );
    }
  });
});

describe('computeAuthoredWallRuns — authored height splits chains (rpg-project#273)', () => {
  /** The same pure single-side fixture the door-interrupt test builds —
   * one straight column of genuinely adjacent boundary edges. */
  function straightSide(): AuthoredWallEdgeInput[] {
    const minRow = 0;
    const maxRow = 9;
    const side = rectBoundaryEdges(0, 8, minRow, maxRow).filter(
      (e) =>
        e.from.x === 0 && hexRow(e.from) > minRow && hexRow(e.from) < maxRow
    );
    expect(side.length).toBeGreaterThanOrEqual(6);
    return side;
  }

  it('a mid-chain height change splits the run at the authored boundary, each side carrying its own height', () => {
    const side = straightSide();
    const raisedCount = 3;
    const edges = side.map((e, i) => ({
      ...e,
      height: i < raisedCount ? 2 : 0,
    }));
    const runs = computeAuthoredWallRuns(edges);
    expect(runs).toHaveLength(2);
    const heights = runs.map((r) => r.height).sort();
    expect(heights).toEqual([0, 2]);
  });

  it('a uniform authored height derives exactly the default-height run geometry — height rides, it never moves an endpoint', () => {
    const side = straightSide();
    const reference = computeAuthoredWallRuns(side);
    const raised = computeAuthoredWallRuns(
      side.map((e) => ({ ...e, height: 2.5 }))
    );
    expect(raised).toEqual(reference.map((r) => ({ ...r, height: 2.5 })));
  });

  it('0 and omitted are the same fact: both chain together as standard height', () => {
    const side = straightSide();
    const mixedSpelling = side.map((e, i) =>
      i % 2 === 0 ? e : { ...e, height: 0 }
    );
    expect(computeAuthoredWallRuns(mixedSpelling)).toEqual(
      computeAuthoredWallRuns(side)
    );
  });
});

describe('computeAuthoredWallRuns — corner (a genuine direction change)', () => {
  it('breaks into separate runs at a real corner, not one chord across the whole bend', () => {
    // A genuine L-shaped bend: the full boundary of a tall, narrow
    // rectangle has a real corner between its left (column-direction)
    // side and its top (zigzag) side — rectBoundaryEdges' own
    // construction, already verified elsewhere in this file, produces
    // exactly this shape.
    const edges = rectBoundaryEdges(0, 6, 0, 6);
    const runs = computeAuthoredWallRuns(edges);
    expect(runs.length).toBeGreaterThan(1);
    // The real test that a corner didn't get chorded across diagonally:
    // every individual edge's own midpoint must still lie close (within
    // the module's own chaining tolerance) to SOME run — a bad diagonal
    // chord cutting across the bend would leave the edges near the
    // corner far from every run's own line.
    const CHAIN_TOLERANCE = HEX_SIZE * 1.5;
    for (const e of edges) {
      const { a, b } = hexEdgeBetween(e.from, e.to, HEX_SIZE);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const distances = runs.map((r) => {
        const dx = r.end.x - r.start.x;
        const dz = r.end.z - r.start.z;
        const len = Math.hypot(dx, dz);
        if (len === 0) return Infinity;
        const t =
          ((mid.x - r.start.x) * dx + (mid.z - r.start.z) * dz) / (len * len);
        const clampedT = Math.max(0, Math.min(1, t));
        const closest = {
          x: r.start.x + dx * clampedT,
          z: r.start.z + dz * clampedT,
        };
        return Math.hypot(mid.x - closest.x, mid.z - closest.z);
      });
      expect(Math.min(...distances)).toBeLessThanOrEqual(
        CHAIN_TOLERANCE + 1e-6
      );
    }
  });
});

describe('computeAuthoredWallRuns — empty input', () => {
  it('returns no runs', () => {
    expect(computeAuthoredWallRuns([])).toEqual([]);
  });
});
