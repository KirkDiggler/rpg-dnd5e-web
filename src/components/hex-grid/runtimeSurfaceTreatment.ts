import * as THREE from 'three';
import {
  CRYPT_MEMORY_COLOR,
  CRYPT_MEMORY_EMISSIVE,
  CRYPT_MEMORY_EMISSIVE_INTENSITY,
  CRYPT_MEMORY_OPACITY,
} from './sceneKnowledge';

export interface RuntimeSurfaceTreatment {
  readonly baseColorSrgb: `#${string}`;
  readonly roughness: number;
  readonly metalness: number;
}

export interface RuntimeEntityMaterialTreatment {
  readonly isSelected: boolean;
  readonly isGhost: boolean;
  readonly remembered: boolean;
}

const EXACT_SRGB_HEX = /^#[0-9A-F]{6}$/i;

function validateUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number between 0 and 1.`);
  }
}

function validateRuntimeSurfaceTreatment(
  treatment: RuntimeSurfaceTreatment
): void {
  if (!EXACT_SRGB_HEX.test(treatment.baseColorSrgb)) {
    throw new TypeError('baseColorSrgb must be an exact #RRGGBB color.');
  }
  validateUnitInterval(treatment.roughness, 'roughness');
  validateUnitInterval(treatment.metalness, 'metalness');
}

export function updateRuntimeSurfaceTreatment<
  T extends readonly THREE.MeshStandardMaterial[],
>(materials: T, treatment: RuntimeSurfaceTreatment): T {
  validateRuntimeSurfaceTreatment(treatment);
  if (
    materials.some(
      (material) => !(material instanceof THREE.MeshStandardMaterial)
    )
  ) {
    throw new TypeError(
      'Runtime surface treatment requires MeshStandardMaterial sources.'
    );
  }

  materials.forEach((material) => {
    material.color.set(treatment.baseColorSrgb);
    material.roughness = treatment.roughness;
    material.metalness = treatment.metalness;
    material.needsUpdate = true;
  });
  return materials;
}

export function applyRuntimeEntityMaterialOverlay<
  T extends readonly THREE.Material[],
>(materials: T, treatment: RuntimeEntityMaterialTreatment): T {
  materials.forEach((material) => {
    if (treatment.remembered) {
      if ('color' in material && material.color instanceof THREE.Color) {
        material.color.multiply(CRYPT_MEMORY_COLOR);
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.copy(CRYPT_MEMORY_EMISSIVE);
        material.emissiveIntensity = CRYPT_MEMORY_EMISSIVE_INTENSITY;
      }
      material.transparent = false;
      material.opacity = CRYPT_MEMORY_OPACITY;
      material.depthWrite = true;
      material.needsUpdate = true;
      return;
    }
    if (
      treatment.isSelected &&
      material instanceof THREE.MeshStandardMaterial
    ) {
      material.emissive.set('#ffffff');
      material.emissiveIntensity = 0.25;
    }
    if (treatment.isGhost) {
      material.transparent = true;
      material.opacity = 0.35;
    }
    material.needsUpdate = true;
  });
  return materials;
}

export function updateRuntimeAccessorySurfaceTreatment<
  T extends readonly THREE.MeshStandardMaterial[],
>(
  materials: T,
  surface: RuntimeSurfaceTreatment,
  entity: RuntimeEntityMaterialTreatment
): T {
  updateRuntimeSurfaceTreatment(materials, surface);
  materials.forEach((material) => {
    material.emissive.set('#000000');
    material.emissiveIntensity = 1;
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
  });
  return applyRuntimeEntityMaterialOverlay(materials, entity);
}

export function applyRuntimeSurfaceTreatment(
  mesh: THREE.SkinnedMesh,
  treatment: RuntimeSurfaceTreatment
): readonly THREE.MeshStandardMaterial[] {
  validateRuntimeSurfaceTreatment(treatment);

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

  const createdMaterials = standardSources.map((source) => source.clone());
  updateRuntimeSurfaceTreatment(createdMaterials, treatment);

  mesh.material = Array.isArray(mesh.material)
    ? createdMaterials
    : createdMaterials[0]!;
  return createdMaterials;
}
