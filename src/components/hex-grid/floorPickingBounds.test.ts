import { describe, expect, it } from 'vitest';
import { floorPickingBounds } from './floorPickingBounds';
import { cubeToWorld, type CubeCoord } from './hexMath';

describe('floorPickingBounds', () => {
  it('covers every tile of a large offset floor beyond the old 200-unit click square', () => {
    const cells: CubeCoord[] = [];
    for (let x = -150; x < 40; x++)
      for (let z = -75; z < 80; z++) cells.push({ x, y: -x - z, z });
    const bounds = floorPickingBounds(cells, 1);
    const [cx, , cz] = bounds.position;
    const [width, depth] = bounds.size;
    expect(width).toBeGreaterThan(200);
    expect(depth).toBeGreaterThan(200);
    for (const cell of cells) {
      const world = cubeToWorld(cell, 1);
      expect(world.x - 1).toBeGreaterThanOrEqual(cx - width / 2 - 1e-9);
      expect(world.x + 1).toBeLessThanOrEqual(cx + width / 2 + 1e-9);
      expect(world.z - 1).toBeGreaterThanOrEqual(cz - depth / 2 - 1e-9);
      expect(world.z + 1).toBeLessThanOrEqual(cz + depth / 2 + 1e-9);
    }
  });

  it('centers a small distant map and includes the full tile at its edges', () => {
    const cell = { x: 400, y: -700, z: 300 };
    const world = cubeToWorld(cell, 2);
    expect(floorPickingBounds([cell], 2)).toEqual({
      position: [world.x, 0, world.z],
      size: [4, 4],
    });
  });

  it('expands when newly discovered floor extends the map', () => {
    const start = { x: 0, y: 0, z: 0 };
    const far = { x: -200, y: 200, z: 0 };
    expect(floorPickingBounds([start, far], 1).size[0]).toBeGreaterThan(
      floorPickingBounds([start], 1).size[0]
    );
  });

  it('keeps the empty loading state finite', () => {
    expect(floorPickingBounds([], 1)).toEqual({
      position: [0, 0, 0],
      size: [2, 2],
    });
  });
});
