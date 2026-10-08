// @vitest-environment node
import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGroundBoundaryGeometry } from './groundBoundaryGeometry';
import { walkableCellsInWorldRectangle } from './roomDraft';
import { createWorkspaceFloorGeometry } from './workspaceFloorGeometry';
import {
  centeredRoomWorkspace,
  workspaceBoundary,
  workspaceCellAtPoint,
  workspaceCells,
} from './workspaceGeometry';
import { createWorkspaceRectangleSelection } from './workspaceRectangleSelection';

describe('batched rectangle presentation geometry', () => {
  it.each([
    [73, 48, 3504],
    [128, 128, 16384],
  ])(
    'builds one %s × %s cell plane and the real union boundary',
    (w, h, count) => {
      const workspace = centeredRoomWorkspace(w, h);
      const ground = createWorkspaceFloorGeometry(workspace, 6);
      const boundary = createGroundBoundaryGeometry(workspace);
      expect(ground.getAttribute('position').count).toBe(count * 18);
      expect(boundary.getAttribute('position').count).toBe(
        workspaceBoundary(workspace).length * 2
      );
      const mesh = new THREE.Mesh(ground, new THREE.MeshBasicMaterial());
      mesh.rotation.x = -Math.PI / 2;
      mesh.updateMatrixWorld(true);
      for (const cell of [
        workspaceCells(workspace)[0]!,
        { q: -36, r: 0 },
        { q: 36, r: 0 },
      ]) {
        const p = cubeToWorld(
          { x: cell.q, y: -cell.q - cell.r, z: cell.r },
          HEX_SIZE
        );
        expect(workspaceCellAtPoint(workspace, p)).toEqual(cell);
        const ray = new THREE.Raycaster(
          new THREE.Vector3(p.x, 10, p.z),
          new THREE.Vector3(0, -1, 0)
        );
        expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
      }
      if (h === 48) {
        const p = cubeToWorld({ x: 37, y: -37, z: 0 }, HEX_SIZE);
        expect(workspaceCellAtPoint(workspace, p)).toBeNull();
        expect(
          new THREE.Raycaster(
            new THREE.Vector3(p.x, 10, p.z),
            new THREE.Vector3(0, -1, 0)
          ).intersectObject(mesh)
        ).toHaveLength(0);
      }
      const positions = ground.getAttribute('position'),
        uv = ground.getAttribute('uv');
      for (const i of [0, 15, positions.count - 1]) {
        expect(uv.getX(i)).toBeCloseTo(positions.getX(i) / 6);
        expect(uv.getY(i)).toBeCloseTo(-positions.getY(i) / 6);
        expect(ground.getAttribute('normal').getZ(i)).toBeCloseTo(1);
      }
      ground.dispose();
      boundary.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  );

  it('memoizable rectangle center selection matches the document helper in both variants', () => {
    for (const workspace of [
      centeredRoomWorkspace(73, 48),
      { hexRadius: 6, horizontalLimit: 12 },
    ]) {
      const select = createWorkspaceRectangleSelection(workspace);
      for (const [a, b] of [
        [
          { x: -64, z: -36 },
          { x: 64, z: 36 },
        ],
        [
          { x: -20, z: -13 },
          { x: 4, z: 3 },
        ],
        [
          { x: 0, z: 0 },
          { x: 0, z: 0 },
        ],
      ]) {
        expect(select(a!, b!)).toEqual(
          walkableCellsInWorldRectangle(a!, b!, workspace)
        );
      }
      expect(select({ x: NaN, z: 0 }, { x: 1, z: 1 })).toEqual([]);
    }
  });
});
