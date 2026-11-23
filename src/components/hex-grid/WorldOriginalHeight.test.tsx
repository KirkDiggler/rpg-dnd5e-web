import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WorldAssetModel } from './WorldAssetModel';

// Synthetic geometry/UVs only. The declared provider profile is 3.25 fixed,
// 1.5 repeat and .25 cap in raw model units, shared runtime scale .75.
const source = new THREE.Group(),
  body = new THREE.Group();
body.name = 'WallBody_v1';
source.add(body);
const material = (name: string, channel: number) => {
  const map = new THREE.Texture(),
    normalMap = new THREE.Texture();
  for (const texture of [map, normalMap]) {
    texture.channel = channel;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  }
  const result = new THREE.MeshStandardMaterial({ map, normalMap });
  result.name = name;
  return result;
};
const front = material('Masonry_front_0', 2),
  back = material('Masonry_back_0', 2),
  trim = material('ProtectedTrim', 0);
for (const [name, base, height] of [
  ['Wall_Frame', 0, 3.25],
  ['Wall_Above', 3.25, 1.5],
  ['Wall_Cap', 4.75, 0.25],
] as const) {
  const part = new THREE.Group();
  part.name = name;
  part.position.y = base;
  body.add(part);
  for (const [side, mat] of [
    [1, front],
    [-1, back],
  ] as const) {
    const geometry = new THREE.PlaneGeometry(5, height);
    if (side < 0) geometry.rotateY(Math.PI);
    geometry.translate(0, height / 2, side * 0.25);
    const position = geometry.getAttribute('position'),
      uv = new THREE.Float32BufferAttribute(position.count * 2, 2);
    for (let i = 0; i < position.count; i++)
      uv.setXY(
        i,
        0.5 + (side * position.getX(i)) / 5,
        -(base + position.getY(i)) / 5
      );
    geometry.setAttribute('uv2', uv);
    const spare = geometry.getAttribute('uv');
    for (let i = 0; i < spare.count; i++) spare.setXY(i, 7, 9);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = `${name}_${side}`;
    part.add(mesh);
  }
}
const trimMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), trim);
trimMesh.name = 'UniqueTrim';
trimMesh.position.set(0, 1, 0.3);
source.getObjectByName('Wall_Frame')!.add(trimMesh);
for (const [name, coordinates] of Object.entries({
  Start: [-2.5, 0, 0],
  End: [2.5, 0, 0],
  Front: [0, 0, 0.25],
  Back: [0, 0, -0.25],
  Top: [0, 5, 0],
})) {
  const marker = new THREE.Object3D();
  marker.name = 'WallFit_v1_' + name;
  marker.position.fromArray(coordinates);
  source.add(marker);
}
vi.mock('@react-three/drei', () => ({ useGLTF: () => ({ scene: source }) }));
const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_window_03';

async function inspect(
  height: number,
  fitted = true,
  width = 3.75,
  offset = 0
) {
  const view = await ReactThreeTestRenderer.create(
    <WorldAssetModel
      assetRef={ref}
      position={[0, 0, 0]}
      targetHeight={height}
      plainWallFit={
        fitted ? { width, height, depth: 0.375, offset } : undefined
      }
    />
  );
  const root = view.scene.findByProps({ name: 'world-asset-model' }).instance;
  root.updateWorldMatrix(true, true);
  const samples: { y: number; u: number; v: number; spare: number[] }[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (
      !mesh.isMesh ||
      Array.isArray(mesh.material) ||
      mesh.material.name !== front.name
    )
      return;
    const pos = mesh.geometry.getAttribute('position'),
      uv = mesh.geometry.getAttribute('uv2'),
      spare = mesh.geometry.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3()
        .fromBufferAttribute(pos, i)
        .applyMatrix4(mesh.matrixWorld);
      samples.push({
        y: p.y - DUNGEON_SURFACE_Y,
        u: uv.getX(i),
        v: uv.getY(i),
        spare: [spare.getX(i), spare.getY(i)],
      });
    }
  });
  const unique = root.getObjectByName('UniqueTrim') as THREE.Mesh;
  const trimUV = Array.from(unique.geometry.getAttribute('uv').array);
  await view.unmount();
  return { samples, trimUV };
}

describe('Original maps on a configured height assembly', () => {
  it.each([3.75, 6, 5.25])(
    'keeps authored density/phase through repeat rows and one cap at height %s',
    async (height) => {
      const result = await inspect(height);
      expect(result.samples.length).toBeGreaterThan(0);
      for (const sample of result.samples) {
        expect(sample.v).toBeCloseTo(-sample.y / 3.75, 6);
        expect(sample.spare).toEqual([7, 9]);
      }
    }
  );
  it('keeps the fixed feature and unbound trim UVs unchanged when height changes', async () => {
    const before = await inspect(3.75),
      after = await inspect(6);
    expect(after.trimUV).toEqual(before.trimUV);
    expect(after.samples.filter((point) => point.y < 2.4375 - 1e-5)).toEqual(
      before.samples.filter((point) => point.y < 2.4375 - 1e-5)
    );
  });
  it('does not apply masonry width or phase changes to unbound atlas trim', async () => {
    const original = Array.from(trimMesh.geometry.getAttribute('uv').array);
    expect((await inspect(3.75, true, 5.25, 7)).trimUV).toEqual(original);
  });
  it('keeps the legacy proportional minimum including its single fixed cap', async () => {
    const view = await ReactThreeTestRenderer.create(
      <WorldAssetModel assetRef={ref} position={[0, 0, 0]} heightScale={0.25} />
    );
    const root = view.scene.findByProps({ name: 'world-asset-model' }).instance;
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    root.traverseVisible((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh)
        bounds.union(
          new THREE.Box3()
            .setFromBufferAttribute(
              mesh.geometry.getAttribute('position') as THREE.BufferAttribute
            )
            .applyMatrix4(mesh.matrixWorld)
        );
    });
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(2.625, 6);
    expect(root.getObjectByName('Wall_Above')!.visible).toBe(false);
    await view.unmount();
  });
  it('preserves the same declared Original chart for a placed prop without a wall fitter', async () => {
    const before = Array.from(trimMesh.geometry.getAttribute('uv').array);
    const result = await inspect(6, false);
    for (const sample of result.samples)
      expect(sample.v).toBeCloseTo(-sample.y / 3.75, 6);
    expect(Array.from(trimMesh.geometry.getAttribute('uv').array)).toEqual(
      before
    );
    const raw = source.getObjectByName('Wall_Above_1') as THREE.Mesh;
    expect(raw.geometry.getAttribute('uv2').getY(0)).toBeCloseTo(-4.75 / 5, 6);
  });
});
