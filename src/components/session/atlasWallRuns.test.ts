/**
 * atlasWallRuns tests — straight-run geometry chained straight off the
 * authored edges (rpg-dnd5e-web#787), checked against the real 224-cell
 * reference-tomb fixture (Kirk's live-walk regression pin: same two
 * straight seams, same two door gaps — see the ruling-change note below
 * for what changed about the PERIMETER) and against small hand-built
 * fixtures for the shapes the real data doesn't exercise: a partial
 * interior wall that doesn't split the floor, an L-shaped seam, a
 * horizontal (row-type) seam, two doors on one seam, and a doorway
 * overlapping a boundary on the same cell pair.
 *
 * # Ruling change, same day as #787
 *
 * Kirk, after seeing the first version (which traced the floor mask's
 * real outline instead of a bounding rectangle) live: "draw nothing,
 * floor ends into darkness. that seems more honest about the void." The
 * floor's own outer edge draws NO wall geometry at all now, authored or
 * implied — only `atlas.boundaries` and `atlas.doorways` render. An
 * author who wants a visible outer wall draws one like any other
 * boundary (see the "author-drawn wall at the floor's own edge"
 * describe block below) — there is no special-cased "envelope" concept
 * left to test.
 *
 * Coverage-style assertions ("every declared edge's own midpoint lies
 * near SOME run") rather than exact run counts, mirroring
 * `authoredWallRuns.test.ts`'s own established style for this same
 * chaining engine: a real hex-grid straight side collapses into several
 * short runs, not one long one (verified empirically against both this
 * atlas's own data and that module's own rectangular-loop fixture — a
 * pre-existing, already-tested property of `computeAuthoredWallRuns`,
 * not something this rewrite introduces or is in scope to change). What
 * matters for "renders the authored edges, nothing dropped" is that
 * every edge is covered by some straight piece, not how many pieces.
 */
import { hexEdgeBetween, type CubeCoord } from '@/components/hex-grid/hexMath';
import type { AuthoredWallRun } from '@/hooks/authoredWallRuns';
import { DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN } from '@/hooks/wallRuns';
import { describe, expect, it } from 'vitest';
import referenceTombCells from '../../concepts/session-tomb/referenceTombCells.json';
import {
  authoredAxisLine,
  boundariesToWallRuns,
  cornerJoint,
  type EdgeFitData,
} from './atlasWallRuns';
import { positionToCube } from './positionBridge';

const pos = (x: number, y: number) => ({ x, y }) as never;

type P = { x: number; z: number };
type Seg = { start: P; end: P };

/** Distance from a point to a finite segment (0 when the point is on it). */
function distanceToSegment(p: P, seg: Seg): number {
  const dx = seg.end.x - seg.start.x;
  const dz = seg.end.z - seg.start.z;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((p.x - seg.start.x) * dx + (p.z - seg.start.z) * dz) / len2
          )
        );
  const cx = seg.start.x + t * dx;
  const cz = seg.start.z + t * dz;
  return Math.hypot(p.x - cx, p.z - cz);
}

/** The module's own chaining tolerance (authoredWallRuns.ts's
 * CHAIN_TOLERANCE) — the bound within which a real edge's own midpoint
 * must land of SOME run for that edge to count as "covered", the same
 * standard authoredWallRuns.test.ts's own corner/rectangle tests hold
 * this engine to. */
const CHAIN_TOLERANCE = 1.5;

