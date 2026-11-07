import { describe, expect, it } from 'vitest';
import { authoredGroundTiles } from './authoredGroundTiles';
import { CRYPT_MEMORY_COLOR } from './sceneKnowledge';

const tiles = [0, 1, 2].map((x) => ({ x, y: -x, z: 0, roomId: 'court' }));
const refs = new Map([
  ['0,0,0', 'grass'],
  ['1,-1,0', 'dirt'],
]);

describe('authored ground lighting and knowledge', () => {
  it('draws only explicitly resolved tiles, with neutral source colors in full light', () => {
    const result = authoredGroundTiles({ tiles, refs, hexSize: 1 });
    expect(result.map((tile) => tile.ref)).toEqual(['grass', 'dirt']);
    expect(result[0].color).toEqual([1, 1, 1]);
    expect(result[1].cell).toEqual({ x: 1, y: -1, z: 0 });
  });
  it('composes exposure, pools, fog and watch zones instead of bypassing them', () => {
    const result = authoredGroundTiles({
      tiles,
      refs,
      hexSize: 1,
      lighting: {
        exposureByCell: new Map([
          ['0,0,0', 0],
          ['1,-1,0', 1],
        ]),
        poolsByCell: new Map(),
        litByCell: new Map([['1,-1,0', 0]]),
        watchZoneCells: new Set(['1,-1,0']),
      },
    });
    expect(result[0].color![0]).toBeLessThan(0.02);
    expect(result[1].color![0]).toBeGreaterThan(result[1].color![1]);
    expect(result[1].color![1]).toBeLessThan(0.5);
    const pooled = authoredGroundTiles({
      tiles,
      refs,
      hexSize: 1,
      lighting: {
        exposureByCell: new Map([['0,0,0', 0]]),
        poolsByCell: new Map([
          ['0,0,0', [{ position: [0, 1, 0], color: '#ff0000', distance: 3 }]],
        ]),
      },
    });
    expect(pooled[0].color![0]).toBeGreaterThan(result[0].color![0]);
  });
  it('keeps the explicit texture-free remembered treatment', () => {
    const result = authoredGroundTiles({
      tiles,
      refs,
      hexSize: 1,
      remembered: new Set(['0,0,0']),
    });
    expect(result[0].remembered).toBe(true);
    expect(result[0].color).toEqual(CRYPT_MEMORY_COLOR.toArray());
    expect(result[1].remembered).toBe(false);
  });
});
