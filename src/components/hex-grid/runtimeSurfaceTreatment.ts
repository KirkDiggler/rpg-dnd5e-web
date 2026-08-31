import * as THREE from 'three';

export interface RuntimeSurfaceTreatment {
  readonly baseColorSrgb: `#${string}`;
  readonly roughness: number;
  readonly metalness: number;
}

const EXACT_SRGB_HEX = /^#[0-9A-F]{6}$/i;

function validateUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number between 0 and 1.`);
  }
}

export function applyRuntimeSurfaceTreatment(
  mesh: THREE.SkinnedMesh,
  treatment: RuntimeSurfaceTreatment
): readonly THREE.MeshStandardMaterial[] {
  if (!EXACT_SRGB_HEX.test(treatment.baseColorSrgb)) {
    throw new TypeError('baseColorSrgb must be an exact #RRGGBB color.');
  }
  validateUnitInterval(treatment.roughness, 'roughness');
  validateUnitInterval(treatment.metalness, 'metalness');

  const sourceMaterials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  const standardSources = sourceMaterials.filter(
    (material): material is THREE.MeshStandardMaterial =>
      material instanceof THREE.MeshStandardMaterial
  );
  if (standardSources.length !== sourceMaterials.length) {
    throw new TypeError(
      'Runtime surface treatment requires MeshStandardMaterial sources.'
    );
  }

  const createdMaterials = standardSources.map((source) => {
    const created = source.clone();
    created.color.set(treatment.baseColorSrgb);
    created.roughness = treatment.roughness;
    created.metalness = treatment.metalness;
    created.needsUpdate = true;
    return created;
  });

  mesh.material = Array.isArray(mesh.material)
    ? createdMaterials
    : createdMaterials[0]!;
  return createdMaterials;
}
