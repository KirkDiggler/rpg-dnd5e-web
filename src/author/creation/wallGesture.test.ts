/**
 * wallGesture — the drag table (#804, design: rpg-project#267
 * `wall-authoring-gesture.md` §Tests). Pixel-formula discipline, no
 * round-trips (rpg-toolkit#1150 / rpg-dnd5e-web#1141: a symmetric bug
 * passes every round-trip): every named drag asserts the EXACT derived
 * edge list, hand-derived from the corner lattice's own geometry
 * (pointy corners at −30°+60°·i, columns of vertical seam edges at
 * x = √3·(c+1)·size joined by parity-alternating diagonals), not
 * captured from the implementation's own output.
 *
 * The one deliberate deterministic choice pinned here: a drag lying
 * EXACTLY on a corner column (the vertical-seam case) reaches corners
 * where both zigzag sides advance with identical deviation; ties break
 * toward the candidate with the greater x (then greater y), so the
 * derived seam is the one just right of the dragged line, the same
 * chain regardless of which end the author dragged from.
 */
import { describe, expect, it } from 'vitest';
import {
  addWalls,
  emitDungeon,
  emptyDungeon,
  paintCell,
  toggleDoorEdge,
  type DungeonDoc,
} from '../dungeonYaml';
import { edgeKey, fromOffset, normalizeEdge, type Edge } from '../hexOffset';
import { boardWallScene } from './boardWallRuns';
import { BOARD_HEX_SIZE } from './CreationBoard';
import { cornerPoint, sameCorner, type CornerRef } from './hexCorner';
import {
  applyDoorDraw,
  applyReshape,
  applyWallDraw,
  applyWallErase,
  deriveWallAdd,
  deriveWallErase,
  GESTURE_TUNING,
  nearestRunIndex,
  runVertices,
  seamAngles,
  snapGesturePoint,
  tautPath,
} from './wallGesture';

const SIZE = BOARD_HEX_SIZE;
const o = 'pointy' as const;

const off = (c: number, r: number) => fromOffset(o, [c, r]);
/** An expected edge, written in the file's own offset pairs. */
const E = (a: [number, number], b: [number, number]): Edge =>
  normalizeEdge([off(a[0], a[1]), off(b[0], b[1])]);
const keys = (edges: readonly Edge[]) => edges.map(edgeKey);
const ref = (c: number, r: number, corner: number): CornerRef => ({
  cell: off(c, r),
  corner,
});
const pt = (r: CornerRef) => cornerPoint(r, SIZE, o);

/** A 7×6 block of floor (offset cols 0..6, rows 0..5), one region. */
function fixtureDoc(): DungeonDoc {
  let doc = emptyDungeon(o, 'gesture-fixture');
  for (let row = 0; row <= 5; row += 1) {
    for (let col = 0; col <= 6; col += 1) {
      doc = paintCell(doc, 'region-1', off(col, row));
    }
  }
  return doc;
}

/** The magnetism/handle targets as the board builds them: from the
 * rendered scene's runs, so `point` is the drawn endpoint (see-vs-snap:
 * Kirk's walk found lattice-centered magnetism missing where he aimed). */
const sceneVertices = (doc: DungeonDoc) =>
  runVertices(boardWallScene(doc, SIZE)!.runs, SIZE, o);

// The named drags. Corners are addressed by (offset cell, corner index)
// in hexCorners' own convention; the comments give the SVG points in
// units of `size` so the geometry stays checkable by hand.
const VERT = {
  // A = (√3·2.5, −0.5) — top corner of the col2|3 seam's row-0 edge.
  a: ref(2, 0, 0),
  // B = (√3·2.5, 3.5) — bottom corner of the same seam's row-2 edge.
  b: ref(2, 2, 1),
  chain: [
    E([2, 0], [3, 0]),
    E([2, 1], [3, 0]),
    E([2, 1], [3, 1]),
    E([2, 1], [3, 2]),
    E([2, 2], [3, 2]),
  ],
};
const HORIZ = {
  // A = (0, 2) — left corner of the row1|2 seam.
  a: ref(0, 1, 3),
  // B = (√3·2, 2) — four seam edges to the right.
  b: ref(1, 1, 1),
  chain: [
    E([0, 1], [0, 2]),
    E([0, 1], [1, 2]),
    E([1, 1], [1, 2]),
    E([1, 1], [2, 2]),
  ],
};
const FREE = {
  // A = (√3/2, 2.5) → B = (√3·2, 5): a ~44° drag, no seam family near.
  a: ref(1, 2, 4),
  b: ref(1, 3, 1),
  chain: [
    E([0, 2], [1, 2]),
    E([0, 3], [1, 2]),
    E([1, 2], [1, 3]),
    E([1, 3], [2, 2]),
    E([1, 3], [2, 3]),
  ],
};

