import {
  cloneRegionLightingMaterial,
  type RegionLightingMaterialBinding,
} from '@/rendering/regionLightingMaterials';
import { useEffect, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { cloneCryptMaterials } from './sceneKnowledge';

/** One writer for memory + optional Studio lighting. Capture after layout,
 * including generated cap courses; cached source maps/geometry stay shared. */
export function useRememberedModelTint(
  object: THREE.Object3D | RefObject<THREE.Object3D | null>,
  remembered: boolean,
  revision?: number,
  visualLighting?: RegionLightingMaterialBinding,
  assetRef?: string,
  receiver: 'lit' | 'workspace-basic' = 'lit'
): void {
  // Courses created while a previous treatment is mounted can inherit one of
  // its clones. Retain weak provenance, not retired meshes or owned resources.
  const [provenance] = useState(
    () => new WeakMap<THREE.Material, THREE.Material>()
  );
  const [arrayProvenance] = useState(
    () => new WeakMap<THREE.Material[], THREE.Material[]>()
  );
  useEffect(() => {
    const root = 'current' in object ? object.current : object;
    if (!root) return;
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const created = new Set<THREE.Material>();
    const treated = new Map<THREE.Material, THREE.Material>();
    const original = (material: THREE.Material): THREE.Material =>
      provenance.get(material) ?? material;
    const treat = (source: THREE.Material): THREE.Material => {
      const existing = treated.get(source);
      if (existing) return existing;
      let material = source;
      if (remembered) {
        material = cloneCryptMaterials(source) as THREE.Material;
        // Three.clone does not copy callbacks. Preserve the source hook for
        // compatibility checking rather than silently dropping unknown hooks.
        material.onBeforeCompile = source.onBeforeCompile;
        material.customProgramCacheKey = source.customProgramCacheKey;
        created.add(material);
        provenance.set(material, source);
      }
      if (visualLighting) {
        const result = cloneRegionLightingMaterial(
          material,
          visualLighting,
          receiver,
          assetRef
        );
        if (result.status === 'ready') {
          material = result.material;
          created.add(material);
          provenance.set(material, source);
        } else visualLighting.reportDiagnostic(result.diagnostic);
      }
      treated.set(source, material);
      return material;
    };
    root.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const source = Array.isArray(mesh.material)
        ? (arrayProvenance.get(mesh.material) ?? mesh.material)
        : original(mesh.material);
      originals.set(mesh, source);
      if (remembered || visualLighting) {
        if (Array.isArray(source)) {
          const materials = source.map(treat);
          arrayProvenance.set(materials, source);
          mesh.material = materials;
        } else mesh.material = treat(source);
      } else mesh.material = source;
    });
    return () => {
      originals.forEach((source, mesh) => {
        mesh.material = source;
      });
      created.forEach((material) => material.dispose());
    };
  }, [
    object,
    provenance,
    arrayProvenance,
    remembered,
    revision,
    visualLighting,
    assetRef,
    receiver,
  ]);
}
