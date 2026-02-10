import { describe, expect, it } from 'vitest';
import type { CubeCoord } from './hexUtils';
import {
  cubeKey,
  cubeToOffset,
  findHexPath,
  hexDistance,
  offsetToCube,
} from './hexUtils';

describe('cubeToOffset / offsetToCube roundtrip', () => {
  const coords: CubeCoord[] = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: -1, z: 0 },
    { x: 0, y: -1, z: 1 },
    { x: -2, y: 3, z: -1 },
    { x: 3, y: -5, z: 2 },
  ];

  it.each(coords)('roundtrips for (%j)', (coord) => {
    const offset = cubeToOffset(coord);
    const back = offsetToCube(offset);
    // +0 coerces -0 to 0 for clean comparison
    expect(back.x + 0).toBe(coord.x + 0);
    expect(back.y + 0).toBe(coord.y + 0);
    expect(back.z + 0).toBe(coord.z + 0);
  });
});

describe('hexDistance', () => {
  it('same point = 0', () => {
    expect(hexDistance(0, 0, 0, 0, 0, 0)).toBe(0);
  });

  it('adjacent = 1', () => {
    expect(hexDistance(0, 0, 0, 1, -1, 0)).toBe(1);
  });

  it('known distance', () => {
    expect(hexDistance(0, 0, 0, 3, -3, 0)).toBe(3);
    expect(hexDistance(1, -1, 0, -1, 1, 0)).toBe(2);
  });
});

describe('cubeKey', () => {
  it('formats correctly', () => {
    expect(cubeKey({ x: 1, y: -2, z: 1 })).toBe('1,-2,1');
  });
});

describe('findHexPath', () => {
  it('returns target when already adjacent', () => {
    const from: CubeCoord = { x: 0, y: 0, z: 0 };
    const to: CubeCoord = { x: 1, y: -1, z: 0 };
    const path = findHexPath(from, to, new Set());
    expect(path).toEqual([to]);
  });

  it('finds direct path with no obstacles', () => {
    const from: CubeCoord = { x: 0, y: 0, z: 0 };
    const to: CubeCoord = { x: 3, y: -3, z: 0 };
    const path = findHexPath(from, to, new Set());
    expect(path.length).toBe(3);
    expect(path[path.length - 1]).toEqual(to);
  });

  it('navigates around obstacle', () => {
    const from: CubeCoord = { x: 0, y: 0, z: 0 };
    const to: CubeCoord = { x: 2, y: -2, z: 0 };
    // Block the direct middle step
    const occupied = new Set([cubeKey({ x: 1, y: -1, z: 0 })]);
    const path = findHexPath(from, to, occupied);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(to);
    // Verify none of the path steps are occupied
    for (const step of path) {
      expect(occupied.has(cubeKey(step))).toBe(false);
    }
  });

  it('returns partial path when fully blocked', () => {
    const from: CubeCoord = { x: 0, y: 0, z: 0 };
    const to: CubeCoord = { x: 2, y: -2, z: 0 };
    // Block all neighbors of from
    const neighbors = [
      '1,-1,0',
      '1,0,-1',
      '0,1,-1',
      '-1,1,0',
      '-1,0,1',
      '0,-1,1',
    ];
    const occupied = new Set(neighbors);
    const path = findHexPath(from, to, occupied);
    // Should break out with empty or partial path since no neighbor is reachable
    expect(path.length).toBe(0);
  });

  it('returns empty path for same position', () => {
    const pos: CubeCoord = { x: 0, y: 0, z: 0 };
    const path = findHexPath(pos, pos, new Set());
    expect(path).toEqual([]);
  });
});
