import {
  resolveWorldAsset,
  type GeneratedWorldAsset,
} from '@/generated/worldAssetCatalog';
import type { WorldSurfaceMaterial } from './worldMaterialTypes';
export interface WorldSurfaceAsset {
  assetRef: string;
  glbSha256: string;
  bindings: NonNullable<GeneratedWorldAsset['surfaces']>;
}
/** Provider metadata for one material source. A Git pin is identity, not a
 * claim that an unmerged provider branch has been released. */
export interface WorldMaterialCatalog {
  kind: 'candidate' | 'pinned';
  providerCommit?: string;
  catalogSha256: string;
  materials: readonly WorldSurfaceMaterial[];
  surfaces: readonly WorldSurfaceAsset[];
}

/** Join independently pinned material resources and world surface declarations.
 * An asset tag alone never enrolls a face. Catalog absence remains unavailable,
 * not a silently substituted candidate/default material set. */
export function createPinnedWorldMaterialCatalog(input: {
  provider: { readonly commit: string; readonly catalogSha256: string | null };
  materials: readonly WorldSurfaceMaterial[];
  assets: Readonly<Record<string, GeneratedWorldAsset>>;
}): WorldMaterialCatalog | null {
  const { provider, materials, assets } = input;
  if (!/^[a-f0-9]{40}$/.test(provider.commit))
    throw new Error('Invalid material provider pin.');
  if (provider.catalogSha256 === null) {
    if (materials.length)
      throw new Error('Absent material catalog cannot carry resources.');
    return null;
  }
  if (!/^[a-f0-9]{64}$/.test(provider.catalogSha256))
    throw new Error('Invalid material catalog digest.');
  return {
    kind: 'pinned',
    providerCommit: provider.commit,
    catalogSha256: provider.catalogSha256,
    materials,
    surfaces: Object.values(assets)
      .filter((asset) => asset.surfaces)
      .map((asset) => ({
        assetRef: asset.ref,
        glbSha256: asset.glbSha256,
        bindings: asset.surfaces!,
      })),
  };
}

/** Defense at the dev HTTP boundary; publication/resource validation belongs to
 * the staging reader. No source path or arbitrary URL can enter a sampler. */
export function parseWorldMaterialPreview(
  value: unknown
): WorldMaterialCatalog {
  const input = value as WorldMaterialCatalog;
  const sha = (v: unknown): v is string =>
    typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  if (
    !input ||
    input.kind !== 'candidate' ||
    !sha(input.catalogSha256) ||
    !Array.isArray(input.materials) ||
    !Array.isArray(input.surfaces)
  )
    throw new Error('Invalid candidate material catalog.');
  const refs = new Set<string>();
  for (const row of input.materials) {
    if (
      !row ||
      typeof row.ref !== 'string' ||
      !/^dnd5e:material:[a-z0-9-]+:[a-z0-9_]+$/.test(row.ref) ||
      refs.has(row.ref) ||
      typeof row.displayName !== 'string' ||
      !row.displayName ||
      typeof row.family !== 'string' ||
      !row.family ||
      !Array.isArray(row.repeatMeters) ||
      row.repeatMeters.length !== 2 ||
      !row.repeatMeters.every(
        (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0
      ) ||
      !Array.isArray(row.normalScale) ||
      row.normalScale.length !== 2 ||
      !row.normalScale.every(Number.isFinite) ||
      ![row.roughness, row.metalness].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 1
      )
    )
      throw new Error('Invalid candidate material parameters.');
    refs.add(row.ref);
    for (const role of [
      'baseColor',
      'normal',
      'metallicRoughness',
      'occlusion',
    ] as const) {
      const image = row[role];
      if (!image && (role === 'metallicRoughness' || role === 'occlusion'))
        continue;
      if (
        !image ||
        !sha(image.sha256) ||
        image.url !==
          `/world-material-preview/images/${image.sha256}.png?v=${image.sha256}` ||
        ![image.sizeBytes, image.width, image.height].every(
          (n) => Number.isSafeInteger(n) && n > 0
        )
      )
        throw new Error('Invalid candidate image resource.');
    }
  }
  const assets = new Set<string>();
  for (const row of input.surfaces) {
    const asset = row && resolveWorldAsset(row.assetRef);
    if (
      !row ||
      !asset ||
      !sha(row.glbSha256) ||
      asset.glbSha256 !== row.glbSha256 ||
      assets.has(row.assetRef) ||
      !Array.isArray(row.bindings) ||
      !row.bindings.length
    )
      throw new Error(
        'Candidate surface geometry differs from the pinned asset.'
      );
    assets.add(row.assetRef);
    const ids = new Set<string>(),
      targets = new Set<string>();
    for (const binding of row.bindings) {
      if (
        !binding ||
        !binding.id ||
        ids.has(binding.id) ||
        !binding.node ||
        !binding.material ||
        !binding.family ||
        !['positive-z', 'negative-z'].includes(binding.side)
      )
        throw new Error('Invalid candidate surface binding.');
      const key = JSON.stringify([binding.node, binding.material]);
      if (targets.has(key))
        throw new Error('Overlapping candidate surface bindings.');
      ids.add(binding.id);
      targets.add(key);
    }
  }
  return input;
}
