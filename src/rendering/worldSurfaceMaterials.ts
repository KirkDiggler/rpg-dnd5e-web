import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import * as THREE from 'three';
import type { WorldSurfaceMaterial } from './worldMaterialTypes';

type Binding = NonNullable<GeneratedWorldAsset['surfaces']>[number];
export interface WorldSurfaceMaps {
  baseColor: THREE.Texture;
  normal: THREE.Texture;
  metallicRoughness?: THREE.Texture;
  occlusion?: THREE.Texture;
}
export interface WorldSurfaceSelection {
  surfaceId: string;
  material: WorldSurfaceMaterial;
  /** Loaded from the selected material's verified image records, atomically.
   * These samplers belong to the caller's role/channel-aware resource cache. */
  maps: WorldSurfaceMaps;
}
export interface WorldSurfaceMaterialsInput {
  assetRef: string;
  /** A detached, placement-owned hierarchy; fitting/chart preparation precedes
   * this operation. Apply memory/lighting overlays afterwards. */
  root: THREE.Object3D;
  bindings: GeneratedWorldAsset['surfaces'];
  selections: readonly WorldSurfaceSelection[];
}
export interface OwnedWorldSurfaceMaterials {
  readonly materials: readonly THREE.MeshStandardMaterial[];
  /** Remove downstream overlays first. Restores original references and disposes
   * only this operation's material clones, never geometry or shared samplers. */
  dispose(): void;
}

/** Build a role/channel-specific sampler over immutable shared source pixels.
 * The caller owns this sampler (or caches it); never configure a useLoader or
 * GLTF-cache texture in place. All finish maps use the prepared glTF UV chart. */
export function createWorldSurfaceSampler(
  source: THREE.Texture,
  { role, channel }: { role: 'baseColor' | 'normal' | 'data'; channel: number }
): THREE.Texture {
  if (!Number.isInteger(channel) || channel < 0 || channel > 3)
    throw new Error('World surface: unsupported UV channel.');
  const texture = source.clone();
  texture.colorSpace =
    role === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.channel = channel;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.offset.set(0, 0);
  texture.repeat.set(1, 1);
  texture.center.set(0, 0);
  texture.rotation = 0;
  texture.matrixAutoUpdate = true;
  texture.updateMatrix();
  texture.needsUpdate = true;
  return texture;
}

export interface WorldSurfaceTarget {
  mesh: THREE.Mesh;
  slot: number;
  source: THREE.MeshStandardMaterial;
}
function refuse(assetRef: string, id: string, message: string): never {
  throw new Error(`World surface ${assetRef}/${id}: ${message}`);
}
export function resolveWorldSurfaceTargets(
  root: THREE.Object3D,
  binding: Binding,
  assetRef: string
): WorldSurfaceTarget[] {
  const fail = (message: string): never =>
    refuse(assetRef, binding.id, message);
  const named: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.name === binding.node) named.push(node);
  });
  if (named.length !== 1)
    fail(`node ${binding.node} must resolve exactly once`);
  const found: WorldSurfaceTarget[] = [];
  const identities = new Set<THREE.Material>();
  // GLTFLoader may represent one glTF node as a Group with a mesh per primitive.
  named[0].traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const used = Array.isArray(mesh.material)
      ? new Set(mesh.geometry.groups.map((group) => group.materialIndex ?? 0))
      : new Set([0]);
    if (Array.isArray(mesh.material) && used.size === 0)
      fail('material array has no primitive groups');
    for (const slot of used) {
      const material = materials[slot];
      if (!material) fail('invalid primitive material slot');
      if (material.name !== binding.material) continue;
      identities.add(material);
      if (
        !(material instanceof THREE.MeshStandardMaterial) ||
        material.type !== 'MeshStandardMaterial'
      )
        fail(`material ${binding.material} must be MeshStandardMaterial`);
      const source = material as THREE.MeshStandardMaterial;
      if (
        source.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
        source.customProgramCacheKey !==
          THREE.Material.prototype.customProgramCacheKey
      )
        fail('apply finish before custom shader/lighting treatment');
      found.push({ mesh, slot, source });
    }
  });
  if (found.length === 0 || identities.size !== 1)
    fail(`material ${binding.material} must resolve unambiguously within node`);
  return found;
}

