import { resolveWorldAsset } from '@/generated/worldAssetCatalog';
import { createTestLightingBinding } from '@/rendering/regionLightingTestFixtures';
import type { WorldMaterialCatalogState } from '@/rendering/useWorldMaterialCatalog';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { WorldAssetModel } from './WorldAssetModel';
const state = vi.hoisted(() => ({
  scene: null as THREE.Group | null,
  texture: null as THREE.Texture | null,
  catalog: null as WorldMaterialCatalogState | null,
}));
vi.mock('@react-three/drei', () => ({
  useGLTF: () => ({ scene: state.scene }),
}));
vi.mock('@react-three/fiber', async (original) => ({
  ...(await original<typeof import('@react-three/fiber')>()),
  useLoader: () => [state.texture],
}));
vi.mock('@/rendering/useWorldMaterialCatalog', () => ({
  useWorldMaterialCatalog: () => state.catalog,
}));
it('renders a captured atlas choice through the shared model leaf, before memory/lighting, and restores Original', async () => {
  const ref = 'dnd5e:env:fantasy-kingdom:house_wall_05',
    asset = resolveWorldAsset(ref)!;
  const root = new THREE.Group(),
    source = new THREE.MeshStandardMaterial(),
    original = new THREE.Texture();
  original.wrapS = original.wrapT = THREE.RepeatWrapping;
  original.magFilter = THREE.NearestFilter;
  original.minFilter = THREE.NearestMipmapNearestFilter;
  original.flipY = false;
  original.colorSpace = THREE.SRGBColorSpace;
  source.name = 'SyntyAtlas';
  source.map = original;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), source);
  mesh.name = 'SM_Bld_House_Wall_05';
  root.add(mesh);
  state.scene = root;
  const selected = new THREE.Texture();
  state.texture = selected;
  const material = {
    ref: 'dnd5e:material:fantasy-kingdom:atlas_04_c',
    displayName: '04_C',
    family: 'kingdom-main-atlas',
    mapping: 'authored-uv' as const,
    normal: null,
    emissive: null,
    baseColor: {
      url: '/selected.png',
      sha256: 'b'.repeat(64),
      sizeBytes: 4,
      width: 1,
      height: 1,
    },
  };
  state.catalog = {
    status: 'ready',
    message: 'ready',
    catalog: {
      kind: 'pinned',
      catalogSha256: 'c'.repeat(64),
      materials: [],
      surfaces: [],
      atlas: {
        materials: [material],
        collections: [],
        bindings: [
          {
            assetRef: ref,
            glbSha256: asset.glbSha256,
            surfaces: [
              {
                id: 'atlas',
                node: mesh.name,
                material: source.name,
                texCoord: 0,
                defaultBaseColorSha256: 'a'.repeat(64),
                sampler: {
                  wrapS: 10497,
                  wrapT: 10497,
                  magFilter: 9728,
                  minFilter: 9984,
                },
                suggestedCollections: [],
              },
            ],
          },
        ],
      },
    },
  };
  const props = {
    assetRef: ref,
    position: [0, 0, 0] as [number, number, number],
    materialOverrides: [{ surfaceId: 'atlas', materialRef: material.ref }],
  };
  const renderer = await ReactThreeTestRenderer.create(
    <WorldAssetModel {...props} />
  );
  const rendered = () =>
    (
      renderer.scene.findByProps({ name: 'world-asset-model' })
        .instance as THREE.Group
    ).getObjectByName(mesh.name) as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
  expect(rendered().material.map!.source).toBe(selected.source);
  expect(rendered().geometry).toBe(mesh.geometry);
  expect(source.map).toBe(original);
  const lighting = createTestLightingBinding();
  await renderer.update(
    <WorldAssetModel {...props} remembered visualLighting={lighting} />
  );
  expect(rendered().material.map!.source).toBe(selected.source);
  expect(rendered().material.customProgramCacheKey()).toContain(
    'STUDIO_REGION_LIGHTING'
  );
  await renderer.update(<WorldAssetModel {...props} materialOverrides={[]} />);
  expect(rendered().material).toBe(source);
  expect(source.map).toBe(original);
  await renderer.unmount();
  lighting.dispose();
});
