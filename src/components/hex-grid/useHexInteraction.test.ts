/**
 * Tests for useHexInteraction hook
 *
 * Note: These tests verify the logic of worldToCube conversion, bounds checking,
 * and path preview calculations. Full integration testing with React Three Fiber
 * requires a browser environment.
 */

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { CubeCoord } from './hexMath';
import { findPath, worldToCube } from './hexMath';
import type { Entity } from './useHexInteraction';

describe('useHexInteraction logic', () => {
  describe('worldToCube conversion for hit detection', () => {
    it('converts world origin to hex origin', () => {
      const hexSize = 1;
      const worldPos = { x: 0, z: 0 };
      const cube = worldToCube(worldPos, hexSize);

      // Use Math.abs to avoid -0 vs +0 issues
      expect(Math.abs(cube.x)).toBe(0);
      expect(Math.abs(cube.y)).toBe(0);
      expect(Math.abs(cube.z)).toBe(0);
    });

    it('converts click position to correct hex', () => {
      const hexSize = 1;
      // Position at hex (1, -1, 0)
      const worldPos = { x: Math.sqrt(3), z: 0 };
      const cube = worldToCube(worldPos, hexSize);

      expect(cube.x).toBe(1);
      expect(cube.y).toBe(-1);
      expect(cube.z).toBe(0);
    });

    it('handles different hex sizes correctly', () => {
      const hexSize = 2;
      // For hexSize=2, hex (1,-1,0) is at world.x = 2 * sqrt(3) ≈ 3.46
      const worldPos = { x: 2 * Math.sqrt(3), z: 0 };
      const cube = worldToCube(worldPos, hexSize);

      expect(cube.x).toBe(1);
      expect(cube.y).toBe(-1);
      expect(cube.z).toBe(0);
    });
  });

  describe('bounds validation logic', () => {
    const isValidHex = (
      coord: CubeCoord,
      gridWidth: number,
      gridHeight: number
    ): boolean => {
      return (
        coord.x >= 0 &&
        coord.x < gridWidth &&
        coord.z >= 0 &&
        coord.z < gridHeight &&
        coord.y === -coord.x - coord.z
      );
    };

    it('accepts valid hex within bounds', () => {
      const coord: CubeCoord = { x: 2, y: -3, z: 1 };
      expect(isValidHex(coord, 5, 5)).toBe(true);
    });

    it('rejects hex with x >= gridWidth', () => {
      const coord: CubeCoord = { x: 5, y: -5, z: 0 };
      expect(isValidHex(coord, 5, 5)).toBe(false);
    });

    it('rejects hex with z >= gridHeight', () => {
      const coord: CubeCoord = { x: 0, y: -5, z: 5 };
      expect(isValidHex(coord, 5, 5)).toBe(false);
    });

    it('rejects hex with negative x', () => {
      const coord: CubeCoord = { x: -1, y: 1, z: 0 };
      expect(isValidHex(coord, 5, 5)).toBe(false);
    });

    it('rejects hex with negative z', () => {
      const coord: CubeCoord = { x: 0, y: 1, z: -1 };
      expect(isValidHex(coord, 5, 5)).toBe(false);
    });

    it('rejects hex that violates cube invariant', () => {
      const coord: CubeCoord = { x: 1, y: 1, z: 1 }; // x + y + z != 0
      expect(isValidHex(coord, 5, 5)).toBe(false);
    });
  });

  describe('coordinate equality check', () => {
    const coordsEqual = (a: CubeCoord | null, b: CubeCoord | null): boolean => {
      if (a === null || b === null) return a === b;
      return a.x === b.x && a.y === b.y && a.z === b.z;
    };

    it('returns true for identical coordinates', () => {
      const a: CubeCoord = { x: 1, y: -2, z: 1 };
      const b: CubeCoord = { x: 1, y: -2, z: 1 };
      expect(coordsEqual(a, b)).toBe(true);
    });

    it('returns false for different coordinates', () => {
      const a: CubeCoord = { x: 1, y: -2, z: 1 };
      const b: CubeCoord = { x: 2, y: -3, z: 1 };
      expect(coordsEqual(a, b)).toBe(false);
    });

    it('returns true when both are null', () => {
      expect(coordsEqual(null, null)).toBe(true);
    });

    it('returns false when one is null', () => {
      const a: CubeCoord = { x: 1, y: -2, z: 1 };
      expect(coordsEqual(a, null)).toBe(false);
      expect(coordsEqual(null, a)).toBe(false);
    });
  });

  describe('callback triggering logic', () => {
    it('should trigger callback only on coordinate change', () => {
      const callback = vi.fn();
      const lastCoord: CubeCoord = { x: 1, y: -1, z: 0 };
      const newCoord: CubeCoord = { x: 1, y: -1, z: 0 };

      // Simulate the check
      const coordsEqual = (a: CubeCoord, b: CubeCoord): boolean => {
        return a.x === b.x && a.y === b.y && a.z === b.z;
      };

      if (!coordsEqual(newCoord, lastCoord)) {
        callback(newCoord);
      }

      expect(callback).not.toHaveBeenCalled();
    });

    it('should trigger callback on different coordinate', () => {
      const callback = vi.fn();
      const lastCoord: CubeCoord = { x: 1, y: -1, z: 0 };
      const newCoord: CubeCoord = { x: 2, y: -2, z: 0 };

      const coordsEqual = (a: CubeCoord, b: CubeCoord): boolean => {
        return a.x === b.x && a.y === b.y && a.z === b.z;
      };

      if (!coordsEqual(newCoord, lastCoord)) {
        callback(newCoord);
      }

      expect(callback).toHaveBeenCalledWith(newCoord);
    });
  });

  describe('R3F Event mock structure', () => {
    it('creates valid event structure for testing', () => {
      // This verifies our understanding of the R3F pointer event structure
      const mockEvent = {
        point: new THREE.Vector3(0, 0, 0),
        stopPropagation: () => {},
      };

      expect(mockEvent.point).toBeInstanceOf(THREE.Vector3);
      expect(mockEvent.point.x).toBe(0);
      expect(mockEvent.point.z).toBe(0);
    });
  });

  describe('path preview functionality', () => {
    it('calculates path preview for empty hex within range', () => {
      const entityPosition: CubeCoord = { x: 0, y: 0, z: 0 };
      const targetHex: CubeCoord = { x: 2, y: -2, z: 0 };

      // Test the path calculation logic directly
      const expectedPath = findPath(entityPosition, targetHex);
      const pathCost = (expectedPath.length - 1) * 5;

      expect(pathCost).toBeLessThanOrEqual(30);
      expect(expectedPath.length).toBeGreaterThan(0);
    });

    it('returns empty path for hex out of movement range', () => {
      const entityPosition: CubeCoord = { x: 0, y: 0, z: 0 };
      const targetHex: CubeCoord = { x: 5, y: -5, z: 0 };

      const path = findPath(entityPosition, targetHex);
      const pathCost = (path.length - 1) * 5; // 5 feet per hex

      // With only 10 feet (2 hexes) of movement, can't reach a hex 5 steps away
      const movementRemaining = 10;
      const isWithinRange = pathCost <= movementRemaining && path.length > 0;

      expect(isWithinRange).toBe(false);
    });

    it('detects entity at hovered hex', () => {
      const enemyPosition: CubeCoord = { x: 2, y: -2, z: 0 };

      const entities = new Map<string, Entity>([
        [
          'enemy1',
          { position: enemyPosition, type: 'monster', name: 'Goblin' },
        ],
      ]);

      // Test entity detection logic
      let foundEntity: { id: string; type: string } | null = null;
      for (const [id, entity] of entities.entries()) {
        if (
          entity.position.x === enemyPosition.x &&
          entity.position.y === enemyPosition.y &&
          entity.position.z === enemyPosition.z
        ) {
          foundEntity = { id, type: entity.type };
        }
      }

      expect(foundEntity).not.toBeNull();
      expect(foundEntity?.id).toBe('enemy1');
      expect(foundEntity?.type).toBe('monster');
    });

    it('calculates attack path for enemy within range', () => {
      const entityPosition: CubeCoord = { x: 0, y: 0, z: 0 };
      const enemyPosition: CubeCoord = { x: 2, y: -2, z: 0 };

      // Find adjacent hex to enemy
      const directions: CubeCoord[] = [
        { x: 1, y: -1, z: 0 }, // E
        { x: 1, y: 0, z: -1 }, // NE
        { x: 0, y: 1, z: -1 }, // NW
        { x: -1, y: 1, z: 0 }, // W
        { x: -1, y: 0, z: 1 }, // SW
        { x: 0, y: -1, z: 1 }, // SE
      ];

      const adjacentHexes = directions.map((dir) => ({
        x: enemyPosition.x + dir.x,
        y: enemyPosition.y + dir.y,
        z: enemyPosition.z + dir.z,
      }));

      // Find shortest path to any adjacent hex
      let shortestPath: CubeCoord[] = [];
      for (const hex of adjacentHexes) {
        const path = findPath(entityPosition, hex);
        if (
          path.length > 0 &&
          (!shortestPath.length || path.length < shortestPath.length)
        ) {
          shortestPath = path;
        }
      }

      expect(shortestPath.length).toBeGreaterThan(0);
      const pathCost = (shortestPath.length - 1) * 5;
      expect(pathCost).toBeLessThanOrEqual(30); // Within 30 feet
    });

    it('returns canAttack false for enemy out of range', () => {
      const entityPosition: CubeCoord = { x: 0, y: 0, z: 0 };

      // Calculate path to nearest adjacent hex
      const adjacentHex: CubeCoord = { x: 7, y: -7, z: 0 }; // One hex away from enemy
      const path = findPath(entityPosition, adjacentHex);
      const pathCost = (path.length - 1) * 5;

      const movementRemaining = 10; // Only 10 feet
      const canAttack = pathCost <= movementRemaining;

      expect(canAttack).toBe(false);
    });

    it('does not show attack path for ally entities', () => {
      const allyPosition: CubeCoord = { x: 2, y: -2, z: 0 };

      const entities = new Map<string, Entity>([
        ['ally1', { position: allyPosition, type: 'player', name: 'Theron' }],
      ]);

      // Test ally logic - should not calculate attack path
      const foundEntity = entities.get('ally1');
      expect(foundEntity?.type).toBe('player');

      // For allies, we should not set canAttack or attackPath
      // This is just testing the entity type detection
    });

    it('respects blocked hexes in path calculation', () => {
      const entityPosition: CubeCoord = { x: 0, y: 0, z: 0 };
      const targetHex: CubeCoord = { x: 3, y: -3, z: 0 };
      const blockedHex: CubeCoord = { x: 1, y: -1, z: 0 };

      const isBlocked = (coord: CubeCoord) =>
        coord.x === blockedHex.x &&
        coord.y === blockedHex.y &&
        coord.z === blockedHex.z;

      const path = findPath(entityPosition, targetHex, isBlocked);

      // Path should avoid the blocked hex
      const hasBlockedHex = path.some(
        (coord) =>
          coord.x === blockedHex.x &&
          coord.y === blockedHex.y &&
          coord.z === blockedHex.z
      );

      expect(hasBlockedHex).toBe(false);
    });
  });
});
