import * as THREE from 'three';
import { expandPartBindings } from './assetHeightInstance';
import { copyMaterialChannelAdjustments } from './materialChannelAdjustments';
import type {
  MaterialChannelAdjustment,
  MaterialChannelBinding,
  MaterialChannelTarget,
} from './materialChannelTypes';
import {
  resolveMaterialChannelValues,
  type MaterialChannelSource,
  type MaterialChannelValues,
} from './materialChannelValues';
import { parseMaterialChannelBindings } from './worldAtlasCatalogSchema.mjs';
import {
  resolveWorldSurfaceTargets,
  type WorldSurfaceTarget,
} from './worldSurfaceMaterials';

/** Transient provider identity and captured intent; never saved as a second registry. */
export interface MaterialChannelTreatment {
  readonly assetRef: string;
  readonly representation: MaterialChannelBinding['representation'];
  readonly glbSha256: string;
  readonly binding?: MaterialChannelBinding;
  readonly adjustments: readonly MaterialChannelAdjustment[];
}
export interface ResolvedMaterialChannelTarget {
  readonly target: MaterialChannelTarget;
  readonly adjustment: MaterialChannelAdjustment;
  readonly slots: readonly WorldSurfaceTarget[];
}

/** Resolve on pristine materials before complete-look or overlay treatment.
 * Height aliases come only from the existing instance assembler. NPC owners may
 * map pristine loader meshes to their already-owned clone hierarchy. */
export function resolveMaterialChannelTargets(input: {
  root: THREE.Object3D;
  treatment: MaterialChannelTreatment;
  nodeCopies?: ReadonlyMap<string, readonly string[]>;
  meshBySource?: ReadonlyMap<THREE.Mesh, THREE.Mesh>;
}): ResolvedMaterialChannelTarget[] {
  const { treatment } = input;
  const adjustments = copyMaterialChannelAdjustments(treatment.adjustments);
  if (!adjustments.length) return [];
  const supplied = treatment.binding;
  if (!supplied)
    throw Error('Material channels: no verified binding for captured intent.');
  if (
    supplied.assetRef !== treatment.assetRef ||
    supplied.representation !== treatment.representation ||
    supplied.glbSha256 !== treatment.glbSha256
  )
    throw Error(
      'Material channels: provider identity/representation/hash mismatch.'
    );
  const binding = parseMaterialChannelBindings([supplied])[0];
  const claimed = new Map<THREE.Mesh, Set<number>>();
  const resolved = new Map<
    string,
    { target: MaterialChannelTarget; slots: WorldSurfaceTarget[] }
  >();
  for (const target of binding.targets) {
    const slots = target.selectors.flatMap((selector) => {
      const expanded = expandPartBindings(
        [{ id: target.id, ...selector }],
        input.nodeCopies ?? new Map()
      );
      return expanded.bindings.flatMap((part) =>
        resolveWorldSurfaceTargets(input.root, part, treatment.assetRef)
      );
    });
    for (const slot of slots) {
      const used = claimed.get(slot.mesh) ?? new Set<number>();
      if (used.has(slot.slot))
        throw Error('Material channels: overlapping primitive ownership.');
      used.add(slot.slot);
      claimed.set(slot.mesh, used);
    }
    resolved.set(target.id, {
      target,
      slots: slots.map((slot) => {
        if (!input.meshBySource) return slot;
        const mesh = input.meshBySource.get(slot.mesh);
        if (!mesh)
          throw Error(
            'Material channels: pristine mesh has no owned counterpart.'
          );
        return { ...slot, mesh };
      }),
    });
  }
  return adjustments.map((adjustment) => {
    const found = resolved.get(adjustment.targetId);
    if (!found)
      throw Error(`Material channels: unknown target ${adjustment.targetId}.`);
    return { ...found, adjustment };
  });
}

export function materialChannelSource(
  material: THREE.MeshStandardMaterial
): MaterialChannelSource {
  return {
    normalScale: [material.normalScale.x, material.normalScale.y],
    hasNormalMap: !!material.normalMap,
    emissive: [material.emissive.r, material.emissive.g, material.emissive.b],
    emissiveIntensity: material.emissiveIntensity,
    hasEmissiveMap: !!material.emissiveMap,
  };
}

export interface MaterialChannelWrite {
  readonly targetId: string;
  readonly mesh: THREE.Mesh;
  readonly slot: number;
  readonly material: THREE.MeshStandardMaterial;
  readonly values: MaterialChannelValues;
}

/** Plan all numeric writes before changing any material. NPCs supply their
 * existing immutable snapshots, not last frame's adjusted/overlaid values. */
export function planMaterialChannelWrites(input: {
  targets: readonly ResolvedMaterialChannelTarget[];
  sourceForMaterial?: (
    material: THREE.MeshStandardMaterial
  ) => MaterialChannelSource;
}): MaterialChannelWrite[] {
  return input.targets.flatMap(({ target, adjustment, slots }) =>
    slots.map(({ mesh, slot }) => {
      const material = Array.isArray(mesh.material)
        ? mesh.material[slot]
        : mesh.material;
      if (
        !(material instanceof THREE.MeshStandardMaterial) ||
        material.type !== 'MeshStandardMaterial'
      )
        throw Error(
          'Material channels: effective material must be MeshStandardMaterial.'
        );
      if (
        material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
        material.customProgramCacheKey !==
          THREE.Material.prototype.customProgramCacheKey
      )
        throw Error(
          'Material channels: apply before custom shader/lighting treatment.'
        );
      return {
        targetId: target.id,
        mesh,
        slot,
        material,
        values: resolveMaterialChannelValues({
          source:
            input.sourceForMaterial?.(material) ??
            materialChannelSource(material),
          capabilities: target,
          adjustment,
        }),
      };
    })
  );
}

/** Material-only stage of the existing world owner. Owns clones, not textures,
 * geometry or a competing effect; remove downstream overlays before disposal. */
export function applyWorldMaterialChannels(input: {
  targets: readonly ResolvedMaterialChannelTarget[];
}): { materials: readonly THREE.MeshStandardMaterial[]; dispose(): void } {
  const planned = planMaterialChannelWrites(input);
  const materials: THREE.MeshStandardMaterial[] = [];
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const byTarget = new Map<
    string,
    Map<THREE.Material, THREE.MeshStandardMaterial>
  >();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    originals.forEach((source, mesh) => {
      mesh.material = source;
    });
    materials.forEach((material) => material.dispose());
  };
  try {
    const prepared = planned.map((write) => {
      const bySource =
        byTarget.get(write.targetId) ??
        new Map<THREE.Material, THREE.MeshStandardMaterial>();
      let material = bySource.get(write.material);
      if (!material) {
        material = write.material.clone();
        materials.push(material);
        material.normalScale.set(...write.values.normalScale);
        material.emissiveIntensity = write.values.emissiveIntensity;
        bySource.set(write.material, material);
        byTarget.set(write.targetId, bySource);
      }
      return { ...write, material };
    });
    for (const { mesh, slot, material } of prepared) {
      if (!originals.has(mesh)) originals.set(mesh, mesh.material);
      if (Array.isArray(mesh.material)) {
        const next = [...mesh.material];
        next[slot] = material;
        mesh.material = next;
      } else mesh.material = material;
    }
    return { materials, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