describe('GESTURE_TUNING — one exported place, pinned', () => {
  it('holds the designed starting points (Kirk’s walk recalibrates, tests re-pin)', () => {
    expect(GESTURE_TUNING).toEqual({
      cornerSnapRadius: 0.4,
      wallVertexSnapRadius: 0.6,
      angleToleranceDeg: 6,
      runHitRadius: 0.25,
    });
  });
});

describe('seamAngles — ruling 1’s four families per orientation', () => {
  it('pointy: horizontal row seam, both diagonals, vertical column seam', () => {
    expect(seamAngles('pointy')).toEqual([0, 60, 90, 120]);
  });
  it('flat: the same four families rotated 30°', () => {
    expect(seamAngles('flat')).toEqual([30, 90, 120, 150]);
  });
});

describe('tautPath — the drag table', () => {
  it('vertical seam drag derives exactly the col2|3 seam chain', () => {
    expect(keys(tautPath(VERT.a, VERT.b, SIZE, o))).toEqual(keys(VERT.chain));
  });

  it('the same vertical line dragged BOTTOM-UP derives the same chain', () => {
    // Direction independence: the tie-break is geometric (greater x),
    // not drag-order-dependent, so erase re-derives what draw derived.
    expect(keys(tautPath(VERT.b, VERT.a, SIZE, o))).toEqual(
      [...keys(VERT.chain)].reverse()
    );
  });

  it('horizontal seam drag derives exactly the row1|2 seam chain', () => {
    expect(keys(tautPath(HORIZ.a, HORIZ.b, SIZE, o))).toEqual(
      keys(HORIZ.chain)
    );
  });

  it('a ~44° free drag derives its own zigzag chain, exactly', () => {
    expect(keys(tautPath(FREE.a, FREE.b, SIZE, o))).toEqual(keys(FREE.chain));
  });

  it('A = B derives nothing', () => {
    expect(tautPath(VERT.a, VERT.a, SIZE, o)).toEqual([]);
  });
});

describe('the derived runs are axis-true (the #802 pins guard the geometry; these pin the derivation)', () => {
  it('the vertical drag’s committed run renders exactly vertical', () => {
    const doc = applyWallDraw(fixtureDoc(), VERT.chain);
    const scene = boardWallScene(doc, SIZE)!;
    expect(scene.runs.length).toBeGreaterThan(0);
    for (const run of scene.runs) {
      expect(Math.abs(run.a.x - run.b.x)).toBeLessThan(1e-6 * SIZE);
    }
  });

  it('the horizontal drag’s committed run renders exactly horizontal', () => {
    const doc = applyWallDraw(fixtureDoc(), HORIZ.chain);
    const scene = boardWallScene(doc, SIZE)!;
    expect(scene.runs.length).toBeGreaterThan(0);
    for (const run of scene.runs) {
      expect(Math.abs(run.a.y - run.b.y)).toBeLessThan(1e-6 * SIZE);
    }
  });
});

describe('derivation rules — floor filter, door break, dedup', () => {
  it('a drag across a door skips the door edge and the chain breaks there', () => {
    const doorEdge = E([2, 1], [3, 1]);
    const doc = toggleDoorEdge(fixtureDoc(), doorEdge);
    const derived = deriveWallAdd(doc, tautPath(VERT.a, VERT.b, SIZE, o));
    expect(keys(derived)).toEqual(
      keys(VERT.chain.filter((e) => edgeKey(e) !== edgeKey(doorEdge)))
    );
  });

  it('an off-floor pair is skipped — the envelope is implied, never authored', () => {
    // Same drag on a doc whose floor stops at offset row 1: the chain's
    // row-2-touching edges vanish rather than author the void.
    let doc = emptyDungeon(o, 'gesture-fixture');
    for (let row = 0; row <= 1; row += 1) {
      for (let col = 0; col <= 6; col += 1) {
        doc = paintCell(doc, 'region-1', off(col, row));
      }
    }
    const derived = deriveWallAdd(doc, tautPath(VERT.a, VERT.b, SIZE, o));
    expect(keys(derived)).toEqual(keys(VERT.chain.slice(0, 3)));
  });

  it('drawing over an existing wall is idempotent — the overlap edge is deduplicated', () => {
    const doc = addWalls(fixtureDoc(), [VERT.chain[0]]);
    const derived = deriveWallAdd(doc, tautPath(VERT.a, VERT.b, SIZE, o));
    expect(keys(derived)).toEqual(keys(VERT.chain.slice(1)));
    // …and committing still yields the full seam exactly once.
    const committed = applyWallDraw(doc, tautPath(VERT.a, VERT.b, SIZE, o));
    expect(keys(committed.walls).sort()).toEqual(keys(VERT.chain).sort());
  });
});

