import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { cloneCryptMaterials } from './sceneKnowledge';

/** Apply the existing memory treatment to an instance clone, never cached GLB
 * materials. Capture after layout so generated companion pieces are included. */
export function useRememberedModelTint(
  object: THREE.Object3D,
  remembered: boolean,
  revision?: number
) {
  const originals = useMemo(
    () => new Map<THREE.Mesh, THREE.Material | THREE.Material[]>(),
    [object]
  );
  useEffect(() => {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && !originals.has(child))
        originals.set(child, child.material);
    });
    if (!remembered) {
      originals.forEach((material, mesh) => {
        mesh.material = material;
      });
      return;
    }
    const created: THREE.Material[] = [];
    originals.forEach((material, mesh) => {
      const tinted = cloneCryptMaterials(material);
      created.push(...(Array.isArray(tinted) ? tinted : [tinted]));
      mesh.material = tinted;
    });
    return () => {
      originals.forEach((material, mesh) => {
        mesh.material = material;
      });
      created.forEach((material) => material.dispose());
    };
  }, [object, originals, remembered, revision]);
}
