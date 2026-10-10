import { dungeonFloorUv } from '@/components/hex-grid/dungeonFloorUv';
import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import * as THREE from 'three';
import { workspaceCells, type RoomWorkspace } from './workspaceGeometry';

/** One batched cell-union plane for rectangles; numeric/legacy callers retain
 * their six-sided envelope. Local +Y maps to world -Z after rotateX(-PI/2). */
export function createWorkspaceFloorGeometry(
  workspace: number,
  worldUnitsPerRepeat: number
): THREE.CircleGeometry;
export function createWorkspaceFloorGeometry(
  workspace: number | RoomWorkspace,
  worldUnitsPerRepeat: number
): THREE.BufferGeometry;
export function createWorkspaceFloorGeometry(
  workspace: number | RoomWorkspace,
  worldUnitsPerRepeat: number
): THREE.BufferGeometry {
  const radius =
    typeof workspace === 'number' ? workspace : workspace.horizontalLimit + 1;
  const geometry =
    typeof workspace === 'number' || workspace.kind !== 'centered-odd-r'
      ? new THREE.CircleGeometry(radius, 6)
      : createWorkspaceCellPlane(workspace);
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

function createWorkspaceCellPlane(
  workspace: RoomWorkspace
): THREE.BufferGeometry {
  const cells = workspaceCells(workspace);
  const positions = new Float32Array(cells.length * 6 * 3 * 3);
  let offset = 0;
  for (const cell of cells) {
    const center = cubeToWorld(
      { x: cell.q, y: -cell.q - cell.r, z: cell.r },
      HEX_SIZE
    );
    const corners = hexCorners(center, HEX_SIZE);
    for (let i = 0; i < 6; i++) {
      for (const point of [center, corners[i]!, corners[(i + 1) % 6]!]) {
        positions[offset++] = point.x;
        positions[offset++] = -point.z;
        positions[offset++] = 0;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
