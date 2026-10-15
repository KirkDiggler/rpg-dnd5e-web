import * as THREE from 'three';

export type SceneKnowledgeState = 'visible' | 'remembered';

/**
 * THE REMEMBERED TINT — the one value the fog-of-war remembered treatment is
 * made of (rpg-project#586 design R3, open item O2: grey today, sepia is a
 * retune of this constant and touches nothing else). Models multiply their
 * materials by it (`cloneCryptMaterials`); the floor grades toward it
 * (`rememberedFloorColor`).
 */
export const REMEMBERED_TINT = new THREE.Color('#465366');
/** How bright a remembered floor tile is, as a share of its lit luminance. */
export const REMEMBERED_FLOOR_SHADE = 0.55;
/** How far a remembered floor tile's grey leans toward `REMEMBERED_TINT`. */
export const REMEMBERED_FLOOR_TINT_MIX = 0.25;

export const CRYPT_MEMORY_COLOR = REMEMBERED_TINT;
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

/**
 * A floor tile's colour for a lit share `lit` in [0, 1]: 1 is the lit colour
 * unchanged, 0 the remembered grey (the lit colour's luminance, shaded and
 * leaned toward `REMEMBERED_TINT`), and the soft edge in between. The texture
 * still multiplies the result, so a remembered floor keeps its shape.
 */
export function rememberedFloorColor(
  litColor: THREE.Color,
  lit: number
): THREE.Color {
  const share = Math.max(0, Math.min(1, lit));
  if (share >= 1) return litColor;
  const luma = 0.2126 * litColor.r + 0.7152 * litColor.g + 0.0722 * litColor.b;
  const remembered = new THREE.Color()
    .setScalar(luma * REMEMBERED_FLOOR_SHADE)
    .lerp(REMEMBERED_TINT, REMEMBERED_FLOOR_TINT_MIX);
  return remembered.lerp(litColor, share);
}
