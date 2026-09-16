/**
 * Real three.js application of editing-profile channels to one slot's
 * material. Both the producer (Blender) and this consumer must apply the same
 * numbers: base color uses an untinted white factor with the image as the map
 * (neutral solid is sRGB #666666), normal strength mirrors the Normal Map node
 * strength as normalScale, emissive multiplies image/color and scales by
 * strength. Stored colors are sRGB hex; textures for color channels are sRGB,
 * normal-map data stays linear (NoColorSpace).
 */
import * as THREE from 'three';
import { NEUTRAL_BASE_SRGB, type RecipeChannels } from './materialRecipe';

/** Textures for one slot; every instance must be owned by exactly this slot. */
export interface ChannelTextures {
  baseColor: THREE.Texture | null;
  normal: THREE.Texture | null;
  emissive: THREE.Texture | null;
}

export const TEXTURE_ERROR_SRGB = '#ff4ca8';

function wrapTexture(texture: THREE.Texture, wrap: 'repeat' | 'clamp'): void {
  const mode =
    wrap === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (texture.wrapS !== mode || texture.wrapT !== mode) {
    texture.wrapS = mode;
    texture.wrapT = mode;
    texture.needsUpdate = true;
  }
}

/** Apply one slot's channels to its own material instance. */
export function applyChannels(
  material: THREE.MeshStandardMaterial,
  channels: RecipeChannels,
  textures: ChannelTextures
): void {
  if (channels.baseColor && textures.baseColor) {
    textures.baseColor.colorSpace = THREE.SRGBColorSpace;
    wrapTexture(textures.baseColor, channels.wrap);
    material.map = textures.baseColor;
    material.color.set('#ffffff');
  } else {
    material.map = null;
    material.color.set(NEUTRAL_BASE_SRGB);
  }

  if (channels.normal && textures.normal) {
    textures.normal.colorSpace = THREE.NoColorSpace;
    wrapTexture(textures.normal, channels.wrap);
    material.normalMap = textures.normal;
    material.normalScale.set(
      channels.normal.strength,
      channels.normal.strength
    );
  } else {
    material.normalMap = null;
    material.normalScale.set(1, 1);
  }

  if (channels.emissive === null) {
    material.emissiveMap = null;
    material.emissive.set('#000000');
    material.emissiveIntensity = 1;
  } else {
    // Profile colors are stored as bare six-hex; three.js setStyle needs the
    // '#' prefix (a bare string is silently ignored).
    material.emissive.set(`#${channels.emissive.color}`);
    material.emissiveIntensity = channels.emissive.strength;
    if (channels.emissive.image && textures.emissive) {
      textures.emissive.colorSpace = THREE.SRGBColorSpace;
      wrapTexture(textures.emissive, channels.wrap);
      material.emissiveMap = textures.emissive;
    } else {
      material.emissiveMap = null;
    }
  }
  material.needsUpdate = true;
}

/** A failed image must never masquerade as a successful white material. */
export function applyTextureError(material: THREE.MeshStandardMaterial): void {
  material.map = null;
  material.normalMap = null;
  material.emissiveMap = null;
  material.color.set(TEXTURE_ERROR_SRGB);
  material.emissive.set('#000000');
  material.normalScale.set(1, 1);
  material.needsUpdate = true;
}

/**
 * Decoded-image cache keyed by URL: one decode per image, a fresh Texture
 * instance per use so a shared image never mutates through another channel's
 * copy (wrap/colorSpace are per-instance).
 */
export class ImageTextureFactory {
  private readonly images = new Map<string, Promise<HTMLImageElement>>();

  constructor(
    private readonly createImage: (url: string) => Promise<HTMLImageElement>
  ) {}

  image(url: string): Promise<HTMLImageElement> {
    let pending = this.images.get(url);
    if (!pending) {
      pending = this.createImage(url).catch((cause: unknown) => {
        // Retry later instead of caching a failure forever.
        this.images.delete(url);
        throw cause;
      });
      this.images.set(url, pending);
    }
    return pending;
  }

  /** A new, independently configurable Texture for one channel use. */
  async texture(
    url: string
  ): Promise<{ texture: THREE.Texture; release: () => void }> {
    const image = await this.image(url);
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    return { texture, release: () => texture.dispose() };
  }
}
