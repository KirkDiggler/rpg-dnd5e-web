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
import { describe, expect, it } from 'vitest';
import referenceTombCells from '../../concepts/session-tomb/referenceTombCells.json';
import { boundariesToWallRuns } from './atlasWallRuns';
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

/** The exact half door-frame width atlasWallRuns.ts trims a run back by
 * at a door-adjacent vertex — mirrored here (not imported) so this test
 * independently re-derives the alignment atlasWallRuns.ts computes,
 * rather than re-reading its own output back at itself. */
const DOOR_TRIM = 0.5;

/**
 * Independently re-derives which run a doorway interrupts and that
 * run's own oriented direction — the exact same "find the run trimmed
 * at DOOR_TRIM from one of the door's own two corners, then orient it
 * to agree with the door's raw edge direction" logic
 * `atlasWallRuns.ts`'s `boundariesToWallRuns` uses internally, written
 * separately here so the rotation pin below isn't circular (rpg-dnd5e-web#788
 * walk finding: "walls look straight now but the door follows the hex
 * edge" — this is the check that would have caught it).
 */
function interruptedRunDirection(
  doorFrom: CubeCoord,
  doorTo: CubeCoord,
  wallRuns: readonly Seg[]
): P | undefined {
  const { a, b } = hexEdgeBetween(doorFrom, doorTo, 1);
  const rawDir = unitDir(a, b);
  for (const corner of [a, b]) {
    for (const run of wallRuns) {
      let lineDir: P | undefined;
      if (Math.abs(distanceBetween(run.start, corner) - DOOR_TRIM) < 1e-6) {
        lineDir = unitDir(run.end, run.start);
      } else if (
        Math.abs(distanceBetween(run.end, corner) - DOOR_TRIM) < 1e-6
      ) {
        lineDir = unitDir(run.start, run.end);
      }
      if (lineDir) {
        const agrees = lineDir.x * rawDir.x + lineDir.z * rawDir.z >= 0;
        return agrees ? lineDir : { x: -lineDir.x, z: -lineDir.z };
      }
    }
  }
  return undefined;
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

  it('door frame rotation matches the run it interrupts, not its own raw hex-edge angle (rpg-dnd5e-web#788 walk finding: "walls look straight now but the door follows the hex edge")', () => {
    const doors = [
      { from: positionToCube(pos(3, 4)), to: positionToCube(pos(4, 4)) },
      { from: positionToCube(pos(13, 4)), to: positionToCube(pos(14, 4)) },
    ];
    for (const d of doors) {
      const dir = interruptedRunDirection(d.from, d.to, scene.wallRuns);
      expect(dir).toBeDefined(); // both tomb doors sit on a real authored wall
      const gap = scene.doorGaps.find(
        (g) => distanceBetween(g.position, edgeMid(d.from, d.to)) < 1
      )!;
      expect(gap).toBeDefined();
      expect(gap.rotationY).toBeCloseTo(rotationYOf(dir!), 6);
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
    const dir = interruptedRunDirection(from, to, scene.wallRuns);
    expect(dir).toBeDefined(); // a real leg flanks this door on at least one side

    const gap = scene.doorGaps[0]!;
    expect(gap.rotationY).toBeCloseTo(rotationYOf(dir!), 6);

    // The gap center is a genuine projection, not the raw hex-edge
    // midpoint used verbatim -- it should differ from the raw midpoint
    // by a small, non-zero amount (proving the projection did something)
    // while staying close to it (proving it didn't jump to an unrelated
    // position).
    const rawMid = edgeMid(from, to);
    const shift = distanceBetween(gap.position, rawMid);
    expect(shift).toBeGreaterThan(0);
    expect(shift).toBeLessThan(1);
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
