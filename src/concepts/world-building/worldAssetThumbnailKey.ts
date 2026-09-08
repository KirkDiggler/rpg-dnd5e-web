import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';

/** Exact identity for one generated asset capture. The provider content hash
 * invalidates a ref's cached image whenever its promoted GLB bytes change. */
export function worldAssetThumbnailKey(asset: GeneratedWorldAsset): string {
  return JSON.stringify([asset.ref, asset.glbSha256]);
}
