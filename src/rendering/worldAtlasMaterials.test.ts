import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyWorldAtlasMaterials } from './worldAtlasMaterials';
import type {
  WorldAtlasBinding,
  WorldAtlasMaterial,
} from './worldMaterialTypes';

const REF = 'dnd5e:env:fantasy-kingdom:house_wall_05';
const SHA = 'a'.repeat(64);
function fixture() {
  const root = new THREE.Group();
  const node = new THREE.Group();
  node.name = 'HouseWall';
  root.add(node);
  const map = new THREE.DataTexture(new Uint8Array([76, 66, 56, 255]), 1, 1);
  map.name = 'authored atlas';
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.MirroredRepeatWrapping;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestMipmapNearestFilter;
  map.offset.set(0.1, 0.2);
  map.repeat.set(2, 3);
  map.rotation = 0.25;
  map.updateMatrix();
  const material = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.7,
    metalness: 0.2,
    opacity: 0.8,
    color: 0xeeeecc,
  });
  material.name = 'SyntyAtlas';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), material);
  node.add(mesh);
  const fixedMaterial = new THREE.MeshStandardMaterial({ color: 0x334455 });
  fixedMaterial.name = 'Glass';
  const fixed = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fixedMaterial);
  node.add(fixed);
  const binding: WorldAtlasBinding = {
    assetRef: REF,
    glbSha256: SHA,
    surfaces: [
      {
        id: 'atlas',
        node: 'HouseWall',
        material: 'SyntyAtlas',
        texCoord: 0,
        defaultBaseColorSha256: 'b'.repeat(64),
        sampler: {
          wrapS: 10497,
          wrapT: 33648,
          magFilter: 9728,
          minFilter: 9984,
        },
        compatibleFamilies: ['kingdom-main-atlas'],
        suggestedCollections: [
          'dnd5e:material-collection:fantasy-kingdom:main_atlas',
        ],
      },
    ],
  };
  return { root, mesh, fixed, material, map, binding };
}
function choice(id: string, rgb: number[]) {
  const texture = new THREE.DataTexture(new Uint8Array([...rgb, 255]), 1, 1);
  const material: WorldAtlasMaterial = {
    ref: `dnd5e:material:fantasy-kingdom:atlas_${id}`,
    displayName: id,
    family: 'kingdom-main-atlas',
    mapping: 'authored-uv',
    normal: null,
    emissive: null,
    baseColor: {
      url: '/verified.png',
      sha256: 'c'.repeat(64),
      sizeBytes: 1,
      width: 1,
      height: 1,
    },
  };
  return { surfaceId: 'atlas', material, texture };
}
const drawn = (root: THREE.Object3D) =>
  root.getObjectByName('HouseWall')!.children[0] as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;

