import type { GeneratedNpcAppearance } from '@/generated/npcAppearanceCatalog';

/** Exact standing-model identity for the palette-local thumbnail cache. This
 * mirrors the generated world-asset convention: a stable ref names the asset,
 * and the promoted content hash invalidates a stale rendered image. */
export function npcAppearanceThumbnailKey(
  appearance: GeneratedNpcAppearance
): string {
  return JSON.stringify([appearance.assetRef, appearance.standingSha256]);
}
