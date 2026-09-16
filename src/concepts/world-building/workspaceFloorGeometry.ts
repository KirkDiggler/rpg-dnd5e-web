import { dungeonFloorUv } from '@/components/hex-grid/dungeonFloorUv';
import * as THREE from 'three';

/** Build the same six-sided plane as the finite interaction ground. */
export function createWorkspaceFloorGeometry(
  radius: number,
  worldUnitsPerRepeat: number
): THREE.CircleGeometry {
  const geometry = new THREE.CircleGeometry(radius, 6);
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    // rotateX(-PI/2) maps local +Y to world -Z.
    const [u, v] = dungeonFloorUv(
      position.getX(index),
      -position.getY(index),
      worldUnitsPerRepeat
    );
    uv[index * 2] = u;
    uv[index * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