describe('snapGesturePoint — corners snap by construction', () => {
  it('an existing wall vertex within its (stronger) radius beats a nearer plain corner', () => {
    // P sits 0.55·size from the chain endpoint at (√3, 2)·size but only
    // 0.45·size from the plain corner at (√3·1.5, 2.5)·size — the wall
    // vertex still wins: sharing a vertex IS the closed corner.
    const existing = [E([0, 1], [0, 2]), E([0, 1], [1, 2])];
    const vertices = sceneVertices(addWalls(fixtureDoc(), existing));
    const endpoint = ref(0, 1, 1); // (√3, 2)·size
    const p = pt(endpoint);
    const raw = { x: p.x + 0.478 * SIZE, y: p.y + 0.275 * SIZE };
    const withMagnet = snapGesturePoint(raw, SIZE, o, {
      wallVertices: vertices,
    });
    expect(sameCorner(withMagnet, endpoint, SIZE, o)).toBe(true);
    const without = snapGesturePoint(raw, SIZE, o, {});
    expect(sameCorner(without, ref(1, 1, 2), SIZE, o)).toBe(true); // (√3·1.5, 2.5)
  });

  it('angle magnetism: within ~6° of vertical the endpoint lands on the dragged column', () => {
    const origin = pt(VERT.a);
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const at = (deg: number, len: number) => ({
      x: origin.x + len * SIZE * Math.sin(rad(deg)),
      y: origin.y + len * SIZE * Math.cos(rad(deg)),
    });
    // 4° off vertical over a 12-hex drag: raw nearest corner is OFF the
    // column; the snapped one is ON it.
    const onColumn = ref(2, 8, 0); // (√3·2.5, 11.5)·size
    const snapped = snapGesturePoint(at(4, 12), SIZE, o, { origin });
    expect(sameCorner(snapped, onColumn, SIZE, o)).toBe(true);
    // Alt bypasses: the same pointer keeps its own nearest corner.
    const free = snapGesturePoint(at(4, 12), SIZE, o, { origin, alt: true });
    expect(sameCorner(free, onColumn, SIZE, o)).toBe(false);
    expect(sameCorner(free, ref(3, 8, 5), SIZE, o)).toBe(true); // (√3·3, 11)·size
    // 20° is outside every family: no snap even without Alt.
    const wide = snapGesturePoint(at(20, 6), SIZE, o, { origin });
    expect(sameCorner(wide, onColumn, SIZE, o)).toBe(false);
  });

  it('magnetizes to the RENDERED run endpoint, not the lattice vertex behind it (Kirk’s walk)', () => {
    // A ~44° chain's fitted+projected endpoint sits ~0.52·size from its
    // chain-end lattice vertex (measured; the fit, corner closure and
    // margins all move the drawn end off the raw lattice). Aim just
    // past the DRAWN end: the pointer is outside the 0.6·size gate
    // measured from the lattice vertex — the old, lattice-centered
    // magnetism missed exactly this aim — but well inside it measured
    // from the rendered endpoint, and the snap still resolves to the
    // chain's LATTICE vertex for derivation.
    const doc = applyWallDraw(fixtureDoc(), FREE.chain);
    const vertices = sceneVertices(doc);
    const scene = boardWallScene(doc, SIZE)!;
    expect(scene.runs).toHaveLength(1);
    const run = scene.runs[0];
    const latticeEnd = ref(1, 3, 1); // (√3·2, 5)·size
    const lp = pt(latticeEnd);
    const drawnEnd =
      Math.hypot(run.a.x - lp.x, run.a.y - lp.y) <
      Math.hypot(run.b.x - lp.x, run.b.y - lp.y)
        ? run.a
        : run.b;
    const other = drawnEnd === run.a ? run.b : run.a;
    const len = Math.hypot(drawnEnd.x - other.x, drawnEnd.y - other.y);
    const out = {
      x: drawnEnd.x + ((drawnEnd.x - other.x) / len) * 0.15 * SIZE,
      y: drawnEnd.y + ((drawnEnd.y - other.y) / len) * 0.15 * SIZE,
    };
    // The receipt: this aim is OUTSIDE the lattice-centered gate…
    expect(Math.hypot(out.x - lp.x, out.y - lp.y)).toBeGreaterThan(
      GESTURE_TUNING.wallVertexSnapRadius * SIZE
    );
    // …and still snaps, resolving to the lattice vertex.
    const snapped = snapGesturePoint(out, SIZE, o, { wallVertices: vertices });
    expect(sameCorner(snapped, latticeEnd, SIZE, o)).toBe(true);
  });

  it('an off-axis wall vertex in range beats angle magnetism — vertex intent wins', () => {
    // Drag ~5° off vertical from (√3, 1)·size toward the horizontal
    // chain's rendered endpoint near (√3, 2.25)·size: the axis snap
    // would project the endpoint onto the vertical line, but the
    // vertex magnetism is tested on the raw pointer FIRST, so the
    // corner closes instead of the axis winning.
    const existing = [E([0, 1], [0, 2]), E([0, 1], [1, 2])];
    const vertices = sceneVertices(addWalls(fixtureDoc(), existing));
    const origin = pt(ref(1, 0, 2)); // (√3, 1)·size
    const raw = { x: origin.x + 0.1 * SIZE, y: origin.y + 1.2 * SIZE };
    const snapped = snapGesturePoint(raw, SIZE, o, {
      origin,
      wallVertices: vertices,
    });
    expect(sameCorner(snapped, ref(0, 1, 1), SIZE, o)).toBe(true);
  });
});

