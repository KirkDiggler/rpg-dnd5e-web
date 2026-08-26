import { describe, expect, it } from 'vitest';
import { dungeonFloorUv } from './dungeonFloorUv';
import { cubeToWorld, hexCorners, type CubeCoord } from './hexMath';

describe('dungeonFloorUv', () => {
  it('uses absolute world coordinates divided by the repeat distance', () => {
    expect(dungeonFloorUv(4, -2, 4)).toEqual([1, -0.5]);
  });

  it('rejects a non-finite or non-positive repeat distance', () => {
    expect(() => dungeonFloorUv(0, 0, 0)).toThrow(/positive/);
    expect(() => dungeonFloorUv(0, 0, -1)).toThrow(/positive/);
    expect(() => dungeonFloorUv(0, 0, Number.NaN)).toThrow(/positive/);
    expect(() => dungeonFloorUv(0, 0, Number.POSITIVE_INFINITY)).toThrow(
      /positive/
    );
  });

  it('keeps negative world coordinates finite', () => {
    const uv = dungeonFloorUv(-12.5, -7.25, 4);
    expect(uv.every(Number.isFinite)).toBe(true);
    expect(uv).toEqual([-3.125, -1.8125]);
  });

  it('gives named adjacent pointy hexes exact UVs at their shared vertices', () => {
    const a: CubeCoord = { x: 0, y: 0, z: 0 };
    const b: CubeCoord = { x: 0, y: -1, z: 1 };
    const repeat = 4;
    const aCorners = hexCorners(cubeToWorld(a, 1), 1);
    const bCorners = hexCorners(cubeToWorld(b, 1), 1);
    const sharedWorldVertices = aCorners.filter((corner) =>
      bCorners.some(
        (other) =>
          Math.abs(other.x - corner.x) < 1e-12 &&
          Math.abs(other.z - corner.z) < 1e-12
      )
    );

    expect(sharedWorldVertices).toHaveLength(2);
    for (const [expectedX, expectedZ] of [
      [0, 1],
      [Math.sqrt(3) / 2, 0.5],
    ]) {
      const vertex = sharedWorldVertices.find(
        (candidate) =>
          Math.abs(candidate.x - expectedX) < 1e-12 &&
          Math.abs(candidate.z - expectedZ) < 1e-12
      );
      expect(vertex).toBeDefined();
      if (!vertex) continue;
      expect(dungeonFloorUv(vertex.x, vertex.z, repeat)).toEqual([
        vertex.x / repeat,
        vertex.z / repeat,
      ]);
    }
  });
});
