/**
 * Hex grid math utilities for hex-grid-v2
 * Uses cube coordinates as the single source of truth
 *
 * Cube coordinates: x, y, z where x + y + z = 0
 * World coordinates: x, z for Three.js flat plane (y is up)
 */

// Cube coordinate - the canonical hex address format
export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

// World position for Three.js rendering on a flat (y=0) plane
export interface WorldPos {
  x: number;
  z: number;
}

// Hex constants for pointy-top hexagons
const SQRT_3 = Math.sqrt(3);

/**
 * Convert cube coordinates to world position for rendering
 *
 * For pointy-top hexagons with size (radius) r:
 * - Width (flat to flat) = sqrt(3) * r
 * - Height (point to point) = 2 * r
 *
 * In cube coords, we use x and z as the primary axes:
 * - x increases to the right
 * - z increases downward
 * - y = -x - z (derived)
 *
 * @param cube - The hex coordinate in cube space
 * @param hexSize - The hex radius (distance from center to vertex)
 * @returns World position for Three.js rendering
 */
export function cubeToWorld(cube: CubeCoord, hexSize: number): WorldPos {
  // For pointy-top hexes, the world position is:
  // world.x = hexSize * sqrt(3) * (x + z/2)
  // world.z = hexSize * 3/2 * z
  const worldX = hexSize * SQRT_3 * (cube.x + cube.z / 2);
  const worldZ = hexSize * (3 / 2) * cube.z;

  return { x: worldX, z: worldZ };
}

/**
 * Convert world position to cube coordinates using axial rounding
 *
 * This handles clicks/raycasts and converts them back to hex addresses.
 * Uses the standard axial rounding algorithm to find the nearest hex.
 *
 * @param world - The world position from a raycast or click
 * @param hexSize - The hex radius (distance from center to vertex)
 * @returns The nearest hex in cube coordinates
 */
export function worldToCube(world: WorldPos, hexSize: number): CubeCoord {
  // Convert world position to fractional axial coordinates
  // This is the inverse of cubeToWorld
  const q = ((SQRT_3 / 3) * world.x - (1 / 3) * world.z) / hexSize;
  const r = ((2 / 3) * world.z) / hexSize;

  // Convert axial (q, r) to cube (x, y, z) for rounding
  const x = q;
  const z = r;
  const y = -x - z;

  // Round to nearest integer cube coordinate
  return cubeRound({ x, y, z });
}

/**
 * Round fractional cube coordinates to the nearest valid hex
 *
 * Since cube coords must satisfy x + y + z = 0, we can't just round each
 * component independently. We round all three, then adjust the component
 * with the largest rounding error to restore the invariant.
 *
 * @param cube - Fractional cube coordinates
 * @returns The nearest integer cube coordinate
 */
function cubeRound(cube: CubeCoord): CubeCoord {
  // Round each component
  let rx = Math.round(cube.x);
  let ry = Math.round(cube.y);
  let rz = Math.round(cube.z);

  // Calculate rounding errors
  const xDiff = Math.abs(rx - cube.x);
  const yDiff = Math.abs(ry - cube.y);
  const zDiff = Math.abs(rz - cube.z);

  // Fix the component with the largest error to restore x + y + z = 0
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}

/**
 * Calculate Manhattan distance between two hexes in cube coordinates
 *
 * In cube space, the distance is max(|dx|, |dy|, |dz|) which equals
 * (|dx| + |dy| + |dz|) / 2 due to the x + y + z = 0 constraint.
 *
 * @param a - First hex coordinate
 * @param b - Second hex coordinate
 * @returns The number of hex steps between a and b
 */
export function hexDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.z - b.z)
  );
}

/**
 * Get the 6 adjacent hexes to a given hex
 *
 * In cube coordinates, the 6 neighbors are found by adding the 6 direction vectors:
 * - (+1, -1, 0), (+1, 0, -1), (0, +1, -1), (-1, +1, 0), (-1, 0, +1), (0, -1, +1)
 *
 * @param coord - The center hex coordinate
 * @returns Array of 6 adjacent hex coordinates
 */
export function getHexNeighbors(coord: CubeCoord): CubeCoord[] {
  const directions: CubeCoord[] = [
    { x: 1, y: -1, z: 0 }, // E
    { x: 1, y: 0, z: -1 }, // NE
    { x: 0, y: 1, z: -1 }, // NW
    { x: -1, y: 1, z: 0 }, // W
    { x: -1, y: 0, z: 1 }, // SW
    { x: 0, y: -1, z: 1 }, // SE
  ];

  return directions.map((dir) => ({
    x: coord.x + dir.x,
    y: coord.y + dir.y,
    z: coord.z + dir.z,
  }));
}