describe('a drag ending on an existing wall vertex shares it — the corner closes by construction', () => {
  it('snaps B to the chain endpoint and derives the connecting edge', () => {
    const existing = [E([0, 1], [0, 2]), E([0, 1], [1, 2])];
    const doc = addWalls(fixtureDoc(), existing);
    const vertices = sceneVertices(doc);
    const sharedVertex = ref(0, 1, 1); // (√3, 2)·size
    const vp = pt(sharedVertex);
    const b = snapGesturePoint({ x: vp.x + 10, y: vp.y - 6 }, SIZE, o, {
      wallVertices: vertices,
    });
    expect(sameCorner(b, sharedVertex, SIZE, o)).toBe(true);
    const chain = tautPath(ref(1, 0, 2), b, SIZE, o); // from (√3, 1)·size
    expect(keys(deriveWallAdd(doc, chain))).toEqual(keys([E([0, 1], [1, 1])]));
  });
});

describe('shared-corner drag (ruling 4) — every incident chain re-derives to the new vertex', () => {
  const chainA = [E([0, 1], [0, 2]), E([0, 1], [1, 2])];
  const chainB = [E([0, 1], [1, 1]), E([1, 0], [1, 1])];

  it('runVertices finds the shared corner (2 incident runs) and the far endpoints (1 each)', () => {
    // Two REAL seam chains meeting at (√3·2.5, 3.5)·size — long enough
    // that the engine's chain tolerance keeps them two runs (a
    // two-edge elbow reads as one shallow zigzag and merges; a genuine
    // corner between two seams does not).
    const vert = VERT.chain;
    const horiz = [E([2, 3], [3, 2]), E([3, 2], [3, 3]), E([3, 3], [4, 2])];
    const vertices = sceneVertices(addWalls(fixtureDoc(), [...vert, ...horiz]));
    // The shared corner is the SCENE's own break vertex — where the
    // chaining engine judged straightness to end, one edge past the
    // drag boundary here (the elbow's first horizontal edge still fit
    // the vertical run's tolerance). Handles live on what is rendered,
    // so that is the corner the author grabs.
    const shared = vertices.find((v) =>
      sameCorner(v.ref, ref(3, 2, 2), SIZE, o)
    );
    expect(shared?.runs.sort()).toEqual([0, 1]);
    const farV = vertices.find((v) => sameCorner(v.ref, VERT.a, SIZE, o));
    expect(farV?.runs).toHaveLength(1);
    const farH = vertices.find((v) => sameCorner(v.ref, ref(4, 3, 4), SIZE, o));
    expect(farH?.runs).toHaveLength(1);
    expect(farV?.runs[0]).not.toBe(farH?.runs[0]);
  });

  it('dragging the shared vertex re-derives BOTH chains, still sharing the new vertex', () => {
    const doc = addWalls(fixtureDoc(), [...chainA, ...chainB]);
    const newVertex = ref(1, 1, 2); // (√3·1.5, 2.5)·size
    const newA = tautPath(ref(0, 1, 3), newVertex, SIZE, o);
    const newB = tautPath(ref(1, 0, 1), newVertex, SIZE, o);
    expect(keys(newA)).toEqual(
      keys([E([0, 1], [0, 2]), E([0, 1], [1, 2]), E([1, 1], [1, 2])])
    );
    expect(keys(newB)).toEqual(
      keys([E([1, 1], [2, 0]), E([1, 1], [2, 1]), E([1, 1], [2, 2])])
    );
    const committed = applyReshape(doc, [chainA, chainB], [newA, newB]);
    expect(keys(committed.walls).sort()).toEqual(
      keys([...newA, ...newB]).sort()
    );
  });
});

