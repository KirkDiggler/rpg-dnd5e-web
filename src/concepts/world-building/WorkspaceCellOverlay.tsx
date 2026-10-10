import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { RoomHexCell } from './workspaceGeometry';

/** One draw call and one shared inset-hex geometry per rectangular overlay.
 * Instance matrices are preview data, never document or gameplay geometry. */
export function WorkspaceCellOverlay({
  name,
  cells,
  geometry,
  y,
  color,
  opacity,
}: {
  name: string;
  cells: readonly RoomHexCell[];
  geometry: THREE.BufferGeometry;
  y: number;
  color: string;
  opacity: number;
}): React.JSX.Element | null {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    cells.forEach((cell, i) => {
      const p = cubeToWorld(
        { x: cell.q, y: -cell.q - cell.r, z: cell.r },
        HEX_SIZE
      );
      mesh.setMatrixAt(i, matrix.makeTranslation(p.x, y, p.z));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, y]);
  if (!cells.length) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, undefined, cells.length]}
      raycast={() => null}
    >
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