describe('instance-owned authored-UV atlas choice', () => {
  it('gives two placements independent looks while preserving UVs, trim and cached originals', () => {
    const f = fixture(),
      a = f.root.clone(true),
      b = f.root.clone(true);
    const first = choice('01_a', [20, 40, 60]),
      second = choice('04_c', [90, 120, 150]);
    const uv = Array.from(f.mesh.geometry.getAttribute('uv').array),
      pixels = f.map.source.data;
    const x = applyWorldAtlasMaterials({
      assetRef: REF,
      glbSha256: SHA,
      root: a,
      binding: f.binding,
      selections: [first],
    });
    const y = applyWorldAtlasMaterials({
      assetRef: REF,
      glbSha256: SHA,
      root: b,
      binding: f.binding,
      selections: [second],
    });
    expect(drawn(a).material.map!.source).toBe(first.texture.source);
    expect(drawn(b).material.map!.source).toBe(second.texture.source);
    expect(drawn(a).material).not.toBe(drawn(b).material);
    expect(f.mesh.material).toBe(f.material);
    expect(f.material.map).toBe(f.map);
    expect(f.map.source.data).toBe(pixels);
    expect(drawn(a).geometry).toBe(f.mesh.geometry);
    expect(drawn(b).geometry).toBe(f.mesh.geometry);
    expect(Array.from(drawn(a).geometry.getAttribute('uv').array)).toEqual(uv);
    expect(
      (a.getObjectByName('HouseWall')!.children[1] as THREE.Mesh).material
    ).toBe(f.fixed.material);
    expect(drawn(a).material.roughness).toBe(0.7);
    expect(drawn(a).material.metalness).toBe(0.2);
    expect(drawn(a).material.opacity).toBe(0.8);
    expect(drawn(a).material.color).toEqual(f.material.color);
    expect(drawn(a).material.normalMap).toBeNull();
    expect(drawn(a).material.emissiveMap).toBeNull();
    const sampler = drawn(a).material.map!;
    expect(sampler).not.toBe(first.texture);
    expect(sampler).not.toBe(f.map);
    expect(sampler.channel).toBe(f.map.channel);
    expect(sampler.wrapS).toBe(f.map.wrapS);
    expect(sampler.wrapT).toBe(f.map.wrapT);
    expect(sampler.magFilter).toBe(f.map.magFilter);
    expect(sampler.minFilter).toBe(f.map.minFilter);
    expect(sampler.matrix).toEqual(f.map.matrix);
    expect(sampler.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(sampler.flipY).toBe(false);
    expect(first.texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(first.texture.flipY).toBe(false);
    x.dispose();
    expect(drawn(a).material).toBe(f.material);
    expect(drawn(b).material.map!.source).toBe(second.texture.source);
    y.dispose();
    expect(drawn(b).material).toBe(f.material);
  });

  it('Original is inert and disposal only releases owned materials/samplers once', () => {
    const f = fixture();
    const none = applyWorldAtlasMaterials({
      assetRef: REF,
      glbSha256: SHA,
      root: f.root,
      selections: [],
    });
    expect(f.mesh.material).toBe(f.material);
    expect(none.materials).toEqual([]);
    none.dispose();
    const selected = choice('04_c', [80, 90, 100]);
    let cachedDisposed = 0,
      sourceDisposed = 0,
      ownedDisposed = 0;
    f.map.addEventListener('dispose', () => cachedDisposed++);
    selected.texture.addEventListener('dispose', () => sourceDisposed++);
    const owned = applyWorldAtlasMaterials({
      assetRef: REF,
      glbSha256: SHA,
      root: f.root,
      binding: f.binding,
      selections: [selected],
    });
    for (const material of owned.materials)
      material.addEventListener('dispose', () => ownedDisposed++);
    for (const sampler of owned.samplers)
      sampler.addEventListener('dispose', () => ownedDisposed++);
    owned.dispose();
    owned.dispose();
    expect(ownedDisposed).toBe(2);
    expect(cachedDisposed).toBe(0);
    expect(sourceDisposed).toBe(0);
    expect(f.mesh.material).toBe(f.material);
  });

  it.each([
    'asset',
    'hash',
    'node',
    'channel',
    'sampler',
    'uv',
    'duplicate',
    'unknown',
  ])('refuses invalid %s before changing any target', (kind) => {
    const f = fixture(),
      input = {
        assetRef: REF,
        glbSha256: SHA,
        root: f.root,
        binding: structuredClone(f.binding),
        selections: [choice('01_a', [1, 2, 3])],
      };
    if (kind === 'asset') input.assetRef = 'dnd5e:env:test:other';
    if (kind === 'hash') input.glbSha256 = 'd'.repeat(64);
    if (kind === 'node') f.root.add(f.root.children[0].clone(true));
    if (kind === 'channel') f.map.channel = 1;
    if (kind === 'sampler') f.map.wrapS = THREE.ClampToEdgeWrapping;
    if (kind === 'uv') f.mesh.geometry.deleteAttribute('uv');
    if (kind === 'duplicate') input.selections.push(input.selections[0]);
    if (kind === 'unknown')
      input.selections.push({ ...input.selections[0], surfaceId: 'missing' });
    expect(() => applyWorldAtlasMaterials(input)).toThrow(/World atlas/);
    expect(f.mesh.material).toBe(f.material);
    expect(f.material.map).toBe(f.map);
  });
});
