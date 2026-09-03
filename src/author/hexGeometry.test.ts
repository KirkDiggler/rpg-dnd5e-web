import { cubeToWorld } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import { hexCenter } from '../concepts/session-tomb/atlas';
import {
  DIRECTIONS,
  POSITIONS,
  cellPositions,
  centrePoint,
  directionDegrees,
  latticeKind,
  latticeOf,
  latticePoint,
  latticeWalk,
  lineIsThick,
  positionAt,
  positionCells,
  positionCrossing,
  positionSpellings,
  positionsAlongRay,
  sealedBy,
  wallCrossings,
  wallDirection,
  wallFootprint,
  type Direction,
  type Lattice,
} from './hexGeometry';
import { areAdjacent, type Axial, type Orientation } from './hexOffset';

const at = (o: Orientation, q: number, r: number, offset: [number, number]) =>
  latticeOf(o, { cell: { q, r }, offset });

describe('the lattice places positions where the board already draws them', () => {
  // A PIXEL FORMULA, not a round trip: the same cell placed by three
  // independent modules must land on the same number, or the builder's
  // picker and the board's cells drift (rpg-toolkit#1150's lesson).
  it('puts a pointy-top cell centre exactly where hexCenter and cubeToWorld do', () => {
    for (const [q, r] of [
      [0, 0],
      [3, 2],
      [-2, 5],
      [7, -3],
    ] as const) {
      const mine = centrePoint('pointy', { q, r }, 2);
      const board = hexCenter({ x: q, y: r } as never, 2, 'pointy');
      const world = cubeToWorld({ x: q, y: -q - r, z: r }, 2);
      expect(mine.x).toBeCloseTo(board.x, 12);
      expect(mine.y).toBeCloseTo(board.y, 12);
      expect(mine.x).toBeCloseTo(world.x, 12);
      expect(mine.y).toBeCloseTo(world.z, 12);
    }
  });

  it('puts a flat-top cell centre exactly where hexCenter does', () => {
    for (const [q, r] of [
      [0, 0],
      [3, 2],
      [-2, 5],
    ] as const) {
      const mine = centrePoint('flat', { q, r }, 2);
      const board = hexCenter({ x: q, y: r } as never, 2, 'flat');
      expect(mine.x).toBeCloseTo(board.x, 12);
      expect(mine.y).toBeCloseTo(board.y, 12);
    }
  });

  it('puts each side midpoint half way between the two cells it separates', () => {
    for (const o of ['pointy', 'flat'] as const) {
      for (const offset of POSITIONS[o].slice(1)) {
        const l = latticeOf(o, { cell: { q: 2, r: -1 }, offset });
        const [a, b] = positionCells(o, l);
        const ca = centrePoint(o, a, 1);
        const cb = centrePoint(o, b, 1);
        const mid = latticePoint(o, l, 1);
        expect(mid.x).toBeCloseTo((ca.x + cb.x) / 2, 12);
        expect(mid.y).toBeCloseTo((ca.y + cb.y) / 2, 12);
      }
    }
  });
});

describe('the seven positions are a closed set with one identity each', () => {
  it('classifies a cell as one centre and six side midpoints', () => {
    for (const o of ['pointy', 'flat'] as const) {
      const kinds = cellPositions(o, { q: 4, r: -2 }).map((p) =>
        latticeKind(latticeOf(o, p))
      );
      expect(kinds.filter((k) => k === 'centre')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'side')).toHaveLength(6);
    }
  });

  it('gives a side midpoint two spellings naming adjacent cells, a centre one', () => {
    for (const o of ['pointy', 'flat'] as const) {
      for (const p of cellPositions(o, { q: -3, r: 4 })) {
        const l = latticeOf(o, p);
        const spellings = positionSpellings(o, l);
        // Every spelling names the same lattice point back.
        for (const s of spellings) expect(latticeOf(o, s)).toEqual(l);
        if (latticeKind(l) === 'centre') {
          expect(spellings).toHaveLength(1);
        } else {
          expect(spellings).toHaveLength(2);
          expect(areAdjacent(spellings[0].cell, spellings[1].cell)).toBe(true);
        }
      }
    }
  });

  it('names one canonical spelling, so a corner writes byte-identical ends', () => {
    // The two cells sharing a side name the same position; the emitted
    // form must be one string, not two (F5's corner is exact equality).
    const o: Orientation = 'pointy';
    const fromA = at(o, 0, 0, [0.25, 0.375]);
    const fromB = at(o, 0, 1, [-0.25, -0.375]);
    expect(fromA).toEqual(fromB);
    expect(positionAt(o, fromA)).toEqual(positionAt(o, fromB));
  });

  it('answers a crossing for a side midpoint and none for a centre', () => {
    const o: Orientation = 'pointy';
    const side = positionCrossing(o, at(o, 0, 0, [0.5, 0]));
    expect(side).not.toBeNull();
    expect(areAdjacent(side![0], side![1])).toBe(true);
    expect(positionCrossing(o, at(o, 0, 0, [0, 0]))).toBeNull();
  });
});

describe('the twelve directions', () => {
  it('are 30° apart and cover the circle', () => {
    for (const o of ['pointy', 'flat'] as const) {
      const degrees = DIRECTIONS.map((d) =>
        Math.round(directionDegrees(o, d))
      ).sort((a, b) => a - b);
      expect(degrees).toHaveLength(12);
      for (const [i, deg] of degrees.entries()) {
        expect(deg % 30).toBe(0);
        if (i > 0) expect(deg - degrees[i - 1]).toBe(30);
      }
    }
  });

  it('reads pointy-top east as 0° and south as 90°', () => {
    expect(directionDegrees('pointy', { du: 1, dv: 0 })).toBeCloseTo(0, 9);
    expect(directionDegrees('pointy', { du: 0, dv: 1 })).toBeCloseTo(90, 9);
    expect(directionDegrees('pointy', { du: 3, dv: 1 })).toBeCloseTo(30, 9);
  });
});

