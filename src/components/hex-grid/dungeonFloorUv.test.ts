import { describe, expect, it } from 'vitest';
import { dungeonFloorUv } from './dungeonFloorUv';
import { cubeToWorld, hexCorners, type CubeCoord } from './hexMath';

function profileUvsForHex(
  hex: CubeCoord,
  worldUnitsPerRepeat: number,
  hexSize = 1
): Array<readonly [number, number]> {
  const world = cubeToWorld(hex, hexSize);
  return hexCorners(world, hexSize).map((corner) =>
    dungeonFloorUv(corner.x, corner.z, worldUnitsPerRepeat)
  );
}

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
    const b: CubeCoord = { x: 1, y: -1, z: 0 };
    const aUvs = profileUvsForHex(a, 4);
    const bUvs = profileUvsForHex(b, 4);
    const sharedPairs = aUvs.flatMap((uv) =>
      bUvs
        .filter(
          (other) =>
            Math.abs(other[0] - uv[0]) < 1e-12 &&
            Math.abs(other[1] - uv[1]) < 1e-12
        )
        .map((other) => [uv, other] as const)
    );

    expect(sharedPairs).toHaveLength(2);
    for (const [aUv, bUv] of sharedPairs) {
      expect(aUv[0]).toBeCloseTo(bUv[0], 14);
      expect(aUv[1]).toBeCloseTo(bUv[1], 14);
    }
  });
});
