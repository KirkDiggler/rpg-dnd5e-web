import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import type { WorldSurfaceMaterial } from '@/rendering/worldMaterialTypes';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorldMaterialCatalog } from './useWorldMaterialCatalog';
const pinned = vi.hoisted(() => ({
  provider: { commit: 'c'.repeat(40), catalogSha256: null as string | null },
  materials: [] as WorldSurfaceMaterial[],
}));
vi.mock('@/generated/worldMaterialCatalog', () => ({
  GENERATED_WORLD_MATERIAL_PROVIDER: pinned.provider,
  GENERATED_WORLD_MATERIALS: pinned.materials,
}));
const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01';
const image = {
  url: `/world-material-preview/images/${'a'.repeat(64)}.png?v=${'a'.repeat(64)}`,
  sha256: 'a'.repeat(64),
  sizeBytes: 10,
  width: 1,
  height: 1,
};
function candidate() {
  return {
    kind: 'candidate',
    catalogSha256: 'b'.repeat(64),
    materials: [
      {
        ref: 'dnd5e:material:test:gray',
        displayName: 'Gray',
        family: 'masonry',
        baseColor: { ...image },
        normal: { ...image },
        repeatMeters: [3.3, 3.3],
        normalScale: [1, 1],
        roughness: 0.5,
        metalness: 0,
      },
    ],
    surfaces: [
      {
        assetRef: ref,
        glbSha256: GENERATED_WORLD_ASSETS[ref].glbSha256,
        bindings: [
          {
            id: 'front',
            node: 'WallBody_v1',
            material: 'Masonry_Front',
            side: 'positive-z',
            family: 'masonry',
          },
        ],
      },
    ],
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  pinned.provider.catalogSha256 = null;
  pinned.materials.length = 0;
});
describe('explicit development material catalog loader', () => {
  it('uses pinned material records in production and joins only declared faces without fetching', () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_WORLD_MATERIAL_PREVIEW', '0');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    pinned.provider.catalogSha256 = 'd'.repeat(64);
    const source = candidate().materials[0];
    pinned.materials.push({
      ...source,
      repeatMeters: [3.3, 3.3],
      normalScale: [1, 1],
      baseColor: {
        ...source.baseColor,
        url: `/models/synty/world-materials/images/${source.baseColor.sha256}.png?v=${source.baseColor.sha256}`,
      },
      normal: {
        ...source.normal,
        url: `/models/synty/world-materials/images/${source.normal.sha256}.png?v=${source.normal.sha256}`,
      },
    });
    const { result } = renderHook(useWorldMaterialCatalog);
    expect(result.current.status).toBe('ready');
    expect(result.current.catalog?.kind).toBe('pinned');
    expect(result.current.catalog?.providerCommit).toBe(pinned.provider.commit);
    expect(result.current.catalog?.materials[0].normal.url).toMatch(
      /^\/models\/synty\/world-materials\//
    );
    expect(result.current.catalog?.surfaces).toEqual(
      Object.values(GENERATED_WORLD_ASSETS)
        .filter((asset) => asset.surfaces)
        .map((asset) => ({
          assetRef: asset.ref,
          glbSha256: asset.glbSha256,
          bindings: asset.surfaces,
        }))
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['production', 'test'])(
    'does not fetch private candidates in %s even with the flag present',
    (mode) => {
      vi.stubEnv('MODE', mode);
      vi.stubEnv('VITE_WORLD_MATERIAL_PREVIEW', '1');
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const { result } = renderHook(useWorldMaterialCatalog);
      expect(result.current.status).toBe('unavailable');
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it('loads the complete candidate with matching pinned geometry and leaves its release state explicit', async () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_WORLD_MATERIAL_PREVIEW', '1');
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(candidate())));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(useWorldMaterialCatalog);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.catalog?.kind).toBe('candidate');
    expect(result.current.message).toMatch(/not a published/);
    expect(fetch).toHaveBeenCalledWith('/world-material-preview/catalog.json', {
      cache: 'no-store',
    });
  });
  it.each([
    'missing',
    'external-image',
    'wrong-geometry',
    'bad-repeat',
    'duplicate',
  ])('reports %s without a partially usable catalog', async (kind) => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_WORLD_MATERIAL_PREVIEW', '1');
    const value = candidate();
    if (kind === 'external-image')
      value.materials[0].normal.url = 'https://example.test/image.png';
    if (kind === 'wrong-geometry') value.surfaces[0].glbSha256 = 'f'.repeat(64);
    if (kind === 'bad-repeat') value.materials[0].repeatMeters = [0, 1];
    if (kind === 'duplicate') value.materials.push({ ...value.materials[0] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(value), {
          status: kind === 'missing' ? 404 : 200,
        })
      )
    );
    const { result } = renderHook(useWorldMaterialCatalog);
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.catalog).toBeNull();
  });
});
