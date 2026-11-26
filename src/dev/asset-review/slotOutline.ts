import * as THREE from 'three';
import type { SlotBinding } from './slotMaterials';

/** Instance-owned visual marker for only the selected material's triangles.
 * It never changes the underlying material, UVs or shared geometry. */
export function attachSlotOutline(binding: SlotBinding): { dispose(): void } {
  const source = binding.mesh.geometry;
  const geometry = source.clone();
  if (Array.isArray(binding.mesh.material)) {
    const indices: number[] = [];
    for (const group of source.groups) {
      if ((group.materialIndex ?? 0) !== binding.materialIndex) continue;
      for (let i = group.start; i < group.start + group.count; i++) {
        indices.push(source.index ? source.index.getX(i) : i);
      }
    }
    if (!indices.length) {
      geometry.dispose();
      throw new Error('Selected material has no triangle group to outline.');
    }
    geometry.setIndex(indices);
    geometry.clearGroups();
  }
  const edges = new THREE.EdgesGeometry(geometry);
  geometry.dispose();
  const material = new THREE.LineBasicMaterial({
    color: '#ffd166',
    depthTest: false,
  });
  const marker = new THREE.LineSegments(edges, material);
  marker.name = 'MaterialEditorSelectedSurface';
  marker.renderOrder = 1000;
  binding.mesh.add(marker);
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      marker.removeFromParent();
      edges.dispose();
      material.dispose();
    },
  };
}
