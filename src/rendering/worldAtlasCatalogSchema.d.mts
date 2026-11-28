import type { WorldAtlasCatalog } from './worldMaterialTypes';

/** Shared strict wire validator consumed by browser and Node tooling. */
export function parseWorldAtlasMetadata(input: {
  collections: unknown;
  bindings: unknown;
  atlasRefs: Set<string>;
  atlasFamilies: Set<string>;
  atlasMaterialFamilies?: ReadonlyMap<string, string>;
}): Pick<WorldAtlasCatalog, 'collections' | 'bindings'>;

/** Detached schema4 channel metadata; never a claim about loaded geometry. */
export function parseMaterialChannelBindings(
  value: unknown
): import('./materialChannelTypes').MaterialChannelBinding[];
