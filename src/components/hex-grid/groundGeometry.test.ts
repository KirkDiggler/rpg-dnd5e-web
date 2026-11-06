import { describe, expect, it } from 'vitest';
import { buildGroundGeometry, groupGroundTiles } from './groundGeometry';

const tiles = [
  { cell: { x: 0, y: 0, z: 0 }, ref: 'grass', color: [1, 1, 1] as const },
  {
    cell: { x: 1, y: -1, z: 0 },
    ref: 'grass',
    color: [0.4, 0.4, 0.4] as const,
  },
];

describe('level world-anchored ground batches', () => {
  it('shares UV phase at touching hex edges and never raises any vertex', () => {
    const geometry = buildGroundGeometry(tiles, 1, 6);
    const positions = geometry.getAttribute('position');
    const uvs = geometry.getAttribute('uv');
    const colors = geometry.getAttribute('color');
    const seen = new Map<string, [number, number]>();
    let shared = 0;
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getY(i)).toBe(0);
      expect(uvs.getX(i)).toBeCloseTo(positions.getX(i) / 6);
      expect(uvs.getY(i)).toBeCloseTo(positions.getZ(i) / 6);
      const key = `${positions.getX(i).toFixed(5)},${positions.getZ(i).toFixed(5)}`;
      const old = seen.get(key);
      if (old) {
        shared++;
        expect(uvs.getX(i)).toBeCloseTo(old[0]);
        expect(uvs.getY(i)).toBeCloseTo(old[1]);
      } else seen.set(key, [uvs.getX(i), uvs.getY(i)]);
    }
    expect(shared).toBe(2);
    expect(colors.getX(0)).toBe(1);
    expect(colors.getX(6)).toBeCloseTo(0.4);
    expect(geometry.getIndex()!.count).toBe(24);
    geometry.dispose();
  });

  it('batches appearances instead of creating a draw layer per tile', () => {
    const groups = groupGroundTiles([
      ...tiles,
      { cell: { x: 2, y: -2, z: 0 }, ref: 'dirt' },
    ]);
    expect(groups.map((group) => [group.ref, group.tiles.length])).toEqual([
      ['grass', 2],
      ['dirt', 1],
    ]);
  });

  it('keeps remembered texture-free cells separate and rejects overlapping input', () => {
    const groups = groupGroundTiles([
      tiles[0],
      { ...tiles[1], remembered: true },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1].remembered).toBe(true);
    expect(() =>
      groupGroundTiles([tiles[0], { ...tiles[0], ref: 'dirt' }])
    ).toThrow(/duplicate/i);
    expect(() => buildGroundGeometry(tiles, 1, 0)).toThrow(/repeat/i);
  });
});
