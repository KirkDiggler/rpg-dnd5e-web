// Hex grid utility functions for pathfinding and distance calculations
// Uses cube coordinates (x, y, z where x + y + z = 0)

// Cube coordinate type for clarity
export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

// Offset coordinate type (for grid cell iteration and pixel conversion)
export interface OffsetCoord {
  col: number;
  row: number;
}

// Convert cube coordinates to offset coordinates (pointy-top, odd-r)
// odd-r: odd rows are shifted right
export function cubeToOffset(cube: CubeCoord): OffsetCoord {
  const col = cube.x + (cube.z - (cube.z & 1)) / 2;
  const row = cube.z;
  return { col, row };
}

// Convert offset coordinates to cube coordinates (pointy-top, odd-r)
// odd-r: odd rows are shifted right
export function offsetToCube(offset: OffsetCoord): CubeCoord {
  const x = offset.col - (offset.row - (offset.row & 1)) / 2;
  const z = offset.row;
  const y = -x - z;
  return { x, y, z };
}

// Calculate hex distance using cube coordinates directly
// Server provides cube coordinates, so no conversion needed
export function hexDistance(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number
): number {
  // In cube coordinates, distance is the max of absolute differences
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

// Get 6 adjacent hexes using cube coordinates
// In cube coords, neighbors are simple: add direction vectors that sum to 0
function getHexNeighbors(coord: CubeCoord): CubeCoord[] {
  // Six directions in cube coordinates (each sums to 0)
  const directions: CubeCoord[] = [
    { x: 1, y: -1, z: 0 }, // East
    { x: 1, y: 0, z: -1 }, // Southeast
    { x: 0, y: 1, z: -1 }, // Southwest
    { x: -1, y: 1, z: 0 }, // West
    { x: -1, y: 0, z: 1 }, // Northwest
    { x: 0, y: -1, z: 1 }, // Northeast
  ];

  return directions.map((dir) => ({
    x: coord.x + dir.x,
    y: coord.y + dir.y,
    z: coord.z + dir.z,
  }));
}

// Helper to create a string key from cube coordinates for Set lookups
export function cubeKey(coord: CubeCoord): string {
  return `${coord.x},${coord.y},${coord.z}`;
}

// Find a path between two hexes using a greedy pathfinding approach.
// Note: This method does not guarantee the shortest (optimal) path, especially when obstacles are present.
// Uses cube coordinates (x, y, z where x + y + z = 0)
export function findHexPath(
  from: CubeCoord,
  to: CubeCoord,
  occupiedPositions: Set<string>
): CubeCoord[] {
  // If already adjacent or same, return direct path
  const dist = hexDistance(from.x, from.y, from.z, to.x, to.y, to.z);
  if (dist <= 1) return [to];

  // Simple straight-line pathing (greedy approach)
  const path: CubeCoord[] = [];
  let current: CubeCoord = { ...from };

  while (hexDistance(current.x, current.y, current.z, to.x, to.y, to.z) > 0) {
    // Get all 6 neighbors
    const neighbors = getHexNeighbors(current);

    // Find neighbor closest to target that isn't occupied
    let best: CubeCoord | null = null;
    let bestDist = Infinity;

    for (const neighbor of neighbors) {
      const key = cubeKey(neighbor);
      if (occupiedPositions.has(key)) continue; // Skip occupied cells

      const dist = hexDistance(
        neighbor.x,
        neighbor.y,
        neighbor.z,
        to.x,
        to.y,
        to.z
      );
      if (best === null || dist < bestDist) {
        best = neighbor;
        bestDist = dist;
      }
    }

    // No unoccupied neighbor found, cannot proceed
    if (best === null) {
      break;
    }

    path.push(best);
    current = best;

    // Safety: prevent infinite loops
    if (path.length > 50) break;
  }

  return path;
}