function validateMaps(
  target: WorldSurfaceTarget,
  selection: WorldSurfaceSelection,
  assetRef: string
): void {
  const fail = (message: string): never =>
    refuse(assetRef, selection.surfaceId, message);
  const source = target.source;
  const channel = source.normalMap?.channel;
  if (
    !source.map ||
    !source.normalMap ||
    channel !== source.map.channel ||
    !Number.isInteger(channel) ||
    channel! < 0 ||
    channel! > 3
  )
    fail('authored paired maps must declare one supported UV channel');
  const uv = channel === 0 ? 'uv' : `uv${channel}`;
  if (!target.mesh.geometry.hasAttribute(uv)) fail(`missing ${uv} chart`);
  if (
    target.mesh.geometry.hasAttribute('tangent') ||
    source.normalMapType !== THREE.TangentSpaceNormalMap
  )
    fail('requires the fitted derivative normal basis, without stale tangents');
  if (
    ![source.normalScale.x, source.normalScale.y].every(
      (n) => Number.isFinite(n) && n !== 0
    )
  )
    fail('normal basis adapter has no nonzero sign');
  const { material, maps } = selection;
  if (
    !maps.baseColor ||
    !maps.normal ||
    !!material.metallicRoughness !== !!maps.metallicRoughness ||
    !!material.occlusion !== !!maps.occlusion
  )
    fail('complete paired/optional map set required');
  if (
    !material.normalScale.every(Number.isFinite) ||
    ![material.roughness, material.metalness].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1
    )
  )
    fail('invalid material parameters');
  for (const [role, texture] of Object.entries(maps)) {
    if (!texture) continue;
    const expectedSpace =
      role === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (
      texture.channel !== channel ||
      texture.colorSpace !== expectedSpace ||
      texture.flipY ||
      texture.wrapS !== THREE.RepeatWrapping ||
      texture.wrapT !== THREE.RepeatWrapping
    )
      fail(`${role} sampler has wrong channel, color space or orientation`);
    if (
      !texture.matrixAutoUpdate ||
      texture.rotation !== 0 ||
      !texture.offset.equals(new THREE.Vector2(0, 0)) ||
      !texture.repeat.equals(new THREE.Vector2(1, 1)) ||
      !texture.center.equals(new THREE.Vector2(0, 0)) ||
      !texture.matrix.equals(new THREE.Matrix3())
    )
      fail(
        `${role} sampler must use the shared prepared chart without a texture transform`
      );
  }
}

/** Atomic material-only operation. No room topology, UV generation, network
 * fetch, selection persistence or mechanical material meaning lives here. */
export function applyWorldSurfaceMaterials(
  input: WorldSurfaceMaterialsInput
): OwnedWorldSurfaceMaterials {
  const { assetRef, root, bindings, selections } = input;
  const materials: THREE.MeshStandardMaterial[] = [];
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  let disposed = false;
  const result: OwnedWorldSurfaceMaterials = {
    materials,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const [mesh, source] of originals) mesh.material = source;
      for (const material of materials) material.dispose();
    },
  };
  if (!selections.length) return result;
  if (!bindings?.length) refuse(assetRef, '', 'no declared surface capability');
  const ids = new Map<string, Binding>();
  const pairs = new Set<string>();
  for (const binding of bindings) {
    const pair = JSON.stringify([binding.node, binding.material]);
    if (ids.has(binding.id) || pairs.has(pair))
      refuse(assetRef, binding.id, 'duplicate surface ownership');
    ids.set(binding.id, binding);
    pairs.add(pair);
  }
  const selected = new Set<string>();
  const claimed = new Map<THREE.Mesh, Set<number>>();
  const prepared = selections.map((selection) => {
    const fail = (message: string): never =>
      refuse(assetRef, selection.surfaceId, message);
    const binding = ids.get(selection.surfaceId);
    if (!binding || selected.has(selection.surfaceId))
      fail('unknown or duplicate selected surface');
    selected.add(selection.surfaceId);
    if (binding!.family !== selection.material.family)
      fail('incompatible material family');
    const found = resolveWorldSurfaceTargets(root, binding!, assetRef);
    for (const target of found) {
      const slots = claimed.get(target.mesh) ?? new Set<number>();
      if (slots.has(target.slot)) fail('overlapping primitive ownership');
      slots.add(target.slot);
      claimed.set(target.mesh, slots);
      validateMaps(target, selection, assetRef);
    }
    return { selection, found };
  });
  // Complete validation above, then allocate all material clones before any
  // assignment. Allocation failure still leaves the detached model unchanged.
  try {
    const changes = prepared.map(({ selection, found }) => {
      const source = found[0].source;
      const material = source.clone();
      materials.push(material);
      material.color.set(0xffffff);
      material.map = selection.maps.baseColor;
      material.normalMap = selection.maps.normal;
      material.normalScale.set(
        Math.sign(source.normalScale.x) * selection.material.normalScale[0],
        Math.sign(source.normalScale.y) * selection.material.normalScale[1]
      );
      material.roughness = selection.material.roughness;
      material.metalness = selection.material.metalness;
      material.roughnessMap = material.metalnessMap =
        selection.maps.metallicRoughness ?? null;
      material.aoMap = selection.maps.occlusion ?? null;
      material.aoMapIntensity = 1;
      material.emissive.set(0);
      material.emissiveMap = null;
      material.bumpMap = null;
      material.displacementMap = null;
      material.needsUpdate = true;
      return { found, material };
    });
    for (const { found, material } of changes) {
      for (const { mesh, slot } of found) {
        if (!originals.has(mesh)) originals.set(mesh, mesh.material);
        if (Array.isArray(mesh.material)) {
          const next = [...mesh.material];
          next[slot] = material;
          mesh.material = next;
        } else mesh.material = material;
      }
    }
    return result;
  } catch (error) {
    result.dispose();
    throw error;
  }
}
