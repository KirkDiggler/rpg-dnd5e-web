import type { OutfitPresentation } from '@/character/customization/outfitCustomization';
import * as THREE from 'three';

const MAP_FRAGMENT_ANCHOR = '#include <map_fragment>';
const OUTFIT_FRAGMENT = `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D(map, vMapUv);
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
  #endif
  vec4 outfitMaskSample = texture2D(outfitMask, vMapUv);
  if (usePrimary > 0.5) {
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, primaryColor, outfitMaskSample.r);
  }
  if (useSecondary > 0.5) {
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, secondaryColor, outfitMaskSample.g);
  }
  diffuseColor *= sampledDiffuseColor;
#endif`;

export interface OutfitMaterialUniforms {
  readonly outfitMask: THREE.IUniform<THREE.Texture>;
  readonly usePrimary: THREE.IUniform<number>;
  readonly useSecondary: THREE.IUniform<number>;
  readonly primaryColor: THREE.IUniform<THREE.Color>;
  readonly secondaryColor: THREE.IUniform<THREE.Color>;
}

export interface PreparedOutfitMaterial {
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms: OutfitMaterialUniforms;
}

function applyPresentation(
  uniforms: OutfitMaterialUniforms,
  presentation: OutfitPresentation
): void {
  uniforms.usePrimary.value = presentation.usePrimary ? 1 : 0;
  uniforms.useSecondary.value = presentation.useSecondary ? 1 : 0;
  if (presentation.primaryColor) {
    uniforms.primaryColor.value.set(presentation.primaryColor);
  }
  if (presentation.secondaryColor) {
    uniforms.secondaryColor.value.set(presentation.secondaryColor);
  }
}

/**
 * Creates a renderer-instance material only. The source atlas and mask remain
 * provider/cached resources and are never disposed here or by callers.
 */
export function prepareOutfitMaterial(
  source: THREE.MeshStandardMaterial,
  mask: THREE.Texture,
  presentation: OutfitPresentation
): PreparedOutfitMaterial {
  const material = source.clone();
  const uniforms: OutfitMaterialUniforms = {
    outfitMask: { value: mask },
    usePrimary: { value: 0 },
    useSecondary: { value: 0 },
    primaryColor: { value: new THREE.Color('#000000') },
    secondaryColor: { value: new THREE.Color('#000000') },
  };
  applyPresentation(uniforms, presentation);
  material.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes(MAP_FRAGMENT_ANCHOR)) {
      throw new Error(
        'Class outfit shader requires the Three.js map_fragment chunk anchor.'
      );
    }
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace(
      MAP_FRAGMENT_ANCHOR,
      OUTFIT_FRAGMENT
    );
  };
  material.customProgramCacheKey = () => 'class-outfit-colors-v1';
  material.needsUpdate = true;
  return { material, uniforms };
}

/** Updates an already-compiled instance material without changing its identity. */
export function updateOutfitMaterial(
  prepared: PreparedOutfitMaterial,
  presentation: OutfitPresentation
): void {
  applyPresentation(prepared.uniforms, presentation);
}
