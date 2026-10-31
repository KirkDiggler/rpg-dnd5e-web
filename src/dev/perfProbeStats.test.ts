import { describe, expect, it } from 'vitest';
import { counterStats } from './perfProbeStats';

describe('counterStats', () => {
  it('reports finite frames and counts the non-finite ones it left out', () => {
    const stats = counterStats([Infinity, NaN, 100, 300]);
    expect(stats).toEqual({ mean: 200, max: 300, nonFinite: 2 });
    // The emitted line stays numeric: no null from JSON.stringify.
    expect(JSON.parse(JSON.stringify(stats))).toEqual(stats);
  });

  it('is zero with every frame counted when all are finite or none exist', () => {
    expect(counterStats([2, 4])).toEqual({ mean: 3, max: 4, nonFinite: 0 });
    expect(counterStats([])).toEqual({ mean: 0, max: 0, nonFinite: 0 });
  });
});
