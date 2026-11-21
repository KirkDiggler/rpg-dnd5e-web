import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { WorldAssetModel } from './WorldAssetModel';

const source = new THREE.Group(),
  body = new THREE.Group();
body.name = 'WallBody_v1';
source.add(body);
function part(name: string, base: number, height: number) {
  const group = new THREE.Group();
  group.name = name;
  group.position.y = base;
  body.add(group);
  // Honor the fixture's declared facade bindings even when no finish is selected.
  for (const [side, z] of [
    ['front', 0.25],
    ['back', -0.25],
  ] as const) {
    const geometry = new THREE.PlaneGeometry(5, height);
    if (z < 0) geometry.rotateY(Math.PI);
    geometry.translate(0, height / 2, z);
    const material = new THREE.MeshStandardMaterial({
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
    });
    material.name = `Masonry_${side}_0`;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}_${side}`;
    group.add(mesh);
  }
  return group;
}
const fixed = part('Wall_Frame', 0, 3.25).children[0] as THREE.Mesh;
part('Wall_Above', 3.25, 1.5);
part('Wall_Cap', 4.75, 0.25);
for (const [name, p] of Object.entries({
  Start: [-2.5, 0, 0],
  End: [2.5, 0, 0],
  Front: [0, 0, 0.25],
  Back: [0, 0, -0.25],
  Top: [0, 5, 0],
})) {
  const marker = new THREE.Object3D();
  marker.name = 'WallFit_v1_' + name;
  marker.position.fromArray(p);
  source.add(marker);
}
vi.mock('@react-three/drei', () => ({ useGLTF: () => ({ scene: source }) }));
it('the loaded shared fitter clips the fully assembled feature instead of scaling it into the visible half', async () => {
  const before = Array.from(fixed.geometry.getAttribute('position').array);
  const view = await ReactThreeTestRenderer.create(
    <WorldAssetModel
      assetRef="dnd5e:env:fantasy-kingdom:castle_wall_window_03"
      position={[0, 0, 0]}
      targetHeight={6}
      plainWallFit={{
        width: 3.75,
        height: 6,
        depth: 0.375,
        clipStart: 0,
        clipEnd: 1.875,
      }}
    />
  );
  const root = view.scene.findByProps({ name: 'world-asset-model' }).instance;
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  expect(bounds.min.x).toBeCloseTo(-1.875);
  expect(bounds.max.x).toBeCloseTo(0);
  expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(6);
  const frame = root.getObjectByName('Wall_Frame')!,
    cap = root.getObjectByName('Wall_Cap')!;
  expect(
    new THREE.Box3().setFromObject(frame, true).getSize(new THREE.Vector3()).y
  ).toBeCloseTo(2.4375);
  expect(
    new THREE.Box3().setFromObject(cap, true).getSize(new THREE.Vector3()).y
  ).toBeCloseTo(0.1875);
  expect(Array.from(fixed.geometry.getAttribute('position').array)).toEqual(
    before
  );
  await view.unmount();
});
