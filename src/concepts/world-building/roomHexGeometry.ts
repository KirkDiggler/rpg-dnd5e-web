import { HEX_SIZE, hexCorners } from '@/components/hex-grid/hexMath';
import * as THREE from 'three';

/** Pointy-top inset fill derived from the same corners rendered by grid lines. */
export function createWalkableHexFillGeometry(): THREE.BufferGeometry {
  const corners = hexCorners({ x: 0, z: 0 }, HEX_SIZE).map((corner) => ({
    x: corner.x * 0.86,
    z: corner.z * 0.86,
  }));
  const positions = [
    0,
    0,
    0,
    ...corners.flatMap((corner) => [corner.x, 0, corner.z]),
  ];
  const indices = corners.flatMap((_, index) => [
    0,
    index + 1,
    ((index + 1) % corners.length) + 1,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
