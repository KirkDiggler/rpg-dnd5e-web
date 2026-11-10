import type { WorldAtlasCatalog } from './worldMaterialTypes';

/** Shared strict wire validator consumed by browser and Node tooling. */
export function parseWorldAtlasMetadata(input: {
  collections: unknown;
  bindings: unknown;
  atlasRefs: Set<string>;
}): Pick<WorldAtlasCatalog, 'collections' | 'bindings'>;
