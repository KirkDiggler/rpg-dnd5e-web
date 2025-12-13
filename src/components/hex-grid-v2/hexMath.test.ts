import { describe, expect, it } from 'vitest';
import {
  cubeToWorld,
  hexDistance,
  worldToCube,
  type CubeCoord,
} from './hexMath';

describe('hexMath', () => {
  const hexSize = 1.0;

  describe('cubeToWorld', () => {
    it('converts origin hex to world origin', () => {
      const cube: CubeCoord = { x: 0, y: 0, z: 0 };
      const world = cubeToWorld(cube, hexSize);

      expect(world.x).toBeCloseTo(0);
      expect(world.z).toBeCloseTo(0);
    });

    it('converts adjacent hex to correct world position', () => {
      const cube: CubeCoord = { x: 1, y: -1, z: 0 };
      const world = cubeToWorld(cube, hexSize);

      // For pointy-top hex with size 1:
      // world.x = sqrt(3) * (x + z/2) = sqrt(3) * (1 + 0) = sqrt(3)
      // world.z = 1.5 * z = 0
      expect(world.x).toBeCloseTo(Math.sqrt(3));
      expect(world.z).toBeCloseTo(0);
    });

    it('converts hex below origin correctly', () => {
      const cube: CubeCoord = { x: 0, y: -1, z: 1 };
      const world = cubeToWorld(cube, hexSize);

      // world.x = sqrt(3) * (0 + 1/2) = sqrt(3)/2
      // world.z = 1.5 * 1 = 1.5
      expect(world.x).toBeCloseTo(Math.sqrt(3) / 2);
      expect(world.z).toBeCloseTo(1.5);
    });

    it('scales correctly with hexSize', () => {
      const cube: CubeCoord = { x: 1, y: -1, z: 0 };
      const world1 = cubeToWorld(cube, 1.0);
      const world2 = cubeToWorld(cube, 2.0);

      expect(world2.x).toBeCloseTo(world1.x * 2);
      expect(world2.z).toBeCloseTo(world1.z * 2);
    });
  });

  describe('worldToCube', () => {
    it('converts world origin to hex origin', () => {
      const world = { x: 0, z: 0 };
      const cube = worldToCube(world, hexSize);

      // Use Math.abs to avoid -0 vs +0 issues
      expect(Math.abs(cube.x)).toBe(0);
      expect(Math.abs(cube.y)).toBe(0);
      expect(Math.abs(cube.z)).toBe(0);
    });

    it('converts world position back to correct hex', () => {
      const world = { x: Math.sqrt(3), z: 0 };
      const cube = worldToCube(world, hexSize);

      expect(cube.x).toBe(1);
      expect(cube.y).toBe(-1);
      expect(cube.z).toBe(0);
    });

    it('rounds to nearest hex when position is between hexes', () => {
      // Position slightly offset from a hex center should round to nearest
      const world = { x: 0.1, z: 0.1 };
      const cube = worldToCube(world, hexSize);

      // Should round to origin (use Math.abs to avoid -0 vs +0)
      expect(Math.abs(cube.x)).toBe(0);
      expect(Math.abs(cube.y)).toBe(0);
      expect(Math.abs(cube.z)).toBe(0);
    });

    it('maintains cube coordinate invariant (x + y + z = 0)', () => {
      const testPositions = [
        { x: 1.5, z: 2.3 },
        { x: -2.1, z: 4.5 },
        { x: 3.3, z: -1.2 },
      ];

      testPositions.forEach((world) => {
        const cube = worldToCube(world, hexSize);
        expect(cube.x + cube.y + cube.z).toBe(0);
      });
    });
  });

  describe('round-trip conversion', () => {
    it('converts cube -> world -> cube consistently', () => {
      const originalCube: CubeCoord = { x: 2, y: -3, z: 1 };
      const world = cubeToWorld(originalCube, hexSize);
      const resultCube = worldToCube(world, hexSize);

      expect(resultCube.x).toBe(originalCube.x);
      expect(resultCube.y).toBe(originalCube.y);
      expect(resultCube.z).toBe(originalCube.z);
    });

    it('converts multiple hexes round-trip correctly', () => {
      const testCubes: CubeCoord[] = [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
        { x: -1, y: 1, z: 0 },
        { x: 0, y: -2, z: 2 },
        { x: 3, y: -5, z: 2 },
      ];

      testCubes.forEach((original) => {
        const world = cubeToWorld(original, hexSize);
        const result = worldToCube(world, hexSize);

        // Use Math.abs for 0 values to avoid -0 vs +0
        expect(original.x === 0 ? Math.abs(result.x) : result.x).toBe(
          original.x
        );
        expect(original.y === 0 ? Math.abs(result.y) : result.y).toBe(
          original.y
        );
        expect(original.z === 0 ? Math.abs(result.z) : result.z).toBe(
          original.z
        );
      });
    });
  });

  describe('hexDistance', () => {
    it('returns 0 for same hex', () => {
      const hex: CubeCoord = { x: 1, y: -1, z: 0 };
      expect(hexDistance(hex, hex)).toBe(0);
    });

    it('returns 1 for adjacent hexes', () => {
      const center: CubeCoord = { x: 0, y: 0, z: 0 };
      const adjacent: CubeCoord[] = [
        { x: 1, y: -1, z: 0 },
        { x: 1, y: 0, z: -1 },
        { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 },
        { x: -1, y: 0, z: 1 },
        { x: 0, y: -1, z: 1 },
      ];

      adjacent.forEach((hex) => {
        expect(hexDistance(center, hex)).toBe(1);
      });
    });

    it('returns 3 for hexes 3 steps apart', () => {
      const a: CubeCoord = { x: 0, y: 0, z: 0 };
      const b: CubeCoord = { x: 3, y: -3, z: 0 };

      expect(hexDistance(a, b)).toBe(3);
    });

    it('calculates distance correctly in different directions', () => {
      const origin: CubeCoord = { x: 0, y: 0, z: 0 };

      expect(hexDistance(origin, { x: 2, y: -2, z: 0 })).toBe(2);
      expect(hexDistance(origin, { x: 0, y: -3, z: 3 })).toBe(3);
      expect(hexDistance(origin, { x: -1, y: 2, z: -1 })).toBe(2);
    });

    it('is symmetric (distance from a to b equals b to a)', () => {
      const a: CubeCoord = { x: 2, y: -3, z: 1 };
      const b: CubeCoord = { x: -1, y: 0, z: 1 };

      expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    });
  });
});