describe('preview identity — the preview IS the commit (one formula, float-exact)', () => {
  it.each([
    ['vertical seam', VERT],
    ['horizontal seam', HORIZ],
    ['free angle', FREE],
  ])('%s: mid-gesture candidate scene === post-commit scene', (_name, row) => {
    const doc = fixtureDoc();
    const chain = tautPath(row.a, row.b, SIZE, o);
    // The board's preview: the shared module on the candidate document.
    const previewScene = boardWallScene(applyWallDraw(doc, chain), SIZE);
    // The commit: the same mutator application on release.
    const committed = applyWallDraw(doc, chain);
    const commitScene = boardWallScene(committed, SIZE);
    expect(previewScene).toEqual(commitScene);
    expect(previewScene).not.toBeNull();
  });
});

describe('erase — shift/right-drag along the same line (ruling 3)', () => {
  it('draw then erase along the same drag returns byte-identical YAML', () => {
    const doc = fixtureDoc();
    const before = emitDungeon(doc);
    const chain = tautPath(VERT.a, VERT.b, SIZE, o);
    const drawn = applyWallDraw(doc, chain);
    expect(emitDungeon(drawn)).not.toBe(before);
    expect(emitDungeon(applyWallErase(drawn, chain))).toBe(before);
  });

  it('never touches door edges', () => {
    const doorEdge = E([2, 1], [3, 1]);
    const doc = toggleDoorEdge(fixtureDoc(), doorEdge);
    const before = emitDungeon(doc);
    const chain = tautPath(VERT.a, VERT.b, SIZE, o);
    const drawn = applyWallDraw(doc, chain);
    const erased = applyWallErase(drawn, chain);
    expect(emitDungeon(erased)).toBe(before);
    expect(erased.doors).toHaveLength(1);
    expect(keys(erased.doors[0].edges)).toEqual(keys([doorEdge]));
    // And the erase derivation itself never lists a door edge.
    expect(keys(deriveWallErase(drawn, chain))).not.toContain(
      edgeKey(doorEdge)
    );
  });
});

describe('door tool inherits the drag — one chain, ONE door', () => {
  it('a door drag’s chain becomes a single door’s edges[]', () => {
    const doc = applyDoorDraw(fixtureDoc(), HORIZ.chain);
    expect(doc.doors).toHaveLength(1);
    expect(keys(doc.doors[0].edges)).toEqual(keys(HORIZ.chain));
    expect(doc.walls).toHaveLength(0);
  });

  it('a door drag over existing walls replaces them — an edge is a wall OR a door', () => {
    const doc = applyDoorDraw(addWalls(fixtureDoc(), HORIZ.chain), HORIZ.chain);
    expect(doc.walls).toHaveLength(0);
    expect(doc.doors).toHaveLength(1);
    expect(keys(doc.doors[0].edges)).toEqual(keys(HORIZ.chain));
  });
});

describe('nearestRunIndex — select the thing you see', () => {
  it('hits the run whose segment the point sits on, within the tuned radius', () => {
    const runs = [
      { a: { x: 0, y: 0 }, b: { x: 10 * SIZE, y: 0 } },
      { a: { x: 0, y: 3 * SIZE }, b: { x: 10 * SIZE, y: 3 * SIZE } },
    ];
    const hit = nearestRunIndex(runs, { x: 5 * SIZE, y: 0.2 * SIZE }, SIZE);
    expect(hit).toBe(0);
    expect(
      nearestRunIndex(runs, { x: 5 * SIZE, y: 1.5 * SIZE }, SIZE)
    ).toBeNull();
    expect(nearestRunIndex(runs, { x: 5 * SIZE, y: 2.9 * SIZE }, SIZE)).toBe(1);
  });
});