describe('thin and thick — what a line costs', () => {
  const o: Orientation = 'pointy';
  const linesFrom = (l: Lattice): { thin: number; thick: number } => {
    // Six LINES through a point, each offered as two opposite rays.
    const seen = new Map<string, boolean>();
    for (const d of DIRECTIONS) {
      const key =
        d.du > 0 || (d.du === 0 && d.dv > 0)
          ? `${d.du},${d.dv}`
          : `${-d.du},${-d.dv}`;
      seen.set(key, lineIsThick(l, d));
    }
    const values = [...seen.values()];
    return {
      thin: values.filter((t) => !t).length,
      thick: values.filter((t) => t).length,
    };
  };

  it('runs four thin lines and two thick ones through every side midpoint', () => {
    // F17 states this for a flat-side midpoint. Every side midpoint is
    // the image of every other under a 60° turn of the grid, which
    // preserves the twelve directions, so the count is the same at all
    // six — including the slanted ones, where the design's prose lists
    // only three of the four thin lines (reported to the team lead).
    for (const offset of POSITIONS[o].slice(1)) {
      expect(linesFrom(latticeOf(o, { cell: { q: 1, r: 2 }, offset }))).toEqual(
        {
          thin: 4,
          thick: 2,
        }
      );
    }
  });

  it('runs twelve thick rays through a centre and no thin one (F15)', () => {
    expect(linesFrom(at(o, 1, 2, [0, 0]))).toEqual({ thin: 0, thick: 6 });
  });

  it('never offers a thin ray a centre as an end (A12: that is a picker defect)', () => {
    for (const offset of POSITIONS[o].slice(1)) {
      const start = latticeOf(o, { cell: { q: 0, r: 0 }, offset });
      for (const d of DIRECTIONS) {
        if (lineIsThick(start, d)) continue;
        for (const end of positionsAlongRay(start, d, 6)) {
          expect(latticeKind(end)).toBe('side');
        }
      }
    }
  });
});

describe('what a wall seals', () => {
  const o: Orientation = 'pointy';

  it('seals nothing along a row midpoint line (thin)', () => {
    // Slanted midpoints of row 0, due east.
    const a = at(o, 0, 0, [0.25, -0.375]);
    const b = at(o, 4, 0, [0.25, -0.375]);
    expect(wallDirection(a, b)).toEqual({ du: 1, dv: 0 } satisfies Direction);
    expect(sealedBy(o, a, b)).toEqual([]);
  });

  it('seals nothing along an across-rows quarter line (thin)', () => {
    const a = at(o, 0, 0, [0.25, -0.375]);
    const b = at(o, 0, 3, [0.25, 0.375]);
    expect(sealedBy(o, a, b)).toEqual([]);
  });

  it('seals every cell of the row a centre line runs down (thick)', () => {
    const a = at(o, 0, 0, [0, 0]);
    const b = at(o, 4, 0, [0, 0]);
    const sealed = sealedBy(o, a, b);
    expect(sealed).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 4, r: 0 },
    ]);
  });

  it('seals one cell per two rows on a flat-side line (thick)', () => {
    // Straight down through a cell centre: centre, flat-side midpoint,
    // centre — one sealed cell every other row (design §4.3's table).
    const a = at(o, 0, 0, [0, 0]);
    const b = at(o, -2, 4, [0, 0]);
    expect(sealedBy(o, a, b)).toEqual([
      { q: 0, r: 0 },
      { q: -1, r: 2 },
      { q: -2, r: 4 },
    ]);
  });
});

describe('what a wall crosses', () => {
  const o: Orientation = 'pointy';

  it('blocks the crossings a quarter line meets, its own ends included', () => {
    // A quarter line down through one cell, from its upper-right side
    // midpoint to its lower-right one. It cuts the step east, and — the
    // rule being about CLOSED segments (C7) — its two ENDS sit exactly
    // on the midpoints of the upper-right and lower-right sides, so
    // those two steps are blocked as well. Closed is what the compiler
    // computes; a client that quietly opened its own wall's ends would
    // draw a door where the server has a wall.
    const a = at(o, 0, 0, [0.25, -0.375]);
    const b = at(o, 0, 0, [0.25, 0.375]);
    const crossings = wallCrossings(o, a, b)
      .map(([p, q]) => `${p.q},${p.r}|${q.q},${q.r}`)
      .sort();
    expect(crossings).toEqual(['0,0|0,1', '0,0|1,0', '1,-1|0,0']);
  });

  it('puts every footprint cell of a thin wall on one of its crossings', () => {
    const a = at(o, 0, 0, [0.25, -0.375]);
    const b = at(o, 3, 0, [0.25, -0.375]);
    const footprint = wallFootprint(o, a, b);
    const touched = new Set(
      wallCrossings(o, a, b).flatMap(([p, q]) => [
        `${p.q},${p.r}`,
        `${q.q},${q.r}`,
      ])
    );
    for (const cell of footprint) {
      expect(touched.has(`${cell.q},${cell.r}`)).toBe(true);
    }
  });

  it('walks a wall whose ends are off the twelve as no wall at all', () => {
    const a = at(o, 0, 0, [0.5, 0]);
    const b: Lattice = { u: a.u + 1, v: a.v + 5 };
    expect(latticeWalk(a, b)).toBeNull();
    expect(wallDirection(a, b)).toBeNull();
  });
});

const _unusedAxial: Axial = { q: 0, r: 0 };
void _unusedAxial;
