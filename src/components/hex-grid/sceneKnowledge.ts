import * as THREE from 'three';

export type SceneKnowledgeState = 'visible' | 'remembered';

export const CRYPT_MEMORY_COLOR = new THREE.Color('#465366');
export const CRYPT_MEMORY_EMISSIVE = new THREE.Color('#111923');
export const CRYPT_MEMORY_OPACITY = 1.0;
export const CRYPT_MEMORY_EMISSIVE_INTENSITY = 0.08;

export function isRemembered(state?: SceneKnowledgeState): boolean {
  return state === 'remembered';
}

export function entityClickHandler<T>(
  state: SceneKnowledgeState | undefined,
  handler: T | undefined
): T | undefined {
  return isRemembered(state) ? undefined : handler;
}

export function rememberedSegment(
  key: string,
  keys?: ReadonlySet<string>
): boolean {
  return keys?.has(key.split('->')[0]!) ?? false;
}

export function rememberedFitting(
  key: string,
  keys?: ReadonlySet<string>
): boolean {
  return key.split('|').some((hexKey) => keys?.has(hexKey) ?? false);
}

export function cloneCryptMaterials(
  original: THREE.Material | THREE.Material[]
): THREE.Material | THREE.Material[] {
  const source = Array.isArray(original) ? original : [original];
  const clones = source.map((material) => {
    const clone = material.clone();
    if ('color' in clone && clone.color instanceof THREE.Color) {
      clone.color.multiply(CRYPT_MEMORY_COLOR);
    }
    if (clone instanceof THREE.MeshStandardMaterial) {
      clone.emissive.copy(CRYPT_MEMORY_EMISSIVE);
      clone.emissiveIntensity = CRYPT_MEMORY_EMISSIVE_INTENSITY;
    }
    clone.transparent = false;
    clone.opacity = CRYPT_MEMORY_OPACITY;
    clone.depthWrite = true;
    return clone;
  });
  return Array.isArray(original) ? clones : clones[0]!;
}
