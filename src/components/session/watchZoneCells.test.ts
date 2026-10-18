// @vitest-environment node
import { coordToKey } from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import { positionToCube } from './positionBridge';
import { NO_WATCH_ZONE_CELLS, watchZoneCells } from './watchZoneCells';

const key = (c: { x: number; y: number }) => coordToKey(positionToCube(c));

describe('watchZoneCells — the red floor is the zones the server sent (rpg-project#619, R15)', () => {
  it('two zones paint exactly their cells', () => {
    const red = watchZoneCells([
      {
        cells: [
          { x: 2, y: 0 },
          { x: 3, y: 0 },
        ],
      },
      { cells: [{ x: -1, y: 4 }] },
    ]);
    for (const c of [
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: -1, y: 4 },
    ]) {
      expect(red.has(key(c))).toBe(true);
    }
    // Neighbours of zone cells are not red: the client widens nothing.
    for (const c of [
      { x: 1, y: 0 },
      { x: 4, y: 0 },
      { x: -1, y: 3 },
      { x: 0, y: 0 },
    ]) {
      expect(red.has(key(c))).toBe(false);
    }
  });

  it('an empty list paints nothing', () => {
    expect(watchZoneCells([]).has(key({ x: 0, y: 0 }))).toBe(false);
    expect(watchZoneCells([])).toBe(NO_WATCH_ZONE_CELLS);
    // A zone the server sent with no cells paints nothing either.
    expect(watchZoneCells([{ cells: [] }])).toBe(NO_WATCH_ZONE_CELLS);
  });

  it('overlapping zones paint a shared cell once, as one entry', () => {
    const shared = { x: 5, y: -2 };
    const red = watchZoneCells([
      { cells: [shared, { x: 6, y: -2 }] },
      { cells: [{ x: 4, y: -2 }, shared] },
    ]);
    expect([...red].filter((k) => k === key(shared))).toEqual([key(shared)]);
    expect(red.has(key({ x: 6, y: -2 }))).toBe(true);
    expect(red.has(key({ x: 4, y: -2 }))).toBe(true);
  });
});
