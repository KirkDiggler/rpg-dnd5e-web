// @vitest-environment node
import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { WorldSurfaceMaterial } from './worldMaterialTypes';
import {
  applyWorldSurfaceMaterials,
  createWorldSurfaceSampler,
} from './worldSurfaceMaterials';

const bindings: NonNullable<GeneratedWorldAsset['surfaces']> = [
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
];
const image = {
  url: '/models/synty/world-materials/images/test.png',
  sha256: 'a'.repeat(64),
  sizeBytes: 20,
  width: 1,
  height: 1,
};
const finish: WorldSurfaceMaterial = {
  ref: 'dnd5e:material:test:gray',
  displayName: 'Gray',
  family: 'masonry',
  baseColor: image,
  normal: image,
  repeatMeters: [3.3, 3.3],
  normalScale: [0.8, 0.6],
  roughness: 0.5,
  metalness: 0,
};
function maps(channel = 2) {
  const source = new THREE.Texture();
  return {
    baseColor: createWorldSurfaceSampler(source, {
      role: 'baseColor',
      channel,
    }),
    normal: createWorldSurfaceSampler(source, { role: 'normal', channel }),
  };
}
function fixture() {
  const source = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'WallBody_v1';
  source.add(body);
  const make = (name: string) => {
    const material = new THREE.MeshStandardMaterial();
    material.name = name;
    material.map = new THREE.Texture();
    material.map.channel = 2;
    material.normalMap = new THREE.Texture();
    material.normalMap.channel = 2;
    material.normalScale.set(1, -1);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
    const mesh = new THREE.Mesh(geometry, material);
    body.add(mesh);
    return mesh;
  };
  const front = make('Front'),
    back = make('Back'),
    cap = make('Cap');
  // Like GLTFLoader: several primitives may share the one declared material.
  const extra = front.clone();
  body.add(extra);
  const root = source.clone(true);
  const primitives = root.children[0].children as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >[];
  const selections = [{ surfaceId: 'front', material: finish, maps: maps() }];
  return {
    source,
    root,
    front,
    back,
    cap,
    primitives,
    selections,
    assetRef: 'dnd5e:env:test:wall',
    bindings,
  };
}