function edgeMid(from: CubeCoord, to: CubeCoord): P {
  const { a, b } = hexEdgeBetween(from, to, 1);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

function nearestRunDistance(point: P, runs: readonly Seg[]): number {
  return Math.min(...runs.map((r) => distanceToSegment(point, r)));
}

function distanceBetween(a: P, b: P): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function unitDir(a: P, b: P): P {
  const len = distanceBetween(a, b);
  if (len === 0) return { x: 0, z: 0 };
  return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
}

/**
 * Independently finds whichever run has an endpoint EXACTLY (within
 * 1e-6) at `point` and reconstructs that run's own direction from its
 * OTHER (untouched) endpoint toward `point` — used below against a
 * door's own reported gap boundary points, not against
 * `atlasWallRuns.ts`'s internal DOOR_TRIM/raw-corner math (rpg-dnd5e-web#788
 * second walk finding: "the gap is what I am most concerned with" — a
 * screenshot showing bare floor between each flanking run's end and the
 * door frame. The fix forces each flanking run's endpoint to sit AT the
 * gap boundary exactly, so this exact-match search is itself the
 * closure pin: if the fix regressed, no run would be found here.
 */
function findRunTouching(
  point: P,
  runs: readonly AuthoredWallRun[]
): { run: AuthoredWallRun; dir: P } | undefined {
  for (const run of runs) {
    if (distanceBetween(run.start, point) < 1e-6) {
      return { run, dir: unitDir(run.end, run.start) };
    }
    if (distanceBetween(run.end, point) < 1e-6) {
      return { run, dir: unitDir(run.start, run.end) };
    }
  }
  return undefined;
}

/** A door gap's own two boundary points, reconstructed from its public
 * `position`/`leafPosition` fields (`leafPosition` IS one boundary
 * point by this module's own documented convention; the other is its
 * mirror image through the center) — not by re-deriving the
 * implementation's internal gapStart/gapEnd math. */
function gapBoundaryPoints(gap: { position: P; leafPosition: P }): {
  near: P;
  far: P;
} {
  const near = gap.leafPosition;
  const far = {
    x: 2 * gap.position.x - near.x,
    z: 2 * gap.position.z - near.z,
  };
  return { near, far };
}

function rotationYOf(dir: P): number {
  return Math.atan2(-dir.z, dir.x);
}

/** The real reference-tomb atlas shape: three chambers (6/10/12 wide, 8
 * tall) in a row, two interior seams (28 boundary edges: 14 each — see
 * atlasToScene3D.test.ts's own perimeter test for how these numbers were
 * independently confirmed), two doorways. Boundaries/doorways captured
 * live from `GetAtlas` (same session the PR's evidence screenshots came
 * from) — real wire data, not a hand-built guess.
 */
function realReferenceTombBoundaries() {
  // The exact 28 boundaries + 2 doorways captured live via GetAtlas
  // against the reference-tomb dungeon (rpg-api dev, local stack) —
  // reproduced here as a literal fixture so this test has no live-server
  // dependency. Cross-checked: cell count matches referenceTombCells.json
  // (224), and (from,to) pairs are real hex-adjacent pairs (dist 1).
  const seam1 = [
    [2, 6, 3, 6],
    [2, 7, 3, 6],
    [2, 7, 3, 7],
    [3, 5, 3, 6],
    [3, 5, 4, 4],
    [3, 5, 4, 5],
    [4, 2, 5, 2],
    [4, 3, 4, 4],
    [4, 3, 5, 2],
    [4, 3, 5, 3],
    [5, 0, 6, 0],
    [5, 1, 5, 2],
    [5, 1, 6, 0],
    [5, 1, 6, 1],
  ];
  const seam2 = [
    [12, 6, 13, 6],
    [12, 7, 13, 6],
    [12, 7, 13, 7],
    [13, 5, 13, 6],
    [13, 5, 14, 4],
    [13, 5, 14, 5],
    [14, 2, 15, 2],
    [14, 3, 14, 4],
    [14, 3, 15, 2],
    [14, 3, 15, 3],
    [15, 0, 16, 0],
    [15, 1, 15, 2],
    [15, 1, 16, 0],
    [15, 1, 16, 1],
  ];
  const boundaries = [...seam1, ...seam2].map(([fx, fy, tx, ty]) => ({
    from: pos(fx, fy),
    to: pos(tx, ty),
    blocksMovement: true,
    blocksLineOfSight: true,
  }));
  const doorways = [
    {
      connection: 'reference-tomb:entrance-hall',
      from: pos(3, 4),
      to: pos(4, 4),
    },
    {
      connection: 'reference-tomb:hall-tomb',
      from: pos(13, 4),
      to: pos(14, 4),
    },
  ];
  return {
    cells: referenceTombCells.cells as { x: number; y: number }[] as never,
    boundaries: boundaries as never,
    doorways: doorways as never,
  };
}

describe('boundariesToWallRuns — the real reference tomb', () => {
  const atlas = realReferenceTombBoundaries();
  const scene = boundariesToWallRuns(atlas, 1);

  it('drops nothing: every declared boundary edge is covered by some wall run', () => {
    for (const b of atlas.boundaries as unknown as Array<{
      from: { x: number; y: number };
      to: { x: number; y: number };
    }>) {
      const mid = edgeMid(
        positionToCube(b.from as never),
        positionToCube(b.to as never)
      );
      expect(nearestRunDistance(mid, scene.wallRuns)).toBeLessThanOrEqual(
        CHAIN_TOLERANCE + 1e-6
      );
    }
  });

  it('gives every doorway its own gap, independently — two doors, two gaps, at the seams’ own historically-measured x-bands', () => {
    expect(scene.doorGaps).toHaveLength(2);
    const [seam1Door, seam2Door] = [...scene.doorGaps].sort(
      (a, b) => a.position.x - b.position.x
    );
    // Independently measured (this module's own pre-#787 test suite,
    // still true here since the doorway's own edge geometry — the
    // source of these positions — hasn't changed, only how the WALLS
    // around it are derived): seam 1 sits between x 9.4 and 10.5, seam 2
    // between x 26.7 and 27.8.
    expect(seam1Door!.position.x).toBeGreaterThan(9.4);
    expect(seam1Door!.position.x).toBeLessThan(10.5);
    expect(seam2Door!.position.x).toBeGreaterThan(26.7);
    expect(seam2Door!.position.x).toBeLessThan(27.8);
    expect(seam1Door!.key).toBe('reference-tomb:entrance-hall');
    expect(seam2Door!.key).toBe('reference-tomb:hall-tomb');
  });

  it('keeps each door gap close to its cell-centre row (row 4 of 0..7 at hexSize 1 is world z = 6): now a projection onto the run it interrupts, not the raw hex-edge midpoint, so a small deliberate shift is expected', () => {
    // rpg-dnd5e-web#788 walk finding ("walls look straight now but the
    // door follows the hex edge"): the gap center is now the door's own
    // raw edge midpoint PROJECTED onto the straightened run it
    // interrupts, gluing it to the wall plane it actually renders in —
    // see the "door frame rotation matches the run it interrupts"
    // describe block below for the exact pin this trades off against.
    for (const door of scene.doorGaps) {
      expect(door.position.z).toBeGreaterThan(5.9);
      expect(door.position.z).toBeLessThan(6.1);
    }
  });

  it('door frame rotation matches the run it interrupts, AND the gap closes EXACTLY on both sides (rpg-dnd5e-web#788 walk findings: "the door follows the hex edge", then "the gap is what I am most concerned with")', () => {
    const doors = [
      { from: positionToCube(pos(3, 4)), to: positionToCube(pos(4, 4)) },
      { from: positionToCube(pos(13, 4)), to: positionToCube(pos(14, 4)) },
    ];
    for (const d of doors) {
      const gap = scene.doorGaps.find(
        (g) => distanceBetween(g.position, edgeMid(d.from, d.to)) < 1
      )!;
      expect(gap).toBeDefined();
      const { near, far } = gapBoundaryPoints(gap);
      const nearRun = findRunTouching(near, scene.wallRuns);
      const farRun = findRunTouching(far, scene.wallRuns);
      // Both tomb doors sit on real authored wall on BOTH sides -- a run
      // must be found touching each boundary point EXACTLY (findRunTouching
      // itself only matches within 1e-6; a bare-floor gap the size Kirk
      // screenshotted would leave this undefined).
      expect(nearRun).toBeDefined();
      expect(farRun).toBeDefined();
      // The explicit distance(run endpoint, gap boundary) == 0 pin --
      // named directly, not just implied by findRunTouching's own
      // internal tolerance.
      const nearEndpoint =
        distanceBetween(nearRun!.run.start, near) < 1e-6
          ? nearRun!.run.start
          : nearRun!.run.end;
      const farEndpoint =
        distanceBetween(farRun!.run.start, far) < 1e-6
          ? farRun!.run.start
          : farRun!.run.end;
      expect(distanceBetween(nearEndpoint, near)).toBeLessThan(1e-6);
      expect(distanceBetween(farEndpoint, far)).toBeLessThan(1e-6);
      const reference = nearRun ?? farRun!;
      expect(gap.rotationY).toBeCloseTo(rotationYOf(reference.dir), 6);
    }
  });

  it('both runs flanking one door report facing on the SAME side (rpg-dnd5e-web#788 walk finding: "one side is facing one way and the other is the other")', () => {
    // "Same side", not bit-identical vectors: each run's own `facing` is
    // (and must stay) perpendicular to THAT run's own geometry -- two
    // flanking runs whose own directions differ by a few degrees
    // (ordinary chaining fragmentation, not a bug) legitimately have
    // slightly different exact facing vectors even when correctly
    // agreeing on which side is outward. What the walk finding actually
    // named -- a hard ~180-degree flip, textured face on one side and
    // flat back on the other -- shows up as a strongly NEGATIVE dot
    // product; a positive one is the real, meaningful pin.
    const doors = [
      { from: positionToCube(pos(3, 4)), to: positionToCube(pos(4, 4)) },
      { from: positionToCube(pos(13, 4)), to: positionToCube(pos(14, 4)) },
    ];
    for (const d of doors) {
      const gap = scene.doorGaps.find(
        (g) => distanceBetween(g.position, edgeMid(d.from, d.to)) < 1
      )!;
      const { near, far } = gapBoundaryPoints(gap);
      const nearRun = findRunTouching(near, scene.wallRuns)!;
      const farRun = findRunTouching(far, scene.wallRuns)!;
      const dot =
        nearRun.run.facing.x * farRun.run.facing.x +
        nearRun.run.facing.z * farRun.run.facing.z;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('draws nothing at the floor\'s own outer edge — ruling change, same day as #787 ("draw nothing, floor ends into darkness"): only the two interior seams render, not a perimeter', () => {
    // The combined floor spans world x roughly 0..47.6 (28 columns *
    // sqrt(3) hex spacing). If any perimeter wall geometry were still
    // being drawn (the superseded outline-traced version), some run
    // would sit near x=0 or x=47.6. With only the two interior seams
    // (authored boundaries) rendering, every run's own geometry stays
    // well inside that range, clustered around the two seams' own
    // historically-measured x-bands (~9.5 and ~26.8).
    const xs = scene.wallRuns.flatMap((r) => [r.start.x, r.end.x]);
    expect(Math.min(...xs)).toBeGreaterThan(5);
    expect(Math.max(...xs)).toBeLessThan(35);
  });

  it('gives every run a finite, unit-length facing vector and non-zero length', () => {
    expect(scene.wallRuns.length).toBeGreaterThan(0);
    for (const run of scene.wallRuns) {
      const mag = Math.hypot(run.facing.x, run.facing.z);
      expect(Number.isFinite(mag)).toBe(true);
      expect(mag).toBeGreaterThan(0.9);
      expect(mag).toBeLessThan(1.1);
      const len = Math.hypot(run.end.x - run.start.x, run.end.z - run.start.z);
      expect(len).toBeGreaterThan(0);
    }
  });

  it('the seam runs straight, not tilted (rpg-dnd5e-web#788 walk finding: "the wall from the top seems like it is at an angle") — a pixel-formula test, not just \'looks straight\'', () => {
    // Every one of these runs belongs to one of the tomb's two seams
    // (the reference-tomb fixture declares no other interior walls).
    // Both seams are column-type -- their true direction is vertical
    // (constant world x). Before #788, the engine's own raw
    // endpoint-to-endpoint chord carried real tilt inherited from
    // whichever two hex-corner parities the chain's own first/last
    // vertex happened to land on: up to ~11 degrees for a whole
    // unsplit seam, and as much as ~80 degrees for the WORSE of a
    // door-split seam's two short fragments, fit independently. #788's
    // least-squares fit over the seam's own combined vertex set reduced
    // this to ~1.6 degrees (|dirX| ~= 0.0273) but no further -- Kirk's
    // #799 finding retired that as "close enough": a chain's fitted
    // line only lands exactly on-axis when its own edges' hex-adjacency
    // directions happen to be evenly balanced, and the tomb's own seam1
    // isn't (verified: 14 edges split 7-E-type/4-NE-type/3-SE-type, an
    // uncancelable remainder) -- no per-edge point choice closes that
    // gap on its own (this module's own header doc, seam-fit section,
    // measured five of them). #799's actual fix doesn't fit these seams
    // closer to vertical at all: `authoredAxisLine` RECOGNIZES them as
    // declared vertical walls (every edge in each seam crosses the
    // identical authored-column pair) and renders the exact declared
    // direction, `{0,1}`, with only the offset (mean x of the seam's
    // own boundary-pair midpoints) left to compute -- so `dx` isn't
    // "small," it's `0` by construction, up to floating-point roundoff.
    // A genuinely diagonal chain never triggers this recognition (see
    // the "genuinely diagonal chain" test below, including a direct
    // pin on the trigger itself, not just its output) -- exactness here
    // is never a snap toward a preferred axis.
    expect(scene.wallRuns.length).toBeGreaterThan(0);
    for (const run of scene.wallRuns) {
      const dx = run.end.x - run.start.x;
      const dz = run.end.z - run.start.z;
      const len = Math.hypot(dx, dz);
      expect(Math.abs(dx / len)).toBeLessThan(1e-6);
    }
  });
});

describe("boundariesToWallRuns — Kirk's-dungeon-shaped short column chain (rpg-dnd5e-web#799)", () => {
  it('renders exactly vertical even though the chain is short and its own edge-type mix is imbalanced', () => {
    // Kirk, walking his own authored dungeon after the tomb's ~1.6-degree
    // residual (#788) shipped as "close enough": "walls are also not
    // straight" -- WORSE than the tomb, on a shorter chain. This
    // reproduces that shape directly: a real region-complement column
    // boundary (region B: 2q+r >= 10, the same "which side of a
    // world-x-monotonic cut" rule as the tomb's own seams), restricted
    // to a short 4-row band instead of the tomb's full 8. Verified
    // (during development, via the exact same edge-classification this
    // module's own `authoredAxisLine` uses) that this specific short
    // band's 7 edges split 4 "E-type" / 2 "NE-type" / 1 "SE-type" by
    // hex-adjacency direction -- an uncancelable remainder, same class
    // as the tomb's own 7/4/3 split, not a hand-picked balanced case.
    // Old behavior (a continuous least-squares fit over ANY per-edge
    // point set, corner-vertex or boundary-pair-midpoint alike) could
    // only ever get CLOSE on data shaped like this -- measured 0.0857
    // during development, worse than the tomb's own 0.0189, matching
    // Kirk's "worse than the tomb" report exactly. What actually fixes
    // it: every one of these 7 edges crosses the identical authored
    // column pair, so `authoredAxisLine` recognizes this as one
    // declared vertical wall regardless of its own edge-type mix, and
    // renders it exactly vertical by construction, not by a luckier
    // average.
    const cells: unknown[] = [];
    for (let q = 0; q <= 10; q++) {
      for (let r = 0; r <= 3; r++) cells.push(pos(q, r));
    }
    const inB = (q: number, r: number) => 2 * q + r >= 10;
    const edges: Array<[number, number, number, number]> = [];
    const seen = new Set<string>();
    for (let q = 0; q <= 10; q++) {
      for (let r = 0; r <= 3; r++) {
        const neighbors: Array<[number, number]> = [
          [q + 1, r - 1],
          [q + 1, r],
          [q, r - 1],
          [q - 1, r],
          [q - 1, r + 1],
          [q, r + 1],
        ];
        for (const [nq, nr] of neighbors) {
          if (nq < 0 || nq > 10 || nr < 0 || nr > 3) continue;
          if (inB(q, r) === inB(nq, nr)) continue;
          const key = [q, r, nq, nr].sort().join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push([q, r, nq, nr]);
        }
      }
    }
    expect(edges.length).toBe(7); // the exact short, imbalanced chain this test is about

    const boundaries = edges.map(([q, r, nq, nr]) => ({
      from: pos(q, r),
      to: pos(nq, nr),
      blocksMovement: true,
      blocksLineOfSight: true,
    }));
    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
    expect(scene.wallRuns.length).toBeGreaterThan(0);
    for (const run of scene.wallRuns) {
      const dx = run.end.x - run.start.x;
      const dz = run.end.z - run.start.z;
      const len = Math.hypot(dx, dz);
      expect(Math.abs(dx / len)).toBeLessThan(1e-6);
    }
  });
});

describe('boundariesToWallRuns — a genuinely diagonal authored chain is not snapped to an axis', () => {
  // A real interior partition along a genuinely DIAGONAL cut (region B:
  // q - r >= 0; region A: everything else) -- every real hex-adjacent
  // A/B pair becomes a boundary edge. Factored out so both tests below
  // (the scene-level output, and a direct pin on the discrete trigger
  // itself) exercise the exact same real edge set.
  function diagonalChainEdges(): Array<[number, number, number, number]> {
    const inB = (q: number, r: number) => q - r >= 0;
    const edges: Array<[number, number, number, number]> = [];
    const seen = new Set<string>();
    for (let q = -3; q <= 6; q++) {
      for (let r = -3; r <= 6; r++) {
        const neighbors: Array<[number, number]> = [
          [q + 1, r - 1],
          [q + 1, r],
          [q, r - 1],
          [q - 1, r],
          [q - 1, r + 1],
          [q, r + 1],
        ];
        for (const [nq, nr] of neighbors) {
          if (nq < -3 || nq > 6 || nr < -3 || nr > 6) continue;
          if (inB(q, r) === inB(nq, nr)) continue;
          const key = [q, r, nq, nr].sort().join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push([q, r, nq, nr]);
        }
      }
    }
    return edges;
  }

  it('fits its own true diagonal, not vertical or horizontal', () => {
    // If the fit ever snapped toward a preferred axis (the failure mode
    // the tomb-seam test above is deliberately exact about avoiding),
    // this wall would come out vertical or horizontal instead of its
    // own true ~30-degree diagonal (hex grids have no 45-degree
    // principal direction; a "q - r" cut's natural angle is one of the
    // grid's own 6 principal directions, verified empirically at
    // dirX~=0.866, dirZ~=0.5 during development) -- the fit IS the
    // rule, not a snap.
    const edges = diagonalChainEdges();
    expect(edges.length).toBeGreaterThan(10);
    const cells: unknown[] = [];
    for (let q = -3; q <= 6; q++) {
      for (let r = -3; r <= 6; r++) cells.push(pos(q, r));
    }
    const boundaries = edges.map(([q, r, nq, nr]) => ({
      from: pos(q, r),
      to: pos(nq, nr),
      blocksMovement: true,
      blocksLineOfSight: true,
    }));
    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
    expect(scene.wallRuns.length).toBeGreaterThan(0);
    for (const run of scene.wallRuns) {
      const dx = run.end.x - run.start.x;
      const dz = run.end.z - run.start.z;
      const len = Math.hypot(dx, dz);
      // Neither component should be near-zero (that would mean this
      // run got pulled toward a pure vertical or horizontal axis).
      expect(Math.abs(dx / len)).toBeGreaterThan(0.3);
      expect(Math.abs(dz / len)).toBeGreaterThan(0.3);
    }
  });

  it('the discrete authored-axis trigger (rpg-dnd5e-web#799) never fires on this chain -- a direct pin on the mechanism, not just its output', () => {
    // authoredAxisLine's own contract: undefined means "no declared
    // axis recognized, use the continuous fit" -- pinned directly here
    // (not just inferred from the scene-level test above's diagonal
    // output) because a future change to the continuous fit could
    // coincidentally keep producing a diagonal-looking result even if
    // the trigger itself started misfiring on this data; this test
    // can't pass that way.
    const edgeData: EdgeFitData[] = diagonalChainEdges().map(
      ([q, r, nq, nr]) => {
        const from = positionToCube(pos(q, r));
        const to = positionToCube(pos(nq, nr));
        return { mid: edgeMid(from, to), from, to };
      }
    );
    expect(edgeData.length).toBeGreaterThan(10);
    expect(authoredAxisLine(edgeData, { x: 0, z: 0 })).toBeUndefined();
  });
});

describe('boundariesToWallRuns — a partial interior wall that does not fully split the floor', () => {
  it('renders exactly at its authored location instead of being silently dropped (the old bug: chamberFrom.id === chamberTo.id -> skip)', () => {
    // A 2-wide, 3-tall floor with ONE boundary edge at row 0 only — the
    // floor stays fully connected via rows 1-2, so a chamber-reconstruction
    // approach would find both endpoints in the same component and drop
    // this wall entirely. It must still render, exactly at its own edge.
    const cells = [
      pos(0, 0),
      pos(1, 0),
      pos(0, 1),
      pos(1, 1),
      pos(0, 2),
      pos(1, 2),
    ];
    const boundaries = [
      {
        from: pos(0, 0),
        to: pos(1, 0),
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    ];
    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
    const from = positionToCube(pos(0, 0));
    const to = positionToCube(pos(1, 0));
    const { a, b } = hexEdgeBetween(from, to, 1);
    const matchesRun = scene.wallRuns.some((r) => {
      const forward =
        Math.hypot(r.start.x - a.x, r.start.z - a.z) < 1e-6 &&
        Math.hypot(r.end.x - b.x, r.end.z - b.z) < 1e-6;
      const reverse =
        Math.hypot(r.start.x - b.x, r.start.z - b.z) < 1e-6 &&
        Math.hypot(r.end.x - a.x, r.end.z - a.z) < 1e-6;
      return forward || reverse;
    });
    expect(matchesRun).toBe(true);
  });
});

describe('boundariesToWallRuns — an L-shaped interior seam', () => {
  it('breaks into multiple straight runs meeting at the corner, not one chord smeared across the bend', () => {
    // The real perimeter of a 2x2 inner block against the surrounding
    // floor (genuine hex adjacency, not hand-guessed pairs) — a
    // rectangle, so every one of its 4 corners is a real direction
    // change an L-shaped wall would also have.
    const cells: unknown[] = [];
    for (let q = 0; q <= 5; q++) {
      for (let r = 0; r <= 5; r++) cells.push(pos(q, r));
    }
    const isInner = (q: number, r: number) =>
      q >= 2 && q <= 3 && r >= 2 && r <= 3;
    const boundaries: Array<{
      from: unknown;
      to: unknown;
      blocksMovement: boolean;
      blocksLineOfSight: boolean;
    }> = [];
    const seen = new Set<string>();
    for (let q = 2; q <= 3; q++) {
      for (let r = 2; r <= 3; r++) {
        const neighbors: Array<[number, number]> = [
          [q + 1, r - 1],
          [q + 1, r],
          [q, r - 1],
          [q - 1, r],
          [q - 1, r + 1],
          [q, r + 1],
        ];
        for (const [nq, nr] of neighbors) {
          if (isInner(nq, nr)) continue;
          if (nq < 0 || nq > 5 || nr < 0 || nr > 5) continue;
          const key = [q, r, nq, nr].sort().join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          boundaries.push({
            from: pos(q, r),
            to: pos(nq, nr),
            blocksMovement: true,
            blocksLineOfSight: true,
          });
        }
      }
    }
    expect(boundaries.length).toBeGreaterThan(4); // a real rectangle, not a stub

    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
    // More than one run in total — the seam itself breaks into at least
    // two legs at its corner (no floor envelope contributes anymore).
    expect(scene.wallRuns.length).toBeGreaterThan(1);
    // Every one of this interior wall's own declared edges — including
    // the ones flanking its 4 corners — is covered by some run: a bad
    // diagonal chord cutting across a bend would leave the edges near
    // the corner far from every run's own line.
    for (const b of boundaries) {
      const mid = edgeMid(
        positionToCube(b.from as never),
        positionToCube(b.to as never)
      );
      expect(nearestRunDistance(mid, scene.wallRuns)).toBeLessThanOrEqual(
        CHAIN_TOLERANCE + 1e-6
      );
    }
  });
});

describe('boundariesToWallRuns — corners close by construction (rpg-dnd5e-web#793)', () => {
  /** A real interior L-shaped partition (region B a plain rectangle,
   * region A its complement within the floor -- the exact construction
   * the merged L-shaped-seam test above already proves produces a
   * genuine two-leg bend) with `mirrored` flipping which side is B, so
   * the corner bends the other way -- "both orientations of the
   * corner" per the issue. */
  function lShapedScene(mirrored: boolean) {
    const cells: unknown[] = [];
    for (let q = 0; q <= 8; q++) {
      for (let r = 0; r <= 7; r++) cells.push(pos(q, r));
    }
    const inB = mirrored
      ? (q: number, r: number) => q <= 5 && r >= 4
      : (q: number, r: number) => q >= 3 && r >= 4;
    const edges: Array<[number, number, number, number]> = [];
    const seen = new Set<string>();
    for (let q = 0; q <= 8; q++) {
      for (let r = 0; r <= 7; r++) {
        const neighbors: Array<[number, number]> = [
          [q + 1, r - 1],
          [q + 1, r],
          [q, r - 1],
          [q - 1, r],
          [q - 1, r + 1],
          [q, r + 1],
        ];
        for (const [nq, nr] of neighbors) {
          if (nq < 0 || nq > 8 || nr < 0 || nr > 7) continue;
          if (inB(q, r) === inB(nq, nr)) continue;
          const key = [q, r, nq, nr].sort().join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push([q, r, nq, nr]);
        }
      }
    }
    const boundaries = edges.map(([q, r, nq, nr]) => ({
      from: pos(q, r),
      to: pos(nq, nr),
      blocksMovement: true,
      blocksLineOfSight: true,
    }));
    return boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
  }

  /** A genuine T-junction: three regions tiled by cube-axis dominance
   * (region = whichever of a cell's own cube x/y/z is the strict
   * maximum) around one small patch of floor -- a standard hex-grid
   * tri-coloring, not a hand-picked shape, that reliably produces
   * exactly one raw vertex where all three regions meet (verified: at
   * this N, exactly one endpoint cluster of size 3 exists, and every
   * other genuine corner in the fixture clusters at size 2).
   * `computeAuthoredWallRuns` explicitly supports a branch vertex with
   * 3+ runs meeting it (this module's own header doc, corners
   * section) -- this is that shape. */
  function tJunctionScene() {
    const N = 2;
    const regionOf = (q: number, r: number): 0 | 1 | 2 => {
      const x = q;
      const y = -q - r;
      const z = r;
      if (x >= y && x >= z) return 0;
      if (y > x && y >= z) return 1;
      return 2;
    };
    const inRange = (q: number, r: number) =>
      Math.abs(q) <= N && Math.abs(r) <= N && Math.abs(-q - r) <= N;
    const cells: unknown[] = [];
    for (let q = -N; q <= N; q++) {
      for (let r = -N; r <= N; r++) if (inRange(q, r)) cells.push(pos(q, r));
    }
    const boundaries: Array<{
      from: unknown;
      to: unknown;
      blocksMovement: boolean;
      blocksLineOfSight: boolean;
    }> = [];
    const seen = new Set<string>();
    for (let q = -N; q <= N; q++) {
      for (let r = -N; r <= N; r++) {
        if (!inRange(q, r)) continue;
        const neighbors: Array<[number, number]> = [
          [q + 1, r - 1],
          [q + 1, r],
          [q, r - 1],
          [q - 1, r],
          [q - 1, r + 1],
          [q, r + 1],
        ];
        for (const [nq, nr] of neighbors) {
          if (!inRange(nq, nr)) continue;
          if (regionOf(q, r) === regionOf(nq, nr)) continue;
          const key = [q, r, nq, nr].sort().join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          boundaries.push({
            from: pos(q, r),
            to: pos(nq, nr),
            blocksMovement: true,
            blocksLineOfSight: true,
          });
        }
      }
    }
    return boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
  }

  const CORNER_OVERLAP_MARGIN = 0.16;
  const JOIN_RADIUS = 0.5;
  // A real bend's two directions are never anywhere near parallel (the
  // shallowest authored corner this codebase's hex geometry produces
  // is still a clear angle change); a straight fragment-to-fragment
  // join has directions pointing the SAME or OPPOSITE way. 0.9 sits
  // well below any genuine corner's dot product and well above a
  // collinear join's -- see the describe block's own header doc,
  // Copilot review finding, for why this check exists at all.
  const COLLINEAR_DOT_LIMIT = 0.9;

  interface EndpointRef {
    runIndex: number;
    end: 'start' | 'end';
    point: P;
    dir: P;
  }

  /** Groups every run endpoint (both ends of every run) with every
   * OTHER endpoint within `JOIN_RADIUS`, transitively (single-linkage,
   * like the production clustering this test is verifying from the
   * outside) -- then only accepts a group as real evidence of a
   * corner/junction if EVERY pair of its members' directions forms a
   * genuine bend (Copilot review, PR #794: a bare distance threshold
   * alone can also match two independent fragments of what's
   * geometrically one straight run -- the production margin is 0.16,
   * so a straight tolerance-split join can land only 0.32 apart, well
   * inside the old 0.5 radius, with no bend at all). Returns the one
   * group of exactly `size` members satisfying both, or undefined if
   * none exists -- callers assert a corner/junction actually exists
   * before trusting anything about it. */
  function findJunctionCluster(runs: readonly AuthoredWallRun[], size: number) {
    const refs: EndpointRef[] = [];
    for (let i = 0; i < runs.length; i++) {
      refs.push({
        runIndex: i,
        end: 'start',
        point: runs[i]!.start,
        dir: unitDir(runs[i]!.end, runs[i]!.start),
      });
      refs.push({
        runIndex: i,
        end: 'end',
        point: runs[i]!.end,
        dir: unitDir(runs[i]!.start, runs[i]!.end),
      });
    }
    const parent = refs.map((_, i) => i);
    const find = (x: number): number =>
      parent[x] === x ? x : (parent[x] = find(parent[x]!));
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        if (refs[i]!.runIndex === refs[j]!.runIndex) continue; // never join a run to its own other end
        if (distanceBetween(refs[i]!.point, refs[j]!.point) < JOIN_RADIUS) {
          union(i, j);
        }
      }
    }
    const groups = new Map<number, EndpointRef[]>();
    for (let i = 0; i < refs.length; i++) {
      const root = find(i);
      const list = groups.get(root) ?? [];
      list.push(refs[i]!);
      groups.set(root, list);
    }
    for (const group of groups.values()) {
      if (group.length !== size) continue;
      const allBend = group.every((a, gi) =>
        group.every(
          (b, gj) =>
            gi === gj ||
            Math.abs(a.dir.x * b.dir.x + a.dir.z * b.dir.z) <
              COLLINEAR_DOT_LIMIT
        )
      );
      if (allBend) return group;
    }
    return undefined;
  }

  /** Each member's own TRUE corner/junction point -- the final
   * endpoint pulled back by the named overlap margin along that run's
   * OWN direction. Independent of `atlasWallRuns.ts`'s own internals:
   * this is exactly what "the joint closes, then gets a visual margin
   * on top" means from the outside. */
  function trueCornersOf(group: readonly EndpointRef[]) {
    return group.map((m) => ({
      x: m.point.x - m.dir.x * CORNER_OVERLAP_MARGIN,
      z: m.point.z - m.dir.z * CORNER_OVERLAP_MARGIN,
    }));
  }

  it.each([false, true])(
    'the true corner point coincides exactly, mirrored=%s',
    (mirrored) => {
      const scene = lShapedScene(mirrored);
      const group = findJunctionCluster(scene.wallRuns, 2);
      expect(group).toBeDefined(); // a real corner exists in this fixture
      const [trueCornerI, trueCornerJ] = trueCornersOf(group!);
      // Kirk's own finding: one side gapped, the other overlapped. The
      // fix is distance(true corner, true corner) === 0 -- not "close",
      // exact, the same way every other join in this module closes.
      expect(distanceBetween(trueCornerI!, trueCornerJ!)).toBeLessThan(1e-6);
    }
  );

  it.each([false, true])(
    'each run extends exactly the named overlap margin past the true corner, mirrored=%s',
    (mirrored) => {
      const scene = lShapedScene(mirrored);
      const group = findJunctionCluster(scene.wallRuns, 2);
      expect(group).toBeDefined();
      const trueCorners = trueCornersOf(group!);
      // The visual-closure margin assertion: each run's own FINAL
      // corner endpoint sits CORNER_OVERLAP_MARGIN past the shared true
      // corner, along its OWN direction -- real wall-piece thickness
      // overlapping the joint's outside face, not a coincidence of the
      // fit.
      for (let i = 0; i < group!.length; i++) {
        expect(distanceBetween(group![i]!.point, trueCorners[i]!)).toBeCloseTo(
          CORNER_OVERLAP_MARGIN,
          6
        );
      }
    }
  );

  /** The center and radius of the unique circle through 3 non-
   * collinear points -- used below because, unlike a two-run corner
   * (where the shared joint sits EXACTLY on both runs' own fitted
   * lines, so pulling a final endpoint back by the margin along that
   * run's own recomputed direction exactly recovers the joint), a
   * three-run T-junction's least-squares joint generally does NOT sit
   * exactly on any ONE of the three individual fitted lines (that's
   * inherent to fitting 3 lines that don't happen to be exactly
   * concurrent) -- each run's own final segment gets a tiny genuine
   * bend over just its last `CORNER_OVERLAP_MARGIN` of length, so
   * "pull back along the run's own direction" no longer exactly
   * reconstructs the shared joint for 3+ runs the way it does for 2.
   * What IS still exactly true by construction, for any number of
   * runs: every final endpoint is `joint + unitDir * margin`, so every
   * final endpoint sits at EXACTLY distance `margin` from `joint` --
   * i.e., all of them lie on one common circle of that exact radius
   * centered at `joint`. Three non-collinear points determine a unique
   * circle, so recovering that circle from the three FINAL endpoints
   * and checking its radius is `margin` is an exact, external proof
   * that all three really did close to the same one shared joint,
   * without needing to know that joint's coordinates independently. */
  function circumcircle(p0: P, p1: P, p2: P): { center: P; radius: number } {
    const d =
      2 * (p0.x * (p1.z - p2.z) + p1.x * (p2.z - p0.z) + p2.x * (p0.z - p1.z));
    const sq = (p: P) => p.x * p.x + p.z * p.z;
    const ux =
      (sq(p0) * (p1.z - p2.z) +
        sq(p1) * (p2.z - p0.z) +
        sq(p2) * (p0.z - p1.z)) /
      d;
    const uz =
      (sq(p0) * (p2.x - p1.x) +
        sq(p1) * (p0.x - p2.x) +
        sq(p2) * (p1.x - p0.x)) /
      d;
    const center = { x: ux, z: uz };
    return { center, radius: distanceBetween(center, p0) };
  }

  it('a T-junction (three runs meeting at one raw vertex) closes to one shared point, not three (Copilot review, PR #794)', () => {
    // The pairwise-only version of this fix rewrote the same endpoint
    // once per pair it appeared in -- order-dependent, and the three
    // fitted centerlines never ended up sharing one joint. Grouping by
    // raw vertex first closes the whole junction in one shot.
    const scene = tJunctionScene();
    const group = findJunctionCluster(scene.wallRuns, 3);
    expect(group).toBeDefined(); // a real T-junction exists in this fixture
    const [p0, p1, p2] = group!.map((m) => m.point);
    const circle = circumcircle(p0!, p1!, p2!);
    // All three final endpoints sit on ONE circle of exactly the named
    // margin's radius -- possible only if all three really were
    // extended `margin` past the SAME shared joint (see this helper's
    // own doc comment for why this, not a per-run pull-back, is the
    // exact invariant for 3+ runs).
    expect(circle.radius).toBeCloseTo(CORNER_OVERLAP_MARGIN, 6);
    expect(distanceBetween(circle.center, p0!)).toBeCloseTo(
      CORNER_OVERLAP_MARGIN,
      6
    );
    expect(distanceBetween(circle.center, p1!)).toBeCloseTo(
      CORNER_OVERLAP_MARGIN,
      6
    );
    expect(distanceBetween(circle.center, p2!)).toBeCloseTo(
      CORNER_OVERLAP_MARGIN,
      6
    );
  });

  describe('cornerJoint — the near-parallel fallback (Copilot review, PR #794)', () => {
    it('falls back to the shared raw vertex when two lines are too close to parallel to intersect reliably', () => {
      // A first version of this fallback branch `continue`d without
      // assigning anything, so the documented fallback was dead code:
      // each endpoint stayed at its independently-fitted (disagreeing)
      // position. This constructs the case directly -- unreachable
      // through any real authored corner's own geometry (a genuine
      // corner's two legs are never this close to parallel) -- rather
      // than trying to coax it out of the full atlas pipeline.
      const rawVertex: P = { x: 3, z: 5 };
      const nearlyParallel = [
        { point: { x: 0, z: 0 }, dir: { x: 1, z: 0 } },
        {
          point: { x: 1, z: 1 },
          dir: { x: Math.cos(1e-10), z: Math.sin(1e-10) },
        },
      ];
      expect(cornerJoint(rawVertex, nearlyParallel)).toEqual(rawVertex);
    });

    it('still returns the exact intersection for two genuinely non-parallel lines (unchanged happy path)', () => {
      const rawVertex: P = { x: 3, z: 5 }; // never used -- provided for signature only
      const perpendicular = [
        { point: { x: 0, z: 2 }, dir: { x: 1, z: 0 } }, // line z=2
        { point: { x: 4, z: 0 }, dir: { x: 0, z: 1 } }, // line x=4
      ];
      const joint = cornerJoint(rawVertex, perpendicular);
      expect(joint.x).toBeCloseTo(4, 9);
      expect(joint.z).toBeCloseTo(2, 9);
    });
  });
});

describe('boundariesToWallRuns — a horizontal seam (chambers stacked in rows)', () => {
  it('renders along the row boundary’s own midline, not slanted (the old bug: connector geometry only modeled a vertical, column-separating seam)', () => {
    // The real boundary between row-band r<=1 and row-band r>=2 across a
    // 6-wide floor (genuine hex adjacency for every cell pair, not a
    // hand-picked single direction per column — a naive "(q,r)-(q,r+1)
    // for each q" guess does NOT actually chain, verified: those edges
    // don't share a vertex with each other).
    const cells: unknown[] = [];
    for (let q = 0; q <= 5; q++) {
      for (let r = 0; r <= 3; r++) cells.push(pos(q, r));
    }
    const boundaries: Array<{
      from: unknown;
      to: unknown;
      blocksMovement: boolean;
      blocksLineOfSight: boolean;
    }> = [];
    const seen = new Set<string>();
    for (let q = 0; q <= 5; q++) {
      for (const r of [0, 1]) {
        const neighbors: Array<[number, number]> = [
          [q + 1, r - 1],
          [q + 1, r],
          [q, r - 1],
          [q - 1, r],
          [q - 1, r + 1],
          [q, r + 1],
        ];
        for (const [nq, nr] of neighbors) {
          if (nr < 2 || nq < 0 || nq > 5 || nr > 3) continue; // band-B only
          const key = [q, r, nq, nr].sort().join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          boundaries.push({
            from: pos(q, r),
            to: pos(nq, nr),
            blocksMovement: true,
            blocksLineOfSight: true,
          });
        }
      }
    }
    expect(boundaries.length).toBeGreaterThan(5);

    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
    for (const b of boundaries) {
      const mid = edgeMid(
        positionToCube(b.from as never),
        positionToCube(b.to as never)
      );
      expect(nearestRunDistance(mid, scene.wallRuns)).toBeLessThanOrEqual(
        CHAIN_TOLERANCE + 1e-6
      );
    }
  });
});

describe("boundariesToWallRuns — a door mid-way along an L-run's leg", () => {
  it('aligns rotation and gap position with the straightened leg it interrupts, not its own raw hex-edge angle', () => {
    // A real interior L-shaped partition between two regions: region B is
    // a plain rectangle (q>=3, r>=4); region A is everything else in the
    // floor (an L wrapping the left column + top row). Every real
    // hex-adjacent A/B pair becomes a boundary edge, giving a genuine
    // bent wall with two legs meeting at one corner -- not a hand-picked
    // guess. One edge well inside the horizontal leg (away from both the
    // corner and the leg's own far end) is swapped for a doorway.
    const cells: unknown[] = [];
    for (let q = 0; q <= 8; q++) {
      for (let r = 0; r <= 7; r++) cells.push(pos(q, r));
    }
    const inB = (q: number, r: number) => q >= 3 && r >= 4;
    const edges: Array<[number, number, number, number]> = [];
    const seen = new Set<string>();
    for (let q = 0; q <= 8; q++) {
      for (let r = 0; r <= 7; r++) {
        const neighbors: Array<[number, number]> = [
          [q + 1, r - 1],
          [q + 1, r],
          [q, r - 1],
          [q - 1, r],
          [q - 1, r + 1],
          [q, r + 1],
        ];
        for (const [nq, nr] of neighbors) {
          if (nq < 0 || nq > 8 || nr < 0 || nr > 7) continue;
          if (inB(q, r) === inB(nq, nr)) continue; // only the A/B boundary
          const key = [q, r, nq, nr].sort().join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push([q, r, nq, nr]);
        }
      }
    }
    expect(edges.length).toBeGreaterThan(10); // a real two-leg wall

    const doorEdge = edges.find(
      ([q, r, nq, nr]) => q === 7 && r === 3 && nq === 7 && nr === 4
    )!;
    expect(doorEdge).toBeDefined();

    const boundaries = edges
      .filter((e) => e !== doorEdge)
      .map(([q, r, nq, nr]) => ({
        from: pos(q, r),
        to: pos(nq, nr),
        blocksMovement: true,
        blocksLineOfSight: true,
      }));
    const doorways = [
      {
        connection: 'mid-leg-door',
        from: pos(doorEdge[0], doorEdge[1]),
        to: pos(doorEdge[2], doorEdge[3]),
      },
    ];

    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: doorways as never,
      },
      1
    );

    const from = positionToCube(pos(doorEdge[0], doorEdge[1]));
    const to = positionToCube(pos(doorEdge[2], doorEdge[3]));
    const gap = scene.doorGaps[0]!;

    const { near, far } = gapBoundaryPoints(gap);
    const nearRun = findRunTouching(near, scene.wallRuns);
    const farRun = findRunTouching(far, scene.wallRuns);
    expect(nearRun).toBeDefined(); // a real leg flanks this door on at least one side
    expect(farRun).toBeDefined();
    // The gap closes EXACTLY on the flanking leg's own end (rpg-dnd5e-web#788
    // second walk finding) -- findRunTouching's own 1e-6 match already
    // proves this; asserted again explicitly for a direct, named pin.
    expect(
      distanceBetween(nearRun!.run.start, near) < 1e-6 ||
        distanceBetween(nearRun!.run.end, near) < 1e-6
    ).toBe(true);
    expect(
      distanceBetween(farRun!.run.start, far) < 1e-6 ||
        distanceBetween(farRun!.run.end, far) < 1e-6
    ).toBe(true);
    // Both flanking runs agree on which side is outward (rpg-dnd5e-web#788
    // second walk finding) -- same-side, not bit-identical vectors; see
    // the tomb-door facing test's own comment for why.
    const facingDot =
      nearRun!.run.facing.x * farRun!.run.facing.x +
      nearRun!.run.facing.z * farRun!.run.facing.z;
    expect(facingDot).toBeGreaterThan(0);

    const reference = nearRun ?? farRun!;
    expect(gap.rotationY).toBeCloseTo(rotationYOf(reference!.dir), 6);

    // The gap center is a genuine PROJECTION onto the leg's own line,
    // not the raw hex-edge midpoint used verbatim -- rpg-dnd5e-web#799
    // makes that projection EXACT for this specific leg, not merely
    // close: every edge crossing the row-4 band shares the identical
    // row pair {3,4}, so this leg is authored-axis-declared horizontal
    // (this module's own header doc, seam-fit section) -- and world z
    // is already a PURE function of row alone (no offset/zigzag exists
    // on that axis at all, unlike world x for a column), so every one
    // of this leg's raw edge midpoints already sits at the exact same
    // z the constrained fit computes. The projection still does real
    // work (x stays exactly at the door's own raw position, only z is
    // forced onto the leg's line) -- it just has nothing to correct
    // for THIS axis, on THIS leg, which is the honest, better outcome
    // #799 exists to produce: shift == 0 exactly.
    const rawMid = edgeMid(from, to);
    const shift = distanceBetween(gap.position, rawMid);
    expect(shift).toBeLessThan(1e-6);
  });
});

describe('boundariesToWallRuns — two doorways on the same seam (#782)', () => {
  it('gives each of the two doors its own gap, not one Map entry per chamber pair', () => {
    const cells: unknown[] = [];
    for (let r = 0; r <= 5; r++) {
      cells.push(pos(0, r), pos(1, r));
    }
    const wallRows = [0, 2, 3, 5];
    const doorRows = [1, 4];
    const boundaries = wallRows.map((r) => ({
      from: pos(0, r),
      to: pos(1, r),
      blocksMovement: true,
      blocksLineOfSight: true,
    }));
    const doorways = doorRows.map((r) => ({
      connection: `door-${r}`,
      from: pos(0, r),
      to: pos(1, r),
    }));
    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: doorways as never,
      },
      1
    );
    expect(scene.doorGaps).toHaveLength(2);
    const keys = scene.doorGaps.map((d) => d.key).sort();
    expect(keys).toEqual(['door-1', 'door-4']);
    // Distinct positions — not the same gap doubled.
    const [d1, d2] = scene.doorGaps;
    expect(
      Math.hypot(
        d1!.position.x - d2!.position.x,
        d1!.position.z - d2!.position.z
      )
    ).toBeGreaterThan(1);
  });
});

