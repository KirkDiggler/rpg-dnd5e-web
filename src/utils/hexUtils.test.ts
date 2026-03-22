import { describe, expect, it } from 'vitest';
import { cubeKey, findHexPath } from './hexUtils';

describe('findHexPath', () => {
  function makeWalkable(
    coords: Array<{ x: number; y: number; z: number }>
  ): Set<string> {
    return new Set(coords.map((c) => cubeKey(c)));
  }

  it('finds path between adjacent walkable hexes', () => {
    const walkable = makeWalkable([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
    ]);
    const path = findHexPath(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
      new Set(),
      walkable
    );
    expect(path).toHaveLength(1);
    expect(path[0]).toEqual({ x: 1, y: -1, z: 0 });
  });

  it('rejects path through non-walkable hex', () => {
    const walkable = makeWalkable([
      { x: 0, y: 0, z: 0 },
      { x: 2, y: -2, z: 0 },
    ]);
    const path = findHexPath(
      { x: 0, y: 0, z: 0 },
      { x: 2, y: -2, z: 0 },
      new Set(),
      walkable
    );
    expect(path).toHaveLength(0);
  });

  it('works without walkable param (backward compat)', () => {
    const path = findHexPath(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
      new Set()
    );
    expect(path).toHaveLength(1);
  });

  it('finds path across room boundary when both rooms are walkable', () => {
    const walkable = makeWalkable([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: 2, y: -2, z: 0 },
      { x: 3, y: -3, z: 0 },
      { x: 4, y: -4, z: 0 },
    ]);
    const path = findHexPath(
      { x: 0, y: 0, z: 0 },
      { x: 4, y: -4, z: 0 },
      new Set(),
      walkable
    );
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 4, y: -4, z: 0 });
  });
});
