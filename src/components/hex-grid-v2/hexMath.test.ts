import { describe, expect, it } from 'vitest';
import {
  cubeToWorld,
  findPath,
  getHexNeighbors,
  getReachableHexes,
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

  describe('getHexNeighbors', () => {
    it('returns 6 neighbors for origin hex', () => {
      const center: CubeCoord = { x: 0, y: 0, z: 0 };
      const neighbors = getHexNeighbors(center);

      expect(neighbors).toHaveLength(6);
    });

    it('returns all valid cube coordinates (x + y + z = 0)', () => {
      const center: CubeCoord = { x: 0, y: 0, z: 0 };
      const neighbors = getHexNeighbors(center);

      neighbors.forEach((neighbor) => {
        expect(neighbor.x + neighbor.y + neighbor.z).toBe(0);
      });
    });

    it('returns all neighbors at distance 1', () => {
      const center: CubeCoord = { x: 0, y: 0, z: 0 };
      const neighbors = getHexNeighbors(center);

      neighbors.forEach((neighbor) => {
        expect(hexDistance(center, neighbor)).toBe(1);
      });
    });

    it('returns correct neighbors for non-origin hex', () => {
      const center: CubeCoord = { x: 2, y: -3, z: 1 };
      const neighbors = getHexNeighbors(center);

      expect(neighbors).toHaveLength(6);
      neighbors.forEach((neighbor) => {
        expect(hexDistance(center, neighbor)).toBe(1);
        expect(neighbor.x + neighbor.y + neighbor.z).toBe(0);
      });
    });

    it('returns expected neighbors in all 6 directions', () => {
      const center: CubeCoord = { x: 0, y: 0, z: 0 };
      const neighbors = getHexNeighbors(center);

      const expected: CubeCoord[] = [
        { x: 1, y: -1, z: 0 }, // E
        { x: 1, y: 0, z: -1 }, // NE
        { x: 0, y: 1, z: -1 }, // NW
        { x: -1, y: 1, z: 0 }, // W
        { x: -1, y: 0, z: 1 }, // SW
        { x: 0, y: -1, z: 1 }, // SE
      ];

      expected.forEach((exp) => {
        const found = neighbors.find(
          (n) => n.x === exp.x && n.y === exp.y && n.z === exp.z
        );
        expect(found).toBeDefined();
      });
    });
  });

  describe('findPath', () => {
    it('returns path with single hex when start equals end', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 0, y: 0, z: 0 };
      const path = findPath(start, end);

      expect(path).toHaveLength(1);
      expect(path[0]).toEqual(start);
    });

    it('finds direct path between adjacent hexes', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 1, y: -1, z: 0 };
      const path = findPath(start, end);

      expect(path).toHaveLength(2);
      expect(path[0]).toEqual(start);
      expect(path[1]).toEqual(end);
    });

    it('finds straight path over multiple hexes', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 3, y: -3, z: 0 };
      const path = findPath(start, end);

      expect(path).toHaveLength(4);
      expect(path[0]).toEqual(start);
      expect(path[3]).toEqual(end);

      // Verify path is continuous
      for (let i = 0; i < path.length - 1; i++) {
        expect(hexDistance(path[i], path[i + 1])).toBe(1);
      }
    });

    it('finds diagonal path', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 2, y: -3, z: 1 };
      const path = findPath(start, end);

      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);

      // Verify path is continuous
      for (let i = 0; i < path.length - 1; i++) {
        expect(hexDistance(path[i], path[i + 1])).toBe(1);
      }
    });

    it('returns empty array when start is blocked', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 2, y: -2, z: 0 };
      const isBlocked = (coord: CubeCoord) => coord.x === 0 && coord.z === 0;

      const path = findPath(start, end, isBlocked);
      expect(path).toEqual([]);
    });

    it('returns empty array when end is blocked', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 2, y: -2, z: 0 };
      const isBlocked = (coord: CubeCoord) => coord.x === 2 && coord.z === 0;

      const path = findPath(start, end, isBlocked);
      expect(path).toEqual([]);
    });

    it('finds path around single blocked hex', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 2, y: -2, z: 0 };
      const blocked: CubeCoord = { x: 1, y: -1, z: 0 }; // Direct path

      const isBlocked = (coord: CubeCoord) =>
        coord.x === blocked.x && coord.y === blocked.y && coord.z === blocked.z;

      const path = findPath(start, end, isBlocked);

      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);
      expect(path.length).toBeGreaterThan(3); // Longer than direct path

      // Verify path doesn't go through blocked hex
      const hasBlocked = path.some(
        (coord) =>
          coord.x === blocked.x &&
          coord.y === blocked.y &&
          coord.z === blocked.z
      );
      expect(hasBlocked).toBe(false);
    });

    it('finds path around wall of blocked hexes', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 3, y: -3, z: 0 };

      // Create a wall: x=1, z=[-1, 0, 1]
      const wall: CubeCoord[] = [
        { x: 1, y: 0, z: -1 },
        { x: 1, y: -1, z: 0 },
        { x: 1, y: -2, z: 1 },
      ];

      const isBlocked = (coord: CubeCoord) =>
        wall.some((w) => w.x === coord.x && w.y === coord.y && w.z === coord.z);

      const path = findPath(start, end, isBlocked);

      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(end);

      // Verify path doesn't go through wall
      path.forEach((coord) => {
        expect(isBlocked(coord)).toBe(false);
      });
    });

    it('returns empty array when no path exists', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 2, y: -2, z: 0 };

      // Create a complete wall blocking access to end
      const isBlocked = (coord: CubeCoord) => {
        // Block all hexes at x=1 (vertical wall)
        return coord.x === 1;
      };

      const path = findPath(start, end, isBlocked);
      expect(path).toEqual([]);
    });

    it('finds optimal path (shortest)', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const end: CubeCoord = { x: 3, y: -3, z: 0 };
      const path = findPath(start, end);

      // Direct path should be distance + 1 (includes start and end)
      const expectedLength = hexDistance(start, end) + 1;
      expect(path).toHaveLength(expectedLength);
    });
  });

  describe('getReachableHexes', () => {
    it('returns only start hex when maxDistance is 0', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const reachable = getReachableHexes(start, 0);

      expect(reachable.size).toBe(1);
      expect(reachable.has('0,0,0')).toBe(true);
    });

    it('returns empty set when maxDistance is negative', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const reachable = getReachableHexes(start, -1);

      expect(reachable.size).toBe(0);
    });

    it('returns empty set when start is blocked', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const isBlocked = (coord: CubeCoord) => coord.x === 0 && coord.z === 0;
      const reachable = getReachableHexes(start, 5, isBlocked);

      expect(reachable.size).toBe(0);
    });

    it('returns 7 hexes (start + 6 neighbors) for maxDistance 1', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const reachable = getReachableHexes(start, 1);

      // 1 center + 6 neighbors
      expect(reachable.size).toBe(7);
      expect(reachable.has('0,0,0')).toBe(true);
    });

    it('returns 19 hexes for maxDistance 2 from origin', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const reachable = getReachableHexes(start, 2);

      // Hex ring formula: 1 + 6 + 12 = 19 for distance 2
      expect(reachable.size).toBe(19);
    });

    it('returns correct hex count for maxDistance 3', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const reachable = getReachableHexes(start, 3);

      // Hex ring formula: 1 + 6 + 12 + 18 = 37 for distance 3
      expect(reachable.size).toBe(37);
    });

    it('all reachable hexes are within maxDistance', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const maxDistance = 3;
      const reachable = getReachableHexes(start, maxDistance);

      reachable.forEach((key) => {
        const [x, y, z] = key.split(',').map(Number);
        const coord: CubeCoord = { x, y, z };
        expect(hexDistance(start, coord)).toBeLessThanOrEqual(maxDistance);
      });
    });

    it('respects blocked hexes', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const blocked: CubeCoord = { x: 1, y: -1, z: 0 };

      const isBlocked = (coord: CubeCoord) =>
        coord.x === blocked.x && coord.y === blocked.y && coord.z === blocked.z;

      const reachable = getReachableHexes(start, 2, isBlocked);

      // Should not contain the blocked hex
      expect(reachable.has('1,-1,0')).toBe(false);

      // Should contain other neighbors
      expect(reachable.has('0,0,0')).toBe(true); // start
      expect(reachable.has('0,1,-1')).toBe(true); // neighbor
    });

    it('blocks propagation beyond blocked hex', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const blocked: CubeCoord = { x: 1, y: -1, z: 0 };

      const isBlocked = (coord: CubeCoord) =>
        coord.x === blocked.x && coord.y === blocked.y && coord.z === blocked.z;

      const reachable = getReachableHexes(start, 2, isBlocked);

      // Should not reach hex beyond the blocked one in that direction
      // The hex at (2, -2, 0) should still be reachable via other paths
      expect(reachable.has('2,-2,0')).toBe(true);

      // But should have fewer total hexes than without blocking
      const unblocked = getReachableHexes(start, 2);
      expect(reachable.size).toBeLessThan(unblocked.size);
    });

    it('handles wall blocking access to region', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };

      // Create a vertical wall at x=1
      const isBlocked = (coord: CubeCoord) => coord.x === 1;

      const reachable = getReachableHexes(start, 3, isBlocked);

      // Should not reach any hex with x >= 1
      reachable.forEach((key) => {
        const [x] = key.split(',').map(Number);
        expect(x).toBeLessThan(1);
      });

      // Should still reach hexes on our side of wall
      expect(reachable.has('0,0,0')).toBe(true);
      expect(reachable.has('-1,1,0')).toBe(true);
    });

    it('returns coordinate keys in correct format', () => {
      const start: CubeCoord = { x: 0, y: 0, z: 0 };
      const reachable = getReachableHexes(start, 1);

      reachable.forEach((key) => {
        // Should be "x,y,z" format
        expect(key).toMatch(/^-?\d+,-?\d+,-?\d+$/);

        // Should parse back to valid cube coord
        const [x, y, z] = key.split(',').map(Number);
        expect(x + y + z).toBe(0);
      });
    });

    it('works from non-origin start position', () => {
      const start: CubeCoord = { x: 5, y: -7, z: 2 };
      const reachable = getReachableHexes(start, 2);

      expect(reachable.size).toBe(19); // Same as from origin
      expect(reachable.has('5,-7,2')).toBe(true); // Contains start

      // All hexes should be within distance 2 of start
      reachable.forEach((key) => {
        const [x, y, z] = key.split(',').map(Number);
        const coord: CubeCoord = { x, y, z };
        expect(hexDistance(start, coord)).toBeLessThanOrEqual(2);
      });
    });
  });
});