describe('boundariesToWallRuns — a non-rectangular floor with no declared walls', () => {
  it('draws nothing at all, notch or no notch — there is no implied outline to trace anymore', () => {
    // A 3x3 block missing its (2,2) corner cell — an L/notched floor,
    // with NO boundaries or doorways declared. Before the ruling change
    // this asserted the envelope traced the real notch instead of a
    // bounding rectangle; now there is no envelope of any kind, so an
    // undeclared floor edge (notched or straight) draws nothing at all.
    const cells: unknown[] = [];
    for (let q = 0; q <= 2; q++) {
      for (let r = 0; r <= 2; r++) {
        if (q === 2 && r === 2) continue; // the notch
        cells.push(pos(q, r));
      }
    }
    const scene = boundariesToWallRuns(
      { cells: cells as never, boundaries: [] as never, doorways: [] as never },
      1
    );
    expect(scene.wallRuns).toEqual([]);
    expect(scene.doorGaps).toEqual([]);
  });
});

describe('boundariesToWallRuns — an author-drawn wall at the floor’s own edge', () => {
  it('renders exactly like any other boundary — no special-cased envelope path (ruling point 2: "if an author wants a visible outer wall, they draw it like any other wall")', () => {
    // A single floor cell with ONE declared boundary against a NON-floor
    // (void) neighbor — an author explicitly drawing an outer wall,
    // using the exact same `atlas.boundaries` shape an interior wall
    // uses. This module never checks whether a boundary's `to` is in
    // the floor mask, so this is the same code path as any other
    // boundary edge, proving the "no special casing" half of the ruling.
    const cells = [pos(0, 0)];
    const from = positionToCube(pos(0, 0));
    const to = positionToCube(pos(1, 0)); // not in `cells` — a void neighbor
    const boundaries = [
      {
        from: pos(0, 0),
        to: pos(1, 0),
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    ];
    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
    const { a, b } = hexEdgeBetween(from, to, 1);
    const matchesRun = scene.wallRuns.some((r) => {
      const forward =
        Math.hypot(r.start.x - a.x, r.start.z - a.z) < 1e-6 &&
        Math.hypot(r.end.x - b.x, r.end.z - b.z) < 1e-6;
      const reverse =
        Math.hypot(r.start.x - b.x, r.start.z - b.z) < 1e-6 &&
        Math.hypot(r.end.x - a.x, r.end.z - a.z) < 1e-6;
      return forward || reverse;
    });
    expect(matchesRun).toBe(true);
  });
});

describe('boundariesToWallRuns — a doorway declared on the same cell pair as a boundary (Copilot review, PR #788)', () => {
  it('the boundary does not tile as wall geometry across the door opening', () => {
    // A shape this codebase already treats as valid: the doorway "punches
    // through" a declared boundary on the exact same adjacent cell pair.
    // If both edges were fed to the chaining engine unfiltered, the
    // boundary would still tile as a normal wall run and cover the door.
    // An unrelated second boundary elsewhere in the fixture keeps this a
    // real discriminator (scene.wallRuns isn't simply empty) now that
    // there's no floor envelope to also fall back on.
    const cells = [pos(0, 0), pos(1, 0), pos(0, 1), pos(1, 1)];
    const boundaries = [
      {
        from: pos(0, 0),
        to: pos(1, 0),
        blocksMovement: true,
        blocksLineOfSight: true,
      },
      {
        from: pos(0, 1),
        to: pos(1, 1),
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    ];
    const doorways = [{ connection: 'door-a', from: pos(0, 0), to: pos(1, 0) }];
    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: doorways as never,
      },
      1
    );
    expect(scene.doorGaps).toHaveLength(1);
    expect(scene.wallRuns.length).toBeGreaterThan(0); // the OTHER boundary still renders
    const from = positionToCube(pos(0, 0));
    const to = positionToCube(pos(1, 0));
    const { a, b } = hexEdgeBetween(from, to, 1);
    // No run may BE that boundary edge's own exact geometry — without
    // the fix, this tiny fixture's only other declared boundary is the
    // door's own pair, so the un-suppressed boundary would chain as its
    // own isolated 1-edge run at exactly these two corner points (the
    // same exact-match shape the partial-wall test above uses to prove
    // an isolated edge DOES render — here it must NOT).
    const tiledAcrossDoor = scene.wallRuns.some((r) => {
      const forward =
        Math.hypot(r.start.x - a.x, r.start.z - a.z) < 1e-6 &&
        Math.hypot(r.end.x - b.x, r.end.z - b.z) < 1e-6;
      const reverse =
        Math.hypot(r.start.x - b.x, r.start.z - b.z) < 1e-6 &&
        Math.hypot(r.end.x - a.x, r.end.z - a.z) < 1e-6;
      return forward || reverse;
    });
    expect(tiledAcrossDoor).toBe(false);
  });
});

