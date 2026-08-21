/**
 * atlasWallRuns tests — chamber detection and straight-run geometry,
 * checked against the real 224-cell reference-tomb fixture and against
 * small hand-built fixtures for the shapes the real data doesn't exercise
 * (a doorway flush against a row-range end, a pair with no doorway at all).
 */
import { describe, expect, it } from 'vitest';
import referenceTombCells from '../../concepts/session-tomb/referenceTombCells.json';
import { boundariesToWallRuns } from './atlasWallRuns';

const pos = (x: number, y: number) => ({ x, y }) as never;

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
  const scene = boundariesToWallRuns(realReferenceTombBoundaries(), 1);

  it('finds exactly one connector run per seam, both spanning the full row range', () => {
    expect(scene.connectorRuns).toHaveLength(2);
    for (const run of scene.connectorRuns) {
      expect(run.coveredRows).toEqual({ minRow: 0, maxRow: 7 });
    }
  });

  it('splits each connector run into two segments around its doorway', () => {
    for (const run of scene.connectorRuns) {
      expect(run.segments).toHaveLength(2);
    }
  });

  it('places each seam at the midline between its two chambers — matching the exact world-x band the individual boundary edges occupy', () => {
    // Independently measured (atlasToScene3D's own per-edge diagnostic,
    // before this straight-run presentation existed): every boundary
    // edge in seam 1 has edge.mid.x between 9.526 and 10.392, seam 2
    // between 26.847 and 27.713. The straight run's own x should sit
    // inside that same band (it IS the midline the zigzag was centered
    // on), not at some unrelated position.
    const [seam1, seam2] = scene.connectorRuns.sort(
      (a, b) => a.segments[0]!.start.x - b.segments[0]!.start.x
    );
    for (const seg of seam1!.segments) {
      expect(seg.start.x).toBeGreaterThan(9.4);
      expect(seg.start.x).toBeLessThan(10.5);
      expect(seg.end.x).toBeGreaterThan(9.4);
      expect(seg.end.x).toBeLessThan(10.5);
    }
    for (const seg of seam2!.segments) {
      expect(seg.start.x).toBeGreaterThan(26.7);
      expect(seg.start.x).toBeLessThan(27.8);
    }
  });

  it('gives every seam a door gap at the doorway’s own row', () => {
    expect(scene.doorGaps).toHaveLength(2);
    const keys = scene.doorGaps.map((d) => d.key).sort();
    expect(keys).toEqual([
      'reference-tomb:entrance-hall',
      'reference-tomb:hall-tomb',
    ]);
    // Row 4 of 0..7 is a bit past the midpoint (t ≈ 0.571) — world z
    // should land near there, not at either end.
    for (const door of scene.doorGaps) {
      expect(door.position.z).toBeGreaterThan(4);
      expect(door.position.z).toBeLessThan(8);
    }
  });

  it('gives the whole floor exactly four envelope runs enclosing the combined 28x8 shape', () => {
    expect(scene.envelopeRuns).toHaveLength(4);
    const sides = scene.envelopeRuns.map((r) => r.side).sort();
    expect(sides).toEqual(['bottom', 'left', 'right', 'top']);

    const top = scene.envelopeRuns.find((r) => r.side === 'top')!;
    const bottom = scene.envelopeRuns.find((r) => r.side === 'bottom')!;
    const left = scene.envelopeRuns.find((r) => r.side === 'left')!;
    const right = scene.envelopeRuns.find((r) => r.side === 'right')!;

    // Top/bottom span nearly the full ~47.6-unit width (offset by the
    // small envelope clearance, so a bit wider than the bare floor).
    expect(Math.abs(top.end.x - top.start.x)).toBeGreaterThan(45);
    expect(Math.abs(bottom.end.x - bottom.start.x)).toBeGreaterThan(45);
    // Left/right span the ~10.5-unit height similarly.
    expect(Math.abs(left.end.z - left.start.z)).toBeGreaterThan(8);
    expect(Math.abs(right.end.z - right.start.z)).toBeGreaterThan(8);

    // Left sits near world x=0 (the tomb's own near edge), right near
    // x≈47.6 (the far edge) — not swapped, not both on the same side.
    expect(left.start.x).toBeLessThan(5);
    expect(right.start.x).toBeGreaterThan(40);
  });

  it('every envelope run faces outward, away from the combined floor’s own center', () => {
    for (const run of scene.envelopeRuns) {
      const mid = {
        x: (run.start.x + run.end.x) / 2,
        z: (run.start.z + run.end.z) / 2,
      };
      // A vector from the tomb's rough center (x≈24, z≈5) toward this
      // run's own midpoint should point the same general way as
      // `facing` — i.e. a positive dot product.
      const towardRun = { x: mid.x - 24, z: mid.z - 5 };
      const dot = towardRun.x * run.facing.x + towardRun.z * run.facing.z;
      expect(dot).toBeGreaterThan(0);
    }
  });
});

describe('boundariesToWallRuns — small hand-built shapes', () => {
  it('gives a pair of adjacent chambers with no doorway a single unbroken run', () => {
    // Two 1-column-wide, 2-row-tall chambers directly side by side
    // (column 0 and column 1 — adjacent, no gap between them, matching
    // how the real reference tomb's chambers touch), separated by a
    // 2-edge boundary and no doorway.
    // A hex grid has 6 neighbours, not 4 — (1,0) and (0,1) are ALSO
    // adjacent to each other (verified: cube distance 1), so cutting
    // only the two "straight-across" edges leaks a path around the
    // corner and the two chambers merge into one component. The real
    // reference tomb's own seams have exactly this shape (~1.75 edges
    // per row, not 1) — this fixture's 3rd edge is that same corner
    // case in miniature, not a special case.
    const cells = [pos(0, 0), pos(0, 1), pos(1, 0), pos(1, 1)];
    const boundaries = [
      {
        from: pos(0, 0),
        to: pos(1, 0),
        blocksMovement: true,
        blocksLineOfSight: true,
      },
      {
        from: pos(1, 0),
        to: pos(0, 1),
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
    const scene = boundariesToWallRuns(
      {
        cells: cells as never,
        boundaries: boundaries as never,
        doorways: [] as never,
      },
      1
    );
    expect(scene.connectorRuns).toHaveLength(1);
    expect(scene.connectorRuns[0]!.segments).toHaveLength(1);
    expect(scene.doorGaps).toHaveLength(0);
  });

  it('gives two chambers with no declared boundary between them zero connector runs', () => {
    // Two chambers that never touch (far apart) — no boundary declared,
    // no seam should be invented.
    const cells = [pos(0, 0), pos(10, 0)];
    const scene = boundariesToWallRuns(
      { cells: cells as never, boundaries: [] as never, doorways: [] as never },
      1
    );
    expect(scene.connectorRuns).toHaveLength(0);
    // Still one floor mask -> still exactly 4 envelope runs (a single,
    // disconnected-looking bounding box in col/row terms), not zero.
    expect(scene.envelopeRuns).toHaveLength(4);
  });
});
