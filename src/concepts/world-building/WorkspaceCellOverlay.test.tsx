import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { WorkspaceCellOverlay } from './WorkspaceCellOverlay';
import { createWalkableHexFillGeometry } from './roomHexGeometry';
import { centeredRoomWorkspace, workspaceCells } from './workspaceGeometry';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('rectangular overlay batching', () => {
  it('draws all 16384 floor/preview cells in one instanced mesh and reuses the shared hex geometry', async () => {
    const geometry = createWalkableHexFillGeometry();
    const cells = workspaceCells(centeredRoomWorkspace(128, 128));
    const render = (values: typeof cells) => (
      <WorkspaceCellOverlay
        name="cells"
        cells={values}
        geometry={geometry}
        y={0.02}
        color="#34d399"
        opacity={0.34}
      />
    );
    const view = await ReactThreeTestRenderer.create(render(cells));
    const mesh = view.scene.findByProps({ name: 'cells' })
      .instance as THREE.InstancedMesh;
    expect(mesh.count).toBe(16384);
    expect(mesh.geometry).toBe(geometry);
    expect(
      view.scene.findAll(
        (node) => (node.instance as THREE.InstancedMesh)?.isInstancedMesh
      )
    ).toHaveLength(1);
    const matrix = new THREE.Matrix4();
    for (const i of [0, 8192, 16383]) {
      mesh.getMatrixAt(i, matrix);
      const center = cubeToWorld(
        { x: cells[i]!.q, y: -cells[i]!.q - cells[i]!.r, z: cells[i]!.r },
        HEX_SIZE
      );
      expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(
        center.x,
        4
      );
      expect(new THREE.Vector3().setFromMatrixPosition(matrix).z).toBeCloseTo(
        center.z,
        4
      );
    }
    await view.update(render(cells.slice(0, 2)));
    const next = view.scene.findByProps({ name: 'cells' })
      .instance as THREE.InstancedMesh;
    expect(next.count).toBe(2);
    expect(next.geometry).toBe(geometry);
    expect(next.boundingSphere).not.toBeNull();
    await view.update(render([]));
    expect(view.scene.findAllByProps({ name: 'cells' })).toHaveLength(0);
    await view.unmount();
    geometry.dispose();
  });
});