/**
 * Convert a cube coordinate to a string key for Set/Map storage
 *
 * @param coord - The cube coordinate
 * @returns String key in format "x,y,z"
 */
function coordToKey(coord: CubeCoord): string {
  return `${coord.x},${coord.y},${coord.z}`;
}

/**
 * Find the shortest path between two hexes using A* pathfinding
 *
 * Uses hexDistance as the heuristic. Returns the complete path including
 * both start and end hexes. Returns empty array if no path exists.
 *
 * @param start - Starting hex coordinate
 * @param end - Destination hex coordinate
 * @param isBlocked - Optional callback to check if a hex is impassable
 * @returns Array of coordinates from start to end (inclusive), or empty array if no path
 */
export function findPath(
  start: CubeCoord,
  end: CubeCoord,
  isBlocked?: (coord: CubeCoord) => boolean
): CubeCoord[] {
  // Handle edge cases
  if (isBlocked?.(start) || isBlocked?.(end)) {
    return []; // Can't path to/from blocked hexes
  }

  if (hexDistance(start, end) === 0) {
    return [start]; // Already at destination
  }

  // A* data structures
  const openSet = new Set<string>([coordToKey(start)]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[coordToKey(start), 0]]);
  const fScore = new Map<string, number>([
    [coordToKey(start), hexDistance(start, end)],
  ]);

  while (openSet.size > 0) {
    // Find node in openSet with lowest fScore
    let current: string | null = null;
    let lowestF = Infinity;
    for (const key of openSet) {
      const f = fScore.get(key) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = key;
      }
    }

    if (!current) break;

    // Parse current coordinate
    const [cx, cy, cz] = current.split(',').map(Number);
    const currentCoord: CubeCoord = { x: cx, y: cy, z: cz };

    // Check if we reached the goal
    if (hexDistance(currentCoord, end) === 0) {
      // Reconstruct path
      const path: CubeCoord[] = [currentCoord];
      let pathKey = current;
      while (cameFrom.has(pathKey)) {
        pathKey = cameFrom.get(pathKey)!;
        const [px, py, pz] = pathKey.split(',').map(Number);
        path.unshift({ x: px, y: py, z: pz });
      }
      return path;
    }

    openSet.delete(current);

    // Check all neighbors
    const neighbors = getHexNeighbors(currentCoord);
    for (const neighbor of neighbors) {
      if (isBlocked?.(neighbor)) continue;

      const neighborKey = coordToKey(neighbor);
      const tentativeGScore = (gScore.get(current) ?? Infinity) + 1;

      if (tentativeGScore < (gScore.get(neighborKey) ?? Infinity)) {
        // This path to neighbor is better than any previous one
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeGScore);
        fScore.set(neighborKey, tentativeGScore + hexDistance(neighbor, end));
        openSet.add(neighborKey);
      }
    }
  }

  // No path found
  return [];
}

/**
 * Get all hexes reachable within a maximum distance
 *
 * Uses breadth-first search to find all hexes within maxDistance steps,
 * respecting blocked hexes. Returns a Set of coordinate keys for O(1) lookup.
 *
 * @param start - Starting hex coordinate
 * @param maxDistance - Maximum number of steps from start
 * @param isBlocked - Optional callback to check if a hex is impassable
 * @returns Set of coordinate keys ("x,y,z") for all reachable hexes
 */
export function getReachableHexes(
  start: CubeCoord,
  maxDistance: number,
  isBlocked?: (coord: CubeCoord) => boolean
): Set<string> {
  if (maxDistance < 0) return new Set();
  if (isBlocked?.(start)) return new Set();

  const reachable = new Set<string>([coordToKey(start)]);
  const visited = new Set<string>([coordToKey(start)]);
  const queue: Array<{ coord: CubeCoord; distance: number }> = [
    { coord: start, distance: 0 },
  ];

  while (queue.length > 0) {
    const { coord, distance } = queue.shift()!;

    if (distance >= maxDistance) continue;

    const neighbors = getHexNeighbors(coord);
    for (const neighbor of neighbors) {
      const neighborKey = coordToKey(neighbor);

      if (visited.has(neighborKey)) continue;
      visited.add(neighborKey);

      if (isBlocked?.(neighbor)) continue;

      reachable.add(neighborKey);
      queue.push({ coord: neighbor, distance: distance + 1 });
    }
  }

  return reachable;
}
