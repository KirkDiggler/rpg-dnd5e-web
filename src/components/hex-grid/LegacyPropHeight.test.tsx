import { WorldPropModel } from '@/concepts/world-building/WorldPropModel';
import type { LegacyWorldBuildingCatalogEntry } from '@/concepts/world-building/catalog';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { PropModel } from './PropModel';
const main = new THREE.Group(),
  companion = new THREE.Group();
const base = new THREE.Mesh(
  new THREE.BoxGeometry(1, 2, 1),
  new THREE.MeshStandardMaterial()
);
base.position.y = 1;
main.add(base);
const top = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 1, 0.5),
  new THREE.MeshStandardMaterial()
);
top.position.y = 2.5;
companion.add(top);
vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => ({
    scene: url.endsWith('companion.glb') ? companion : main,
  }),
}));
const entry: LegacyWorldBuildingCatalogEntry = {
  source: 'legacy',
  ref: 'fixture:legacy',
  label: 'Legacy fixture',
  supportsDecoration: false,
  role: 'decor',
  variant: {
    name: 'base',
    file: 'base.glb',
    role: 'decor',
    footprintHexes: 1,
    blocksLoS: false,
    companions: [{ name: 'top', file: 'companion.glb' }],
  },
};
function bounds(
  view: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
) {
  const result = new THREE.Box3();
  for (const row of view.scene.findAllByType('Mesh')) {
    const mesh = row.instance as THREE.Mesh;
    mesh.updateWorldMatrix(true, false);
    result.union(new THREE.Box3().setFromObject(mesh, true));
  }
  return result;
}
it('fits an explicit legacy height against the complete loaded assembly, including its taller companion', async () => {
  const measured = vi.fn(),
    source = Array.from(base.geometry.getAttribute('position').array);
  const view = await ReactThreeTestRenderer.create(
    <WorldPropModel
      entry={entry}
      position={[0, 0, 0]}
      rotationY={0}
      targetHeight={6}
      onBoundsMeasured={measured}
    />
  );
  expect(bounds(view).min.y).toBeCloseTo(DUNGEON_SURFACE_Y);
  expect(bounds(view).getSize(new THREE.Vector3()).y).toBeCloseTo(6);
  expect(measured).toHaveBeenLastCalledWith(
    expect.objectContaining({ height: 6, width: 0.75, depth: 0.75 })
  );
  await view.update(
    <WorldPropModel
      entry={entry}
      position={[0, 0, 0]}
      rotationY={0}
      targetHeight={12}
      onBoundsMeasured={measured}
    />
  );
  expect(bounds(view).getSize(new THREE.Vector3()).y).toBeCloseTo(12);
  expect(Array.from(base.geometry.getAttribute('position').array)).toEqual(
    source
  );
  expect(base.scale.y).toBe(1);
  expect(top.scale.y).toBe(1);
  await view.unmount();
});
it('keeps the existing legacy percentage and primary-bound reporting contract when no absolute height is supplied', async () => {
  const measured = vi.fn();
  const view = await ReactThreeTestRenderer.create(
    <PropModel
      variant={entry.variant}
      position={[0, 0, 0]}
      anchor="bounds-floor-center"
      heightScale={1.5}
      onBoundsMeasured={measured}
    />
  );
  expect(bounds(view).getSize(new THREE.Vector3()).y).toBeCloseTo(3.375);
  expect(measured).toHaveBeenLastCalledWith(
    expect.objectContaining({ height: 2.25 })
  );
  await view.unmount();
});
