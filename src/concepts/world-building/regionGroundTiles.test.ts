import { describe, expect, it } from 'vitest';
import { groundTilesFromRegions } from './regionGroundTiles';

describe('region paint to drawing', () => {
  it('resolves only owned cells with explicit paint taking precedence over the base', () => {
    const tiles = groundTilesFromRegions([
      {
        id: 'court',
        name: 'Courtyard',
        lighting: { intensity: 1 },
        cells: [{ r: 0, q: [[0, 2]] }],
        ground: {
          baseRef: 'grass',
          paint: [{ ref: 'dirt', cells: [{ r: 0, q: [[1, 1]] }] }],
        },
      },
      {
        id: 'gate',
        name: 'Gate',
        lighting: { intensity: 1 },
        cells: [{ r: 1, q: [[0, 0]] }],
      },
    ]);
    expect(tiles.map((tile) => [tile.cell.x, tile.cell.z, tile.ref])).toEqual([
      [0, 0, 'grass'],
      [1, 0, 'dirt'],
      [2, 0, 'grass'],
      [0, 1, undefined],
    ]);
    expect(
      tiles.map((tile) => tile.cell.x + tile.cell.y + tile.cell.z)
    ).toEqual([0, 0, 0, 0]);
  });
});
