import { WorldPropModel } from '@/concepts/world-building/WorldPropModel';
import { createTestLightingBinding } from '@/rendering/regionLightingTestFixtures';
import {
  createWorldSurfaceSampler,
  type WorldSurfaceSelection,
} from '@/rendering/worldSurfaceMaterials';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PROP_KEYS } from './propManifest';
import { WorldAssetModel } from './WorldAssetModel';

const state = vi.hoisted(() => ({
  scene: null as THREE.Group | null,
  textures: new Map<string, THREE.Texture>(),
}));
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useLoader: (_loader: unknown, urls: string[]) =>
    urls.map((url) => state.textures.get(url)!),
}));
vi.mock('@react-three/drei', () => ({
  useGLTF: () => ({ scene: state.scene }),
}));
vi.mock('@/generated/worldAssetCatalog', () => ({
  resolveWorldAsset: (ref: string) => ({
    ref,
    url: '/synthetic.glb',
    boundsMeters: [3, 2.25, 0.3],
    tags: ['wall-miter-90'],
    surfaces:
      ref === 'unenrolled'
        ? undefined
        : [
            {
              id: 'front',
              node: 'WallBody_v1',
              material: 'Front',
              side: 'positive-z',
              family: 'masonry',
            },
            {
              id: 'back',
              node: 'WallBody_v1',
              material: 'Back',
              side: 'negative-z',
              family: 'masonry',
            },
          ],
  }),
}));
function fixture() {
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.name = 'WallBody_v1';
  root.add(body);
  const face = (name: string, z: number) => {
    const geometry = new THREE.PlaneGeometry(4, 3).translate(0, 1.5, z);
    geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
    const material = new THREE.MeshStandardMaterial();
    material.name = name;
    material.map = new THREE.Texture();
    material.map.channel = 2;
    material.normalMap = new THREE.Texture();
    material.normalMap.channel = 2;
    material.normalScale.set(1, -1);
    const mesh = new THREE.Mesh(geometry, material);
    body.add(mesh);
    return mesh;
  };
  const front = face('Front', 0.2),
    back = face('Back', -0.2);
  const cap = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 0.4).rotateX(Math.PI / 2).translate(0, 3, 0),
    new THREE.MeshStandardMaterial()
  );
  body.add(cap);
  for (const [name, position] of Object.entries({
    Start: [-2, 0, 0],
    End: [2, 0, 0],
    Front: [0, 0, 0.2],
    Back: [0, 0, -0.2],
    Top: [0, 3, 0],
  })) {
    const marker = new THREE.Object3D();
    marker.name = `WallFit_v1_${name}`;
    marker.position.fromArray(position);
    root.add(marker);
  }
  state.scene = root;
  const image = {
    url: '/test.png',
    sha256: 'a'.repeat(64),
    sizeBytes: 10,
    width: 1,
    height: 1,
  };
  const selection = (): WorldSurfaceSelection => ({
    surfaceId: 'front',
    material: {
      ref: 'dnd5e:material:test:gray',
      displayName: 'Gray',
      family: 'masonry',
      baseColor: image,
      normal: image,
      repeatMeters: [3.3, 3.3],
      normalScale: [0.8, 0.6],
      roughness: 0.5,
      metalness: 0,
    },
    maps: {
      baseColor: createWorldSurfaceSampler(new THREE.Texture(), {
        role: 'baseColor',
        channel: 2,
      }),
      normal: createWorldSurfaceSampler(new THREE.Texture(), {
        role: 'normal',
        channel: 2,
      }),
    },
  });
  return { front, back, cap, selection };
}

