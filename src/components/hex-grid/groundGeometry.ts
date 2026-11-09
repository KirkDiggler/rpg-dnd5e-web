import * as THREE from 'three';
import { dungeonFloorUv } from './dungeonFloorUv';
import { cubeToWorld, hexCorners, type CubeCoord } from './hexMath';

export interface GroundTile {
  readonly cell: CubeCoord;
  /** Missing ref means the existing floor, not an unavailable named style. */
  readonly ref?: string;
  readonly color?: readonly [number, number, number];
  readonly remembered?: boolean;
}

export interface GroundBatch {
  readonly ref?: string;
  readonly remembered: boolean;
  readonly tiles: readonly GroundTile[];
}

/** Exactly one draw batch per appearance/memory mode; duplicate cells refuse. */
export function groupGroundTiles(tiles: readonly GroundTile[]): GroundBatch[] {
  const groups = new Map<
    string,
    { ref?: string; remembered: boolean; tiles: GroundTile[] }
  >();
  const cells = new Set<string>();
  for (const tile of tiles) {
    const cellKey = `${tile.cell.x},${tile.cell.y},${tile.cell.z}`;
    if (cells.has(cellKey))
      throw new Error(`Duplicate ground cell: ${cellKey}`);
    cells.add(cellKey);
    const key = JSON.stringify([tile.ref ?? null, Boolean(tile.remembered)]);
    let group = groups.get(key);
    if (!group) {
      group = {
        ref: tile.ref,
        remembered: Boolean(tile.remembered),
        tiles: [],
      };
      groups.set(key, group);
    }
    group.tiles.push(tile);
  }
  return [...groups.values()];
}

/** Flat indexed hexes share a world-space texture chart, even across regions. */
export function buildGroundGeometry(
  tiles: readonly GroundTile[],
  hexSize: number,
  repeat: number
): THREE.BufferGeometry {
  if (!Number.isFinite(hexSize) || hexSize <= 0)
    throw new Error('Ground hex size must be positive');
  dungeonFloorUv(0, 0, repeat);
  const positions = new Float32Array(tiles.length * 18);
  const uvs = new Float32Array(tiles.length * 12);
  const colors = new Float32Array(tiles.length * 18);
  const indices: number[] = [];
  tiles.forEach((tile, index) => {
    const center = cubeToWorld(tile.cell, hexSize);
    const corners = hexCorners(center, hexSize);
    const color = tile.color ?? [1, 1, 1];
    corners.forEach((point, corner) => {
      const at = index * 6 + corner;
      positions.set([point.x, 0, point.z], at * 3);
      uvs.set(dungeonFloorUv(point.x, point.z, repeat), at * 2);
      colors.set(color, at * 3);
    });
    for (let corner = 1; corner < 5; corner++)
      indices.push(index * 6, index * 6 + corner, index * 6 + corner + 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
