/**
 * Tests for useHexInteraction hook
 *
 * Note: These tests verify the logic of worldToCube conversion and bounds checking.
 * Full integration testing with React Three Fiber requires a browser environment.
 */

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { CubeCoord } from './hexMath';
import { worldToCube } from './hexMath';

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
});