describe('surface materials through the shared fitted model leaf', () => {
  it('does not silently discard a finish on the legacy prop path', () => {
    const f = fixture();
    expect(() =>
      WorldPropModel({
        entry: {
          source: 'legacy',
          ref: 'test',
          label: 'Test',
          supportsDecoration: false,
          role: 'decor',
          variant: Object.values(PROP_KEYS)[0][0],
        },
        position: [0, 0, 0],
        rotationY: 0,
        surfaceSelections: [f.selection()],
      })
    ).toThrow(/provider-enrolled/);
  });

  it('fits first, updates paired finishes without reallocating geometry, and composes lighting/memory', async () => {
    const f = fixture(),
      selections = [f.selection()];
    const props = {
      assetRef: 'enrolled',
      position: [0, 0, 0] as [number, number, number],
      plainWallFit: { width: 8, height: 3, depth: 0.4, end: -1 },
    };
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel {...props} surfaceSelections={selections} />
    );
    const root = renderer.scene.findByProps({ name: 'world-asset-model' })
      .instance as THREE.Group;
    const meshes = root.getObjectByName('WallBody_v1')!.children as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >[];
    const fittedGeometry = meshes[0].geometry;
    expect(fittedGeometry).not.toBe(f.front.geometry);
    expect(meshes[0].material.map).toBe(selections[0].maps.baseColor);
    expect(meshes[0].material.normalMap).toBe(selections[0].maps.normal);
    expect(meshes[0].material.normalScale.toArray()).toEqual([0.8, -0.6]);
    expect(meshes[1].material).toBe(f.back.material);
    expect(meshes[2].material).toBe(f.cap.material);
    const first = meshes[0].material,
      disposed = vi.spyOn(first, 'dispose');
    const sourceDispose = vi.spyOn(f.front.material, 'dispose');
    const mapsDispose = vi.spyOn(selections[0].maps.baseColor, 'dispose');
    const next = [f.selection()];
    await renderer.update(
      <WorldAssetModel {...props} surfaceSelections={next} />
    );
    expect(disposed).toHaveBeenCalledOnce();
    expect(meshes[0].geometry).toBe(fittedGeometry);
    expect(meshes[0].material.map).toBe(next[0].maps.baseColor);
    const binding = createTestLightingBinding();
    await renderer.update(
      <WorldAssetModel
        {...props}
        surfaceSelections={next}
        remembered
        visualLighting={binding}
      />
    );
    expect(meshes[0].material.map).toBe(next[0].maps.baseColor);
    expect(meshes[0].material.customProgramCacheKey()).toContain(
      'STUDIO_REGION_LIGHTING'
    );
    await renderer.update(
      <WorldAssetModel {...props} surfaceSelections={[]} />
    );
    expect(meshes[0].material).toBe(f.front.material);
    await renderer.unmount();
    binding.dispose();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(mapsDispose).not.toHaveBeenCalled();
  });

  it('loads a complete finish plan, maps the fitted UV channel and owns samplers without changing the texture cache', async () => {
    const f = fixture(),
      sourceTexture = new THREE.Texture(),
      selected = f.selection();
    state.textures.set('/test.png', sourceTexture);
    const disposed = vi.spyOn(sourceTexture, 'dispose');
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef="enrolled"
        position={[0, 0, 0]}
        plainWallFit={{ width: 8, height: 3, depth: 0.4, offset: 4 }}
        surfacePlans={[
          {
            material: selected.material,
            chart: {
              surfaceId: 'front',
              phase: -0.2,
              direction: 1,
              repeat: [2, 3],
              elevation: 0,
            },
          },
        ]}
      />
    );
    const root = renderer.scene.findByProps({ name: 'world-asset-model' })
      .instance as THREE.Group;
    const mesh = root.getObjectByName('WallBody_v1')!.children[0] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    expect(mesh.material.map).not.toBe(sourceTexture);
    expect(mesh.material.map!.source).toBe(sourceTexture.source);
    expect(mesh.material.map!.channel).toBe(2);
    expect(mesh.material.normalMap!.channel).toBe(2);
    expect(mesh.material.normalMap).not.toBe(mesh.material.map);
    expect(mesh.material.normalScale.toArray()).toEqual([0.8, -0.6]);
    expect(sourceTexture.channel).toBe(0);
    expect(sourceTexture.flipY).toBe(true);
    const sampler = mesh.material.normalMap!,
      samplerDispose = vi.spyOn(sampler, 'dispose');
    expect(mesh.geometry.getAttribute('uv2').getY(0)).toBeCloseTo(-1);
    await renderer.unmount();
    expect(disposed).not.toHaveBeenCalled();
    expect(samplerDispose).toHaveBeenCalledOnce();
  });

  it('refuses a requested finish without provider surface enrollment', async () => {
    const f = fixture();
    await expect(
      ReactThreeTestRenderer.create(
        <WorldAssetModel
          assetRef="unenrolled"
          position={[0, 0, 0]}
          surfaceSelections={[f.selection()]}
        />
      )
    ).rejects.toThrow(/declared surface/);
  });
});
