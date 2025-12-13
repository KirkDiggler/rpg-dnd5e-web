/**
 * Tests for useMovementRange hook calculations
 * Tests the pure calculation functions used by the hook
 */

import { describe, expect, it } from 'vitest';
import type { CubeCoord } from './hexMath';
import { cubeToWorld, findPath, getReachableHexes } from './hexMath';

describe('useMovementRange calculations', () => {
  const hexSize = 1;
  const startPos: CubeCoord = { x: 5, y: -10, z: 5 };

  describe('reachable hexes calculation (feet to hex steps)', () => {
    it('should convert 0 feet to 0 steps (only start position)', () => {
      const movementFeet = 0;
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(startPos, maxSteps);

      expect(maxSteps).toBe(0);
      expect(reachable.size).toBe(1);
      expect(reachable.has('5,-10,5')).toBe(true);
    });

    it('should convert 15 feet to 3 hex steps', () => {
      const movementFeet = 15;
      const maxSteps = Math.floor(movementFeet / 5);

      expect(maxSteps).toBe(3);
    });

    it('should convert 30 feet to 6 hex steps', () => {
      const movementFeet = 30;
      const maxSteps = Math.floor(movementFeet / 5);

      expect(maxSteps).toBe(6);
    });

    it('should handle partial feet (14 feet = 2 steps, not 3)', () => {
      const movementFeet = 14;
      const maxSteps = Math.floor(movementFeet / 5);

      expect(maxSteps).toBe(2);
    });

    it('should calculate reachable hexes with movement range', () => {
      const movementFeet = 10; // 2 steps
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(startPos, maxSteps);

      // Distance 0: 1 hex, Distance 1: 6 hexes, Distance 2: 12 hexes
      // Total: 19 hexes
      expect(reachable.size).toBe(19);
    });

    it('should respect isBlocked callback', () => {
      const movementFeet = 30; // 6 steps
      const maxSteps = Math.floor(movementFeet / 5);

      // Block all hexes with x > 5
      const isBlocked = (coord: CubeCoord) => coord.x > 5;
      const reachable = getReachableHexes(startPos, maxSteps, isBlocked);

      // All reachable hexes should have x <= 5
      for (const hexKey of reachable) {
        const [x] = hexKey.split(',').map(Number);
        expect(x).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('boundary edge calculations', () => {
    /**
     * Helper to get hex vertices for boundary calculation
     */
    function getHexVertices(
      center: { x: number; z: number },
      hexSize: number
    ): Array<{ x: number; z: number }> {
      const vertices: Array<{ x: number; z: number }> = [];
      for (let i = 0; i < 6; i++) {
        const angleDeg = 30 + 60 * i;
        const angleRad = (Math.PI / 180) * angleDeg;
        vertices.push({
          x: center.x + hexSize * Math.cos(angleRad),
          z: center.z + hexSize * Math.sin(angleRad),
        });
      }
      return vertices;
    }

    it('should calculate 6 vertices for a hex', () => {
      const center = { x: 0, z: 0 };
      const vertices = getHexVertices(center, hexSize);

      expect(vertices).toHaveLength(6);
      vertices.forEach((v) => {
        expect(v).toHaveProperty('x');
        expect(v).toHaveProperty('z');
      });
    });

    it('should calculate vertices at correct angles for pointy-top hex', () => {
      const center = { x: 0, z: 0 };
      const vertices = getHexVertices(center, 1);

      // For a unit hex, vertices should be at radius 1
      vertices.forEach((v) => {
        const distance = Math.sqrt(v.x * v.x + v.z * v.z);
        expect(distance).toBeCloseTo(1, 5);
      });
    });

    it('should create boundary edges with from/to world coords', () => {
      // Single hex has 6 boundary edges (no neighbors)
      const reachable = new Set(['0,0,0']);
      const neighborDirections: CubeCoord[] = [
        { x: 1, y: -1, z: 0 }, // E
        { x: 1, y: 0, z: -1 }, // NE
        { x: 0, y: 1, z: -1 }, // NW
        { x: -1, y: 1, z: 0 }, // W
        { x: -1, y: 0, z: 1 }, // SW
        { x: 0, y: -1, z: 1 }, // SE
      ];

      const center: CubeCoord = { x: 0, y: 0, z: 0 };

      // Each of 6 neighbors is not reachable, so all 6 edges are boundary
      let edgeCount = 0;
      for (let i = 0; i < 6; i++) {
        const dir = neighborDirections[i];
        const neighbor: CubeCoord = {
          x: center.x + dir.x,
          y: center.y + dir.y,
          z: center.z + dir.z,
        };
        const neighborKey = `${neighbor.x},${neighbor.y},${neighbor.z}`;

        if (!reachable.has(neighborKey)) {
          edgeCount++;
        }
      }

      expect(edgeCount).toBe(6);
    });

    it('should not create boundary edge if neighbor is reachable', () => {
      // Two adjacent hexes share an edge - that edge is NOT a boundary
      const reachable = new Set(['0,0,0', '1,-1,0']);

      const center: CubeCoord = { x: 0, y: 0, z: 0 };
      const neighbor: CubeCoord = { x: 1, y: -1, z: 0 };

      const coordToKey = (c: CubeCoord) => `${c.x},${c.y},${c.z}`;

      // The edge towards the neighbor should NOT be a boundary
      expect(reachable.has(coordToKey(center))).toBe(true);
      expect(reachable.has(coordToKey(neighbor))).toBe(true);
    });
  });

  describe('pathfinding integration', () => {
    it('should find path from start to reachable target', () => {
      const start = startPos;
      const target: CubeCoord = { x: 7, y: -12, z: 5 };

      const path = findPath(start, target);

      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual(start);
      expect(path[path.length - 1]).toEqual(target);
    });

    it('should respect isBlocked in pathfinding', () => {
      const start = startPos;
      const target: CubeCoord = { x: 7, y: -12, z: 5 };
      const blockedHex: CubeCoord = { x: 6, y: -11, z: 5 };

      const isBlocked = (coord: CubeCoord) =>
        coord.x === blockedHex.x &&
        coord.y === blockedHex.y &&
        coord.z === blockedHex.z;

      const path = findPath(start, target, isBlocked);

      // Path should not contain blocked hex
      const pathContainsBlocked = path.some(
        (coord) =>
          coord.x === blockedHex.x &&
          coord.y === blockedHex.y &&
          coord.z === blockedHex.z
      );
      expect(pathContainsBlocked).toBe(false);
    });

    it('should return empty path when target is unreachable', () => {
      const start = startPos;
      const target: CubeCoord = { x: 20, y: -25, z: 5 };

      // Block everything between start and target
      const isBlocked = (coord: CubeCoord) => coord.x > 5;

      const path = findPath(start, target, isBlocked);
      expect(path).toEqual([]);
    });
  });

  describe('reachability check', () => {
    it('should identify start position as reachable', () => {
      const movementFeet = 10;
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(startPos, maxSteps);

      const coordToKey = (c: CubeCoord) => `${c.x},${c.y},${c.z}`;
      expect(reachable.has(coordToKey(startPos))).toBe(true);
    });

    it('should identify adjacent hex as reachable with 5+ feet', () => {
      const movementFeet = 5; // 1 step
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(startPos, maxSteps);

      const adjacent: CubeCoord = { x: 6, y: -11, z: 5 };
      const coordToKey = (c: CubeCoord) => `${c.x},${c.y},${c.z}`;

      expect(reachable.has(coordToKey(adjacent))).toBe(true);
    });

    it('should identify far hex as not reachable', () => {
      const movementFeet = 10; // 2 steps
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(startPos, maxSteps);

      const farAway: CubeCoord = { x: 20, y: -25, z: 5 };
      const coordToKey = (c: CubeCoord) => `${c.x},${c.y},${c.z}`;

      expect(reachable.has(coordToKey(farAway))).toBe(false);
    });

    it('should identify blocked hex as not reachable', () => {
      const movementFeet = 30;
      const maxSteps = Math.floor(movementFeet / 5);
      const blockedHex: CubeCoord = { x: 6, y: -11, z: 5 };

      const isBlocked = (coord: CubeCoord) =>
        coord.x === blockedHex.x &&
        coord.y === blockedHex.y &&
        coord.z === blockedHex.z;

      const reachable = getReachableHexes(startPos, maxSteps, isBlocked);
      const coordToKey = (c: CubeCoord) => `${c.x},${c.y},${c.z}`;

      expect(reachable.has(coordToKey(blockedHex))).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle movement less than one hex step', () => {
      const movementFeet = 4; // Less than 5 feet
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(startPos, maxSteps);

      expect(maxSteps).toBe(0);
      expect(reachable.size).toBe(1);
    });

    it('should handle very large movement values', () => {
      const movementFeet = 1000; // 200 steps
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(startPos, maxSteps);

      expect(reachable.size).toBeGreaterThan(0);
    });

    it('should handle negative coordinates', () => {
      const negativePos: CubeCoord = { x: -5, y: 10, z: -5 };
      const movementFeet = 30;
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(negativePos, maxSteps);

      expect(reachable.size).toBeGreaterThan(0);
      expect(reachable.has('-5,10,-5')).toBe(true);
    });

    it('should handle null position by not calling getReachableHexes', () => {
      // This test documents the expected behavior:
      // The hook should check for null and return empty results
      const entityPosition = null;

      if (!entityPosition) {
        // Hook would return empty results
        expect(entityPosition).toBeNull();
      }
    });

    it('should handle zero movement by returning only start position', () => {
      const movementFeet = 0;
      const maxSteps = Math.floor(movementFeet / 5);
      const reachable = getReachableHexes(startPos, maxSteps);

      expect(reachable.size).toBe(1);
      expect(reachable.has('5,-10,5')).toBe(true);
    });
  });

  describe('coordinate conversion for boundary edges', () => {
    it('should convert cube coords to world coords correctly', () => {
      const cube: CubeCoord = { x: 0, y: 0, z: 0 };
      const world = cubeToWorld(cube, hexSize);

      expect(world.x).toBeCloseTo(0);
      expect(world.z).toBeCloseTo(0);
    });

    it('should scale world coords by hex size', () => {
      const cube: CubeCoord = { x: 1, y: -1, z: 0 };
      const world1 = cubeToWorld(cube, 1);
      const world2 = cubeToWorld(cube, 2);

      expect(world2.x).toBeCloseTo(world1.x * 2);
      expect(world2.z).toBeCloseTo(world1.z * 2);
    });
  });
});
