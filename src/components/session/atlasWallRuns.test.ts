/**
 * atlasWallRuns tests — straight-run geometry chained straight off the
 * authored edges (rpg-dnd5e-web#787), checked against the real 224-cell
 * reference-tomb fixture (Kirk's live-walk regression pin: same straight
 * envelope, same two seams, same two door gaps) and against small
 * hand-built fixtures for the shapes the real data doesn't exercise: a
 * partial interior wall that doesn't split the floor, an L-shaped seam,
 * a horizontal (row-type) seam, two doors on one seam, and a
 * non-rectangular floor's envelope.
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

  it('keeps each door gap at its cell-centre row: row 4 of 0..7 at hexSize 1 is world z = 6 exactly', () => {
    for (const door of scene.doorGaps) {
      expect(door.position.z).toBeCloseTo(6, 6);
    }
  });

  it('the combined floor still reads as a wide footprint enclosing the whole 28x8 shape (same overall envelope Kirk approved, not a per-run recount)', () => {
    const xs = scene.wallRuns.flatMap((r) => [r.start.x, r.end.x]);
    const zs = scene.wallRuns.flatMap((r) => [r.start.z, r.end.z]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...zs) - Math.min(...zs);
    expect(width).toBeGreaterThan(45);
    expect(width).toBeLessThan(55);
    expect(height).toBeGreaterThan(8);
    expect(height).toBeLessThan(13);
    expect(Math.min(...xs)).toBeLessThan(1);
    expect(Math.max(...xs)).toBeGreaterThan(46);
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
    // More than one run in total (interior seam + floor envelope).
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

describe('boundariesToWallRuns — a non-rectangular floor', () => {
  it('the envelope follows the real notch, not the bounding rectangle: the notch’s own newly-exposed edges are covered by a run', () => {
    // A 3x3 block missing its (2,2) corner cell — an L/notched floor. A
    // bounding-RECTANGLE envelope has no per-cell adjacency data at all,
    // so it could never place a wall at the notch (it only ever knows
    // the floor's min/max col/row); the real outline tracer does, because
    // it walks actual floor-vs-void adjacency.
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
    // The two edges that exist ONLY because (2,2) is missing: (1,2)'s and
    // (2,1)'s own edges toward where (2,2) would have been floor.
    const notchEdges: Array<[CubeCoord, CubeCoord]> = [
      [positionToCube(pos(1, 2)), positionToCube(pos(2, 2))],
      [positionToCube(pos(2, 1)), positionToCube(pos(2, 2))],
    ];
    for (const [from, to] of notchEdges) {
      const mid = edgeMid(from, to);
      expect(nearestRunDistance(mid, scene.wallRuns)).toBeLessThanOrEqual(
        CHAIN_TOLERANCE + 1e-6
      );
    }
  });
});

describe('boundariesToWallRuns — a doorway declared on the same cell pair as a boundary (Copilot review, PR #788)', () => {
  it('the boundary does not tile as wall geometry across the door opening', () => {
    // A shape this codebase already treats as valid: the doorway "punches
    // through" a declared boundary on the exact same adjacent cell pair.
    // If both edges were fed to the chaining engine unfiltered, the
    // boundary would still tile as a normal wall run and cover the door.
    const cells = [pos(0, 0), pos(1, 0), pos(0, 1), pos(1, 1)];
    const boundaries = [
      {
        from: pos(0, 0),
        to: pos(1, 0),
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
  it('gives two chambers with no declared boundary between them zero interior wall geometry, only their own envelopes', () => {
    const cells = [pos(0, 0), pos(10, 0)];
    const scene = boundariesToWallRuns(
      { cells: cells as never, boundaries: [] as never, doorways: [] as never },
      1
    );
    expect(scene.doorGaps).toHaveLength(0);
    // Still a real (non-empty) scene — two isolated single-hex envelopes,
    // not nothing.
    expect(scene.wallRuns.length).toBeGreaterThan(0);
  });

  it('gives an empty atlas empty runs instead of Infinity/NaN geometry (Copilot review, PR #764)', () => {
    const scene = boundariesToWallRuns(
      { cells: [] as never, boundaries: [] as never, doorways: [] as never },
      1
    );
    expect(scene).toEqual({ wallRuns: [], doorGaps: [] });
  });
});
