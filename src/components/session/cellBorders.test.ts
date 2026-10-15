/**
 * cellBorders — the footprint grading (fog of war R9): each footprint cell is
 * a sample at its centre's projection onto the wall line, and the line splits
 * midway between samples whose state differs.
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

describe('stretchesAlongCells', () => {
  // Along row 0 at hex size 1: centres at x = SQRT3 * q.
  const line = { start: { x: 0, z: 0 }, end: { x: SQRT3 * 4, z: 0 } };

  it('splits midway between the projections of two cells that differ', () => {
    const stretches = stretchesAlongCells(
      line,
      [cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0), cell(4, 0)],
      1,
      states({ [key(cell(0, 0))]: 'seen', [key(cell(1, 0))]: 'seen' })
    );
    // q=1 projects to t 0.25, q=2 to 0.5: the split is at 0.375.
    expect(stretches).toEqual([
      { from: 0, to: 0.375, state: 'seen' },
      { from: 0.375, to: 1, state: 'absent' },
    ]);
  });

  it('orders samples by projection, not by the order the cells came in', () => {
    const stretches = stretchesAlongCells(
      line,
      [cell(4, 0), cell(0, 0), cell(2, 0)],
      1,
      states({ [key(cell(4, 0))]: 'remembered' })
    );
    expect(stretches).toEqual([
      { from: 0, to: 0.75, state: 'absent' },
      { from: 0.75, to: 1, state: 'remembered' },
    ]);
  });

  it('projects a cell beside the line onto it and clamps one past an end', () => {
    // (0,1) sits below the line at x = SQRT3/2: t 0.125. (-1,0) lies before
    // the start and clamps to 0, the same sample as (0,0).
    const stretches = stretchesAlongCells(
      line,
      [cell(-1, 0), cell(0, 0), cell(0, 1), cell(4, 0)],
      1,
      states({ [key(cell(-1, 0))]: 'seen', [key(cell(0, 1))]: 'remembered' })
    );
    expect(stretches).toEqual([
      { from: 0, to: 0.0625, state: 'seen' },
      { from: 0.0625, to: 0.5625, state: 'remembered' },
      { from: 0.5625, to: 1, state: 'absent' },
    ]);
  });

  it('asks about two cells at the same projection together, so the brighter wins', () => {
    // A vertical wall on the edge between (0,0) and (1,0): both centres
    // project to t 0.5.
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

  it('a uniform footprint is one stretch over the whole line; no cells, no stretches', () => {
    expect(
      stretchesAlongCells(line, [cell(0, 0), cell(4, 0)], 1, () => 'seen')
    ).toEqual([{ from: 0, to: 1, state: 'seen' }]);
    expect(stretchesAlongCells(line, [], 1, () => 'seen')).toEqual([]);
  });
});
