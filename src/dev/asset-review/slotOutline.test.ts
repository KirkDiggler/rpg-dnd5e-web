import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { attachSlotOutline } from './slotOutline';

describe('selected source-slot outline', () => {
  it('marks only the selected triangle group and disposes only the marker', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0],
        3
      )
    );
    geometry.setIndex([0, 1, 2, 3, 4, 5]);
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const materials = [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial(),
    ];
    const mesh = new THREE.Mesh(geometry, materials);
    const sourceDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(materials[1]!, 'dispose');
    const marker = attachSlotOutline({
      mesh,
      material: materials[1]!,
      materialIndex: 1,
    });
    const line = mesh.children[0] as THREE.LineSegments;
    line.geometry.computeBoundingBox();
    expect(line.geometry.boundingBox!.min.x).toBe(10);
    expect(line.geometry.boundingBox!.max.x).toBe(11);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(materials);
    const dispose = vi.spyOn(line.geometry, 'dispose');
    marker.dispose();
    marker.dispose();
    expect(mesh.children).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });
});