describe('boundariesToWallRuns — small edge cases', () => {
  it('gives two chambers with no declared boundary between them nothing at all — no envelope to fall back on', () => {
    const cells = [pos(0, 0), pos(10, 0)];
    const scene = boundariesToWallRuns(
      { cells: cells as never, boundaries: [] as never, doorways: [] as never },
      1
    );
    expect(scene).toEqual({ wallRuns: [], doorGaps: [] });
  });

  it('gives an empty atlas empty runs instead of Infinity/NaN geometry (Copilot review, PR #764)', () => {
    const scene = boundariesToWallRuns(
      { cells: [] as never, boundaries: [] as never, doorways: [] as never },
      1
    );
    expect(scene).toEqual({ wallRuns: [], doorGaps: [] });
  });
});

describe('boundariesToWallRuns — input order is canonicalized (rpg-dnd5e-web#808)', () => {
  // Kirk's walk: "the bottom room east wall does not match the corner.
  // it seems the view from the 2d does not match the 3d." Same edge
  // SET, two callers, two iteration orders — the 2D board hands this
  // module the document's stroke order, the server's compiled atlas
  // arrives sorted — and before canonicalization the chain walk's
  // branch-vertex membership (and so each chain's fitted line and every
  // downstream corner joint) depended on that order: this very fixture
  // put one seam's fitted line HALF A HEX apart between the two orders,
  // and 20/20 random permutations differed. The one-formula law is only
  // real if the answer depends on the input set, not the caller's
  // iteration order.
  //
  // The shape is Kirk's own east corner, minimized: a horizontal row
  // seam (H), a descending diagonal (D), and a column seam (V), all
  // meeting at one lattice vertex — a 3-way branch.
  const offsetCell = (col: number, row: number) =>
    pos(col - (row - (row & 1)) / 2, row);
  const cells: ReturnType<typeof pos>[] = [];
  for (let row = 0; row <= 8; row += 1) {
    for (let col = 0; col <= 11; col += 1) cells.push(offsetCell(col, row));
  }
  const pair = (a: [number, number], b: [number, number]) => ({
    from: pos(a[0], a[1]),
    to: pos(b[0], b[1]),
    blocksMovement: true,
    blocksLineOfSight: true,
  });
  const H: [number, number][][] = [
    [
      [1, 3],
      [0, 4],
    ],
    [
      [1, 3],
      [1, 4],
    ],
    [
      [2, 3],
      [1, 4],
    ],
    [
      [2, 3],
      [2, 4],
    ],
    [
      [3, 3],
      [2, 4],
    ],
    [
      [3, 3],
      [3, 4],
    ],
    [
      [4, 3],
      [3, 4],
    ],
    [
      [4, 3],
      [4, 4],
    ],
    [
      [5, 3],
      [4, 4],
    ],
    [
      [5, 3],
      [5, 4],
    ],
    [
      [6, 3],
      [5, 4],
    ],
    [
      [6, 3],
      [6, 4],
    ],
    [
      [7, 3],
      [6, 4],
    ],
    [
      [7, 3],
      [7, 4],
    ],
  ];
  const D: [number, number][][] = [
    [
      [4, 0],
      [5, 0],
    ],
    [
      [5, 0],
      [4, 1],
    ],
    [
      [5, 0],
      [5, 1],
    ],
    [
      [6, 0],
      [5, 1],
    ],
    [
      [5, 1],
      [6, 1],
    ],
    [
      [6, 1],
      [5, 2],
    ],
    [
      [6, 1],
      [6, 2],
    ],
    [
      [7, 1],
      [6, 2],
    ],
    [
      [6, 2],
      [7, 2],
    ],
    [
      [7, 2],
      [6, 3],
    ],
    [
      [7, 2],
      [7, 3],
    ],
    [
      [8, 2],
      [7, 3],
    ],
    [
      [7, 3],
      [8, 3],
    ],
  ];
  const V: [number, number][][] = [
    [
      [8, 3],
      [7, 4],
    ],
    [
      [7, 4],
      [8, 4],
    ],
    [
      [7, 4],
      [7, 5],
    ],
    [
      [6, 5],
      [7, 5],
    ],
    [
      [7, 5],
      [6, 6],
    ],
    [
      [6, 6],
      [7, 6],
    ],
    [
      [6, 6],
      [6, 7],
    ],
    [
      [5, 7],
      [6, 7],
    ],
  ];
  const strokeOrder = [...H, ...D, ...V].map(([a, b]) => pair(a, b));

  const runsOf = (boundaries: typeof strokeOrder) =>
    boundariesToWallRuns({ cells, boundaries, doorways: [] } as never, 1)
      .wallRuns;

  it('every permutation of the same edges derives the identical scene, float-exact', () => {
    const reference = runsOf(strokeOrder);
    expect(reference.length).toBeGreaterThan(1);
    // A deterministic LCG so the shuffles are reproducible.
    let state = 42;
    const rng = () =>
      (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let trial = 0; trial < 12; trial += 1) {
      const shuffled = [...strokeOrder];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      expect(runsOf(shuffled)).toEqual(reference);
    }
  });

  it('the 3-way corner closes: all three runs meet within the corner-overlap miter', () => {
    const runs = runsOf(strokeOrder);
    expect(runs).toHaveLength(3);
    // Each pair of runs has a facing-endpoint separation no larger than
    // the two overlap-margin extensions the closure deliberately adds.
    for (let i = 0; i < runs.length; i += 1) {
      for (let j = i + 1; j < runs.length; j += 1) {
        let min = Infinity;
        for (const a of [runs[i].start, runs[i].end]) {
          for (const b of [runs[j].start, runs[j].end]) {
            min = Math.min(min, distanceBetween(a, b));
          }
        }
        expect(min).toBeLessThanOrEqual(
          2 * DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN + 1e-9
        );
      }
    }
  });
});
