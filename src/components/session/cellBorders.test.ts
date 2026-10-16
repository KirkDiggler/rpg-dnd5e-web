/**
 * cellBorders — the footprint grading (fog of war R9): each footprint cell
 * covers the span of the wall between its corners' projections, the state at
 * any point is the brightest over the cells covering it, and the line splits
 * where that state changes.
 */
import { coordToKey, type CubeCoord } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import { stretchesAlongCells } from './cellBorders';
import { positionToCube } from './positionBridge';

const SQRT3 = Math.sqrt(3);
const cell = (q: number, r: number): CubeCoord =>
  positionToCube({ x: q, y: r });
const key = (c: CubeCoord) => coordToKey(c);

/** A lookup that answers per cell and takes the brightest of several. */
const states =
  (byKey: Record<string, 'seen' | 'remembered'>) =>
  (cells: readonly string[]) => {
    const found = cells.map((k) => byKey[k]);
    if (found.includes('seen')) return 'seen';
    if (found.includes('remembered')) return 'remembered';
    return 'absent';
  };

/** Stretches compared with the boundaries to ten places. */
const expectStretches = (
  actual: readonly { from: number; to: number; state: string }[],
  expected: readonly { from: number; to: number; state: string }[]
) => {
  expect(actual.map((st) => st.state)).toEqual(expected.map((st) => st.state));
  actual.forEach((st, i) => {
    expect(st.from).toBeCloseTo(expected[i]!.from, 10);
    expect(st.to).toBeCloseTo(expected[i]!.to, 10);
  });
};

describe('stretchesAlongCells', () => {
  // Along row 0 at hex size 1: centres at x = SQRT3 * q, so cell q covers
  // t (q ± 0.5) / 4 of this line, its corners reaching half a hex either way.
  const line = { start: { x: 0, z: 0 }, end: { x: SQRT3 * 4, z: 0 } };

  it('splits where the cells covering the line change state', () => {
    const stretches = stretchesAlongCells(
      line,
      [cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0), cell(4, 0)],
      1,
      states({ [key(cell(0, 0))]: 'seen', [key(cell(1, 0))]: 'seen' })
    );
    // q=1 covers up to t 0.375, where q=2 begins.
    expectStretches(stretches, [
      { from: 0, to: 0.375, state: 'seen' },
      { from: 0.375, to: 1, state: 'absent' },
    ]);
  });

  it('a stretch no cell covers is absent, whatever order the cells came in', () => {
    const stretches = stretchesAlongCells(
      line,
      [cell(4, 0), cell(0, 0), cell(2, 0)],
      1,
      states({ [key(cell(4, 0))]: 'remembered' })
    );
    // (4,0) covers t 0.875–1; the gaps either side of (2,0) are covered by
    // nothing and merge with the absent cells into one absent stretch.
    expectStretches(stretches, [
      { from: 0, to: 0.875, state: 'absent' },
      { from: 0.875, to: 1, state: 'remembered' },
    ]);
  });

  it("a cell beside the line covers its corners' span; one wholly past an end covers nothing", () => {
    // (0,1) sits below the line at x = SQRT3/2 and covers t 0–0.25. (-1,0)
    // lies wholly before the start, so its seen state reaches no stretch.
    const stretches = stretchesAlongCells(
      line,
      [cell(-1, 0), cell(0, 0), cell(0, 1), cell(4, 0)],
      1,
      states({ [key(cell(-1, 0))]: 'seen', [key(cell(0, 1))]: 'remembered' })
    );
    expectStretches(stretches, [
      { from: 0, to: 0.25, state: 'remembered' },
      { from: 0.25, to: 1, state: 'absent' },
    ]);
  });

  it('asks about every cell covering a stretch together, so the brighter wins', () => {
    // A vertical wall on the edge between (0,0) and (1,0): both cover it all.
    const edge = {
      start: { x: SQRT3 / 2, z: -0.5 },
      end: { x: SQRT3 / 2, z: 0.5 },
    };
    const asked: string[][] = [];
    const stretches = stretchesAlongCells(
      edge,
      [cell(0, 0), cell(1, 0)],
      1,
      (cells) => {
        asked.push([...cells]);
        return states({
          [key(cell(0, 0))]: 'remembered',
          [key(cell(1, 0))]: 'seen',
        })(cells);
      }
    );
    expect(asked).toEqual([[key(cell(0, 0)), key(cell(1, 0))]]);
    expect(stretches).toEqual([{ from: 0, to: 1, state: 'seen' }]);
  });

  it('cells on staggered rows overlap, so one known row covers the line end to end', () => {
    // A wall between rows 0 and 1: row-0 centres at x = SQRT3 * q, row-1
    // centres half a hex along. Their centres never project to the same t.
    const between = {
      start: { x: 0, z: 0.75 },
      end: { x: SQRT3 * 4, z: 0.75 },
    };
    const row0 = [0, 1, 2, 3, 4].map((q) => cell(q, 0));
    const row1 = [-1, 0, 1, 2, 3].map((q) => cell(q, 1));
    const known = Object.fromEntries(
      row1.map((c) => [key(c), 'seen' as const])
    );
    expect(
      stretchesAlongCells(between, [...row0, ...row1], 1, states(known))
    ).toEqual([{ from: 0, to: 1, state: 'seen' }]);
  });

  it('abutting spans of the same state are one stretch at real, unrounded coordinates', () => {
    // The castle's south wall as the server sent it, in feet, at hex size 1.
    // Row-14 hexes abut corner to corner along it; their projected span ends
    // differ only by rounding, which must not open an uncovered gap.
    const scale = SQRT3 / 5;
    const south = {
      start: { x: -72.5 * scale, z: 59.178402591936646 * scale },
      end: { x: -5.147480714328994 * scale, z: 59.178402591936646 * scale },
    };
    const row14 = Array.from({ length: 15 }, (_, i) => cell(-22 + i, 14));
    const seen = Object.fromEntries(
      row14.map((c) => [key(c), 'seen' as const])
    );
    expect(stretchesAlongCells(south, row14, 1, states(seen))).toEqual([
      { from: 0, to: 1, state: 'seen' },
    ]);
  });

  it('a uniform footprint is one stretch over the whole line; no cells, no stretches', () => {
    expect(
      stretchesAlongCells(line, [cell(0, 0), cell(4, 0)], 1, () => 'seen')
    ).toEqual([{ from: 0, to: 1, state: 'seen' }]);
    expect(stretchesAlongCells(line, [], 1, () => 'seen')).toEqual([]);
  });
});
