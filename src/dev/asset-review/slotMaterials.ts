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
import {
  NEUTRAL_BASE_SRGB,
  slotKey,
  type EditorSource,
  type RecipeChannels,
} from './materialRecipe';

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

export interface GltfLike {
  scene: THREE.Object3D;
  parser: {
    json: {
      meshes?: { primitives?: { material?: number }[] }[];
      materials?: { name?: string }[];
    };
  };
}

export interface SlotBinding {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

export interface SlotBindings {
  bindings: Map<string, SlotBinding>;
  problems: string[];
}

export function isMesh(value: THREE.Object3D): value is THREE.Mesh {
  return (value as THREE.Mesh).isMesh === true;
}

export function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/**
 * Resolve the prepared target mapping against the loaded GLB: join by the
 * producer-generated slot material name, verify the explicit mesh/primitive/
 * material indices from the manifest, and give every slot its own cloned
 * material so edits never leak into other slots or cached scenes. Runs on the
 * rendered clone (Mesh.clone copies material arrays before we assign), so the
 * cloned slot materials are the ones actually rendered.
 */
export function applySlotBindings(
  root: THREE.Object3D,
  gltf: GltfLike,
  source: EditorSource
): SlotBindings {
  const problems: string[] = [];
  const byName = new Map<string, { mesh: THREE.Mesh; index: number }>();
  root.traverse((child) => {
    if (!isMesh(child)) return;
    materialsOf(child).forEach((material, index) => {
      if (material && material.name && !byName.has(material.name))
        byName.set(material.name, { mesh: child, index });
    });
  });
  const bindings = new Map<string, SlotBinding>();
  const copiedArrays = new Set<THREE.Mesh>();
  for (const target of source.targets) {
    if (!target.rendered || !target.target) continue;
    const key = slotKey(source.sourcePath, target.objectName, target.slot);
    const gltfMaterialIndex =
      gltf.parser.json.meshes?.[target.target.mesh]?.primitives?.[
        target.target.primitive
      ]?.material;
    const gltfMaterialName =
      gltfMaterialIndex === undefined
        ? undefined
        : gltf.parser.json.materials?.[gltfMaterialIndex]?.name;
    if (
      gltfMaterialIndex !== target.target.material ||
      gltfMaterialName !== target.target.materialName
    )
      problems.push(
        `Prepared target for ${target.objectName}:${target.slot} does not match the loaded GLB (mesh ${target.target.mesh}, primitive ${target.target.primitive}, material ${target.target.material})`
      );
    const found = byName.get(target.target.materialName);
    if (!found) {
      problems.push(`Loaded GLB has no material ${target.target.materialName}`);
      continue;
    }
    const base = materialsOf(found.mesh)[found.index];
    if (!(base instanceof THREE.MeshStandardMaterial)) {
      problems.push(
        `Slot material ${target.target.materialName} is not a standard material`
      );
      continue;
    }
    const clone = base.clone();
    clone.name = target.target.materialName;
    if (Array.isArray(found.mesh.material)) {
      if (!copiedArrays.has(found.mesh)) {
        found.mesh.material = [...found.mesh.material];
        copiedArrays.add(found.mesh);
      }
      found.mesh.material[found.index] = clone;
    } else {
      found.mesh.material = clone;
    }
    bindings.set(key, { mesh: found.mesh, material: clone });
  }
  return { bindings, problems };
}