describe('bound instance materials', () => {
  it('changes all named front primitives atomically without mutating back, caps, source or geometry', () => {
    const f = fixture();
    const result = applyWorldSurfaceMaterials(f);
    const front = f.primitives[0],
      extra = f.primitives[3];
    expect(front.material).not.toBe(f.front.material);
    expect(extra.material).toBe(front.material);
    expect(front.geometry).toBe(f.front.geometry);
    expect(front.material.map).toBe(f.selections[0].maps.baseColor);
    expect(front.material.normalMap).toBe(f.selections[0].maps.normal);
    expect(front.material.normalScale.toArray()).toEqual([0.8, -0.6]);
    expect(front.material.color.getHex()).toBe(0xffffff);
    expect(front.material.roughness).toBe(0.5);
    expect(front.material.metalness).toBe(0);
    expect(f.primitives[1].material).toBe(f.back.material);
    expect(f.primitives[2].material).toBe(f.cap.material);
    expect(f.front.material.map).not.toBe(front.material.map);
    const disposed = vi.spyOn(front.material, 'dispose');
    const imageDisposed = vi.spyOn(f.selections[0].maps.normal, 'dispose');
    result.dispose();
    result.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(imageDisposed).not.toHaveBeenCalled();
    expect(front.material).toBe(f.front.material);
    expect(extra.material).toBe(f.front.material);
  });

  it('keeps opposite selections independent and sets optional packed maps together', () => {
    const f = fixture();
    const data = createWorldSurfaceSampler(new THREE.Texture(), {
      role: 'data',
      channel: 2,
    });
    const selected = { ...finish, metallicRoughness: image, occlusion: image };
    const applied = applyWorldSurfaceMaterials({
      ...f,
      selections: [
        {
          surfaceId: 'front',
          material: selected,
          maps: { ...maps(), metallicRoughness: data, occlusion: data },
        },
        {
          surfaceId: 'back',
          material: { ...finish, ref: 'dnd5e:material:test:other' },
          maps: maps(),
        },
      ],
    });
    expect(f.primitives[0].material.roughnessMap).toBe(data);
    expect(f.primitives[0].material.metalnessMap).toBe(data);
    expect(f.primitives[0].material.aoMap).toBe(data);
    expect(f.primitives[1].material.roughnessMap).toBeNull();
    expect(f.primitives[1].material.map).not.toBe(f.primitives[0].material.map);
    applied.dispose();
  });

  it.each([
    'node',
    'material',
    'ambiguous-node',
    'ambiguous-material',
    'overlap',
    'unknown-id',
    'family',
    'missing-normal',
    'wrong-channel',
    'wrong-color-space',
    'wrong-transform',
    'missing-optional',
    'missing-uv',
    'tangent',
    'zero-basis',
    'shader-hook',
  ])('refuses %s before changing any target', (kind) => {
    const f = fixture();
    const choices = f.selections;
    const declarations = bindings.map((binding) => ({ ...binding }));
    if (kind === 'node') declarations[0].node = 'missing';
    if (kind === 'material') declarations[0].material = 'missing';
    if (kind === 'ambiguous-node') f.root.add(f.root.children[0].clone(true));
    if (kind === 'ambiguous-material')
      f.primitives[3].material = f.front.material.clone();
    if (kind === 'overlap') declarations[1].material = 'Front';
    if (kind === 'unknown-id') choices[0].surfaceId = 'unknown';
    if (kind === 'family') choices[0].material = { ...finish, family: 'wood' };
    if (kind === 'missing-normal')
      Object.assign(choices[0].maps, { normal: undefined });
    if (kind === 'wrong-channel') choices[0].maps.normal.channel = 1;
    if (kind === 'wrong-color-space')
      choices[0].maps.normal.colorSpace = THREE.SRGBColorSpace;
    if (kind === 'wrong-transform') choices[0].maps.normal.offset.x = 0.5;
    if (kind === 'missing-optional')
      choices[0].material = { ...finish, occlusion: image };
    if (kind === 'missing-uv')
      f.primitives[0].geometry = new THREE.PlaneGeometry(1, 1);
    if (kind === 'tangent')
      f.primitives[0].geometry = f.primitives[0].geometry
        .clone()
        .setAttribute(
          'tangent',
          new THREE.Float32BufferAttribute(new Array(16).fill(1), 4)
        );
    if (kind === 'zero-basis') f.primitives[0].material.normalScale.y = 0;
    if (kind === 'shader-hook')
      f.primitives[0].material.onBeforeCompile = () => undefined;
    const prior = f.primitives.map((mesh) => mesh.material);
    expect(() =>
      applyWorldSurfaceMaterials({ ...f, bindings: declarations })
    ).toThrow(/surface/i);
    expect(f.primitives.map((mesh) => mesh.material)).toEqual(prior);
  });

  it('does not partially apply a valid front when the second selection fails', () => {
    const f = fixture();
    const prior = f.primitives.map((mesh) => mesh.material);
    expect(() =>
      applyWorldSurfaceMaterials({
        ...f,
        selections: [
          ...f.selections,
          {
            surfaceId: 'back',
            material: { ...finish, family: 'wood' },
            maps: maps(),
          },
        ],
      })
    ).toThrow(/family/);
    expect(f.primitives.map((mesh) => mesh.material)).toEqual(prior);
  });

  it('does nothing without a selection and does not infer capability', () => {
    const f = fixture();
    expect(
      applyWorldSurfaceMaterials({ ...f, selections: [] }).materials
    ).toEqual([]);
    expect(() =>
      applyWorldSurfaceMaterials({ ...f, bindings: undefined })
    ).toThrow(/surface/);
  });

  it('handles named material slots without modifying the original material array', () => {
    const f = fixture();
    const geometry = new THREE.BoxGeometry();
    geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
    const originals = [f.front.material, f.back.material, f.cap.material];
    // Box has six groups; map each pair to one slot.
    geometry.groups.forEach((group, index) => {
      group.materialIndex = Math.floor(index / 2);
    });
    const mesh = new THREE.Mesh(geometry, originals);
    mesh.name = 'WallBody_v1';
    const root = new THREE.Group();
    root.add(mesh);
    const result = applyWorldSurfaceMaterials({ ...f, root });
    expect(mesh.material).not.toBe(originals);
    expect(mesh.material[0]).not.toBe(originals[0]);
    expect(mesh.material.slice(1)).toEqual(originals.slice(1));
    result.dispose();
    expect(mesh.material).toBe(originals);
  });
});

describe('role-specific sampler creation', () => {
  it('shares immutable pixels, not mutable role/channel/transform configuration', () => {
    const source = new THREE.Texture();
    source.channel = 0;
    source.offset.set(0.2, 0.3);
    const color = createWorldSurfaceSampler(source, {
      role: 'baseColor',
      channel: 2,
    });
    const data = createWorldSurfaceSampler(source, {
      role: 'normal',
      channel: 1,
    });
    expect(color.source).toBe(source.source);
    expect(data.source).toBe(source.source);
    expect(color.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(data.colorSpace).toBe(THREE.NoColorSpace);
    expect(color.channel).toBe(2);
    expect(data.channel).toBe(1);
    expect(color.flipY).toBe(false);
    expect(color.wrapS).toBe(THREE.RepeatWrapping);
    expect(color.offset.toArray()).toEqual([0, 0]);
    expect(source.offset.toArray()).toEqual([0.2, 0.3]);
    expect(source.channel).toBe(0);
  });
  it.each([-1, 4, 0.5, NaN])('refuses unsupported channel %s', (channel) => {
    expect(() =>
      createWorldSurfaceSampler(new THREE.Texture(), {
        role: 'normal',
        channel,
      })
    ).toThrow(/channel/);
  });
});
