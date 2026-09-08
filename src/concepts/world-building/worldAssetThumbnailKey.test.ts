import {
  GENERATED_WORLD_ASSETS,
  type GeneratedWorldAsset,
} from '@/generated/worldAssetCatalog';
import { describe, expect, it } from 'vitest';
import { worldAssetThumbnailKey } from './worldAssetThumbnailKey';

const ASSET =
  GENERATED_WORLD_ASSETS['dnd5e:props:dark-fortress:alchemy_tools_01']!;

describe('worldAssetThumbnailKey', () => {
  it('uses the exact asset ref and promoted GLB content hash', () => {
    expect(worldAssetThumbnailKey(ASSET)).toBe(
      JSON.stringify([ASSET.ref, ASSET.glbSha256])
    );

    const changed = {
      ...ASSET,
      glbSha256: 'replacement-content-hash',
    } satisfies GeneratedWorldAsset;
    expect(worldAssetThumbnailKey(changed)).not.toBe(
      worldAssetThumbnailKey(ASSET)
    );
  });
});
