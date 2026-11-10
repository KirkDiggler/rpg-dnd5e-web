import * as THREE from 'three';
import type {
  WorldAtlasBinding,
  WorldAtlasMaterial,
  WorldAtlasSurface,
} from './worldMaterialTypes';
import {
  resolveWorldSurfaceTargets,
  type WorldSurfaceTarget,
} from './worldSurfaceMaterials';

export interface WorldAtlasSelection {
  surfaceId: string;
  material: WorldAtlasMaterial;
  /** Verified immutable pixels; never configure this caller-owned texture. */
  texture: THREE.Texture;
}
export interface WorldAtlasMaterialsInput {
  assetRef: string;
  /** Exact loaded asset identity supplied by the verified provider/runtime path. */
  glbSha256: string;
  root: THREE.Object3D;
  binding?: WorldAtlasBinding;
  selections: readonly WorldAtlasSelection[];
}
export interface OwnedWorldAtlasMaterials {
  readonly materials: readonly THREE.MeshStandardMaterial[];
  readonly samplers: readonly THREE.Texture[];
  /** Remove later lighting/memory overlays first. Restores references and only
   * disposes this operation's clones; repeat calls are inert. */
  dispose(): void;
}
const WRAPS = new Map<number, THREE.Wrapping>([
  [10497, THREE.RepeatWrapping],
  [33071, THREE.ClampToEdgeWrapping],
  [33648, THREE.MirroredRepeatWrapping],
]);
const MAG = new Map<number, THREE.MagnificationTextureFilter>([
  [9728, THREE.NearestFilter],
  [9729, THREE.LinearFilter],
]);
const MIN = new Map<number, THREE.MinificationTextureFilter>([
  [9728, THREE.NearestFilter],
  [9729, THREE.LinearFilter],
  [9984, THREE.NearestMipmapNearestFilter],
  [9985, THREE.LinearMipmapNearestFilter],
  [9986, THREE.NearestMipmapLinearFilter],
  [9987, THREE.LinearMipmapLinearFilter],
]);
function refuse(ref: string, reason: string): never {
  throw Error(`World atlas ${ref}: ${reason}`);
}
function validateTarget(
  target: WorldSurfaceTarget,
  surface: WorldAtlasSurface,
  ref: string
): void {
  const texture = target.source.map;
  if (
    !texture ||
    !Number.isInteger(surface.texCoord) ||
    surface.texCoord < 0 ||
    surface.texCoord > 3 ||
    texture.channel !== surface.texCoord
  )
    refuse(ref, 'missing or mismatched authored color channel');
  const geometry = target.mesh.geometry;
  const uv = geometry.getAttribute(
    surface.texCoord === 0 ? 'uv' : `uv${surface.texCoord}`
  );
  const position = geometry.getAttribute('position');
  if (!uv || uv.itemSize !== 2 || !position || uv.count !== position.count)
    refuse(ref, 'missing or mismatched authored UV attribute');
  const sampler = surface.sampler;
  if (
    !WRAPS.has(sampler.wrapS) ||
    !WRAPS.has(sampler.wrapT) ||
    !MAG.has(sampler.magFilter) ||
    !MIN.has(sampler.minFilter) ||
    texture.wrapS !== WRAPS.get(sampler.wrapS) ||
    texture.wrapT !== WRAPS.get(sampler.wrapT) ||
    texture.magFilter !== MAG.get(sampler.magFilter) ||
    texture.minFilter !== MIN.get(sampler.minFilter) ||
    texture.flipY
  )
    refuse(ref, 'authored sampler differs from declared glTF facts');
}

/** No geometry/chart edits or resource fetch. One material target may comprise
 * several GLTFLoader primitives; their original cache objects remain immutable. */
export function applyWorldAtlasMaterials(
  input: WorldAtlasMaterialsInput
): OwnedWorldAtlasMaterials {
  const materials: THREE.MeshStandardMaterial[] = [],
    samplers: THREE.Texture[] = [];
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  let disposed = false;
  const result: OwnedWorldAtlasMaterials = {
    materials,
    samplers,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [mesh, original] of originals) mesh.material = original;
      for (const material of materials) material.dispose();
      for (const sampler of samplers) sampler.dispose();
    },
  };
  if (!input.selections.length) return result;
  const { binding, assetRef, glbSha256 } = input;
  if (
    !binding ||
    binding.assetRef !== assetRef ||
    binding.glbSha256 !== glbSha256 ||
    !/^[a-f0-9]{64}$/.test(glbSha256)
  )
    refuse(assetRef, 'missing binding or stale asset identity');
  const surfaces = new Map<string, WorldAtlasSurface>(),
    pairs = new Set<string>();
  for (const surface of binding.surfaces) {
    const pair = JSON.stringify([surface.node, surface.material]);
    if (
      !surface.id ||
      surfaces.has(surface.id) ||
      pairs.has(pair) ||
      !/^[a-f0-9]{64}$/.test(surface.defaultBaseColorSha256)
    )
      refuse(assetRef, 'invalid or duplicate surface binding');
    surfaces.set(surface.id, surface);
    pairs.add(pair);
  }
  const selected = new Set<string>(),
    slots = new Map<THREE.Mesh, Set<number>>();
  // Validate the complete operation before allocating or mutating any target.
  const prepared = input.selections.map((selection) => {
    const surface = surfaces.get(selection.surfaceId);
    if (!surface || selected.has(selection.surfaceId))
      refuse(assetRef, 'unknown or duplicate selected surface');
    selected.add(selection.surfaceId);
    if (
      selection.material.mapping !== 'authored-uv' ||
      selection.material.normal !== null ||
      selection.material.emissive !== null ||
      !selection.texture?.isTexture
    )
      refuse(
        assetRef,
        'a complete verified color-only atlas choice is required'
      );
    let targets: WorldSurfaceTarget[];
    try {
      targets = resolveWorldSurfaceTargets(input.root, surface, assetRef);
    } catch (error) {
      refuse(assetRef, error instanceof Error ? error.message : String(error));
    }
    for (const target of targets) {
      const used = slots.get(target.mesh) ?? new Set<number>();
      if (used.has(target.slot))
        refuse(assetRef, 'overlapping selected material scopes');
      used.add(target.slot);
      slots.set(target.mesh, used);
      validateTarget(target, surface, assetRef);
    }
    return { selection, targets };
  });
  try {
    for (const { selection, targets } of prepared) {
      for (const { mesh, slot, source } of targets) {
        const sampler = source.map!.clone();
        samplers.push(sampler);
        // Assigning .image here would mutate the original Texture.Source shared
        // by a clone. Replace the Source pointer with the selected shared pixels.
        sampler.source = selection.texture.source;
        sampler.colorSpace = THREE.SRGBColorSpace;
        sampler.needsUpdate = true;
        const material = source.clone();
        materials.push(material);
        material.map = sampler;
        material.needsUpdate = true;
        if (!originals.has(mesh)) {
          originals.set(mesh, mesh.material);
          if (Array.isArray(mesh.material)) mesh.material = [...mesh.material];
        }
        if (Array.isArray(mesh.material)) mesh.material[slot] = material;
        else mesh.material = material;
      }
    }
    return result;
  } catch (error) {
    result.dispose();
    throw error;
  }
}
