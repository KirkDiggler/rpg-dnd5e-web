import { cubeToWorld, type CubeCoord } from './hexMath';

/** Cover the rendered floor, including tile edges, at its actual world offset. */
export function floorPickingBounds(
  cells: Iterable<CubeCoord>,
  hexSize: number
): { position: [number, number, number]; size: [number, number] } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const cell of cells) {
    const world = cubeToWorld(cell, hexSize);
    minX = Math.min(minX, world.x);
    maxX = Math.max(maxX, world.x);
    minZ = Math.min(minZ, world.z);
    maxZ = Math.max(maxZ, world.z);
  }
  if (minX === Infinity)
    return { position: [0, 0, 0], size: [2 * hexSize, 2 * hexSize] };
  return {
    position: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
    size: [maxX - minX + 2 * hexSize, maxZ - minZ + 2 * hexSize],
  };
}
