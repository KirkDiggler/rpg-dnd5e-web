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
