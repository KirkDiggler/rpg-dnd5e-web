import * as THREE from 'three';

function collectTextures(
  value: unknown,
  textures: Set<THREE.Texture>,
  visited: Set<object>
): void {
  if (value instanceof THREE.Texture) {
    textures.add(value);
    return;
  }
  if (typeof value !== 'object' || value === null || visited.has(value)) {
    return;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextures(item, textures, visited));
    return;
  }

  for (const nested of Object.values(value)) {
    collectTextures(nested, textures, visited);
  }
}

/**
 * Releases resources owned by a loaded candidate hierarchy. The traversal is
 * intentionally rooted at the candidate, so shared scene fixtures such as the
 * floor and fighter remain owned by their normal renderers.
 */
export function disposeObjectResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (renderable.geometry instanceof THREE.BufferGeometry) {
      geometries.add(renderable.geometry);
    }
    const objectMaterials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    objectMaterials.forEach((material) => materials.add(material));
  });

  for (const material of materials) {
    collectTextures(material, textures, new Set<object>());
  }
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
