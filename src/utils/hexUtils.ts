// Hex grid utility functions for pathfinding and distance calculations

// Calculate hex distance (using offset coordinates with proper conversion)
export function hexDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  // Convert offset to cube coordinates for accurate distance
  // For odd-r offset coordinates (pointy-top hexes)
  const cubeX1 = x1;
  const cubeZ1 = y1 - (x1 - (x1 & 1)) / 2;
  const cubeY1 = -cubeX1 - cubeZ1;

  const cubeX2 = x2;
  const cubeZ2 = y2 - (x2 - (x2 & 1)) / 2;
  const cubeY2 = -cubeX2 - cubeZ2;

  // Manhattan distance in cube coordinates divided by 2
  return Math.max(
    Math.abs(cubeX1 - cubeX2),
    Math.abs(cubeY1 - cubeY2),
    Math.abs(cubeZ1 - cubeZ2)
  );
}

// Get 6 adjacent hexes (pointy-top orientation, odd-r offset)
function getHexNeighbors(
  x: number,
  y: number
): Array<{ x: number; y: number }> {
  // Pointy-top hex neighbors (odd-r offset coordinates)
  const parity = y & 1; // 0 for even rows, 1 for odd rows

  return [
    { x: x + 1, y: y }, // East
    { x: x - 1, y: y }, // West
    { x: x + parity, y: y - 1 }, // NorthEast
    { x: x + parity - 1, y: y - 1 }, // NorthWest
    { x: x + parity, y: y + 1 }, // SouthEast
    { x: x + parity - 1, y: y + 1 }, // SouthWest
  ];
}

// Find shortest path between two hexes using simple greedy pathfinding
export function findHexPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  occupiedPositions: Set<string>
): Array<{ x: number; y: number }> {
  // If already adjacent or same, return direct path
  const dist = hexDistance(from.x, from.y, to.x, to.y);
  if (dist <= 1) return [to];

  // Simple straight-line pathing (greedy approach)
  const path: Array<{ x: number; y: number }> = [];
  let current = { ...from };

  while (hexDistance(current.x, current.y, to.x, to.y) > 0) {
    // Get all 6 neighbors
    const neighbors = getHexNeighbors(current.x, current.y);

    // Find neighbor closest to target that isn't occupied
    let best = neighbors[0];
    let bestDist = hexDistance(best.x, best.y, to.x, to.y);

    for (const neighbor of neighbors) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (occupiedPositions.has(key)) continue; // Skip occupied cells

      const dist = hexDistance(neighbor.x, neighbor.y, to.x, to.y);
      if (dist < bestDist) {
        best = neighbor;
        bestDist = dist;
      }
    }

    path.push(best);
    current = best;

    // Safety: prevent infinite loops
    if (path.length > 50) break;
  }

  return path;
}
