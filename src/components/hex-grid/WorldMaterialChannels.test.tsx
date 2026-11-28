import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import type { MaterialChannelAdjustment } from '@/rendering/materialChannelTypes';
import type { WorldMaterialCatalogState } from '@/rendering/useWorldMaterialCatalog';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { StrictMode } from 'react';
import * as THREE from 'three';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorldAssetModel } from './WorldAssetModel';

const state = vi.hoisted(() => ({
  scene: null as THREE.Group | null,
  catalog: null as WorldMaterialCatalogState | null,
  asset: {} as Partial<GeneratedWorldAsset>,
}));
const ref = 'dnd5e:env:test:channel_body';
const hash = 'd'.repeat(64);
vi.mock('@/generated/worldAssetCatalog', () => ({
  resolveWorldAsset: (assetRef: string) => ({
    ref: assetRef,
    displayName: 'Channel fixture',
    category: 'env',
    url: '/channel-fixture.glb',
    glbSha256: 'd'.repeat(64),
    sizeBytes: 1,
    boundsMeters: [1.5, 2.25, 0.375],
    tags: [],
    supportsDecoration: false,
    heightFit: { mode: 'scale' },
    ...state.asset,
  }),
}));
vi.mock('@react-three/drei', () => ({
  useGLTF: () => ({ scene: state.scene }),
}));
vi.mock('@/rendering/useWorldMaterialCatalog', () => ({
  useWorldMaterialCatalog: () => state.catalog,
}));

let source: THREE.MeshStandardMaterial;
let geometry: THREE.BoxGeometry;
beforeEach(() => {
  state.asset = {};
  source = new THREE.MeshStandardMaterial();
  source.name = 'Authored';
  source.normalMap = new THREE.Texture();
  source.normalScale.set(-1, 0.6);
  source.emissiveMap = new THREE.Texture();
  source.emissive.setRGB(0.1, 0.2, 0.3);
  source.emissiveIntensity = 3;
  geometry = new THREE.BoxGeometry(2, 3, 0.5);
  state.scene = new THREE.Group();
  for (const name of ['Body', 'UnenrolledTrim']) {
    const mesh = new THREE.Mesh(geometry, source);
    mesh.name = name;
    state.scene.add(mesh);
  }
  state.catalog = {
    status: 'ready',
    message: 'ready',
    catalog: {
      kind: 'pinned',
      catalogSha256: 'c'.repeat(64),
      materials: [],
      surfaces: [],
      channelBindings: [
        {
          assetRef: ref,
          representation: 'model',
          glbSha256: hash,
          targets: [
            {
              id: 'body',
              label: 'Body',
              selectors: [{ node: 'Body', material: 'Authored' }],
              normal: {
                kind: 'adjustable',
                minMultiplier: 0.5,
                maxMultiplier: 2,
              },
              emissive: {
                kind: 'adjustable',
                minMultiplier: 0.5,
                maxMultiplier: 2,
              },
            },
          ],
        },
      ],
    },
  };
});
const adjustments: MaterialChannelAdjustment[] = [
  {
    targetId: 'body',
    normal: { mode: 'scale', multiplier: 0.5 },
    emissive: { mode: 'scale', multiplier: 2 },
  },
];
const props = {
  assetRef: ref,
  position: [0, 0, 0] as [number, number, number],
};
const body = (root: THREE.Object3D, name = 'Body') =>
  root.getObjectByName(name) as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;

it('applies captured intent without changing cached sources or unenrolled trim', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <WorldAssetModel {...props} materialChannels={adjustments} />
  );
  const root = renderer.scene.findByProps({
    name: 'world-asset-model',
  }).instance;
  const material = body(root).material;
  expect(material.normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(material.emissiveIntensity).toBe(6);
  expect(material.emissive.toArray()).toEqual(source.emissive.toArray());
  expect(material.normalMap).toBe(source.normalMap);
  expect(material.emissiveMap).toBe(source.emissiveMap);
  expect(body(root).geometry).toBe(geometry);
  expect(body(root, 'UnenrolledTrim').material).toBe(source);
  expect(source.normalScale.toArray()).toEqual([-1, 0.6]);
  expect(source.emissiveIntensity).toBe(3);
  await renderer.unmount();
});

it('restores Default exactly through StrictMode and repeated overlay changes', async () => {
  const sourceDispose = vi.spyOn(source, 'dispose');
  const mapDispose = vi.spyOn(source.normalMap!, 'dispose');
  const render = (values?: MaterialChannelAdjustment[], remembered = false) => (
    <StrictMode>
      <WorldAssetModel
        {...props}
        materialChannels={values}
        remembered={remembered}
      />
    </StrictMode>
  );
  const renderer = await ReactThreeTestRenderer.create(render(adjustments));
  const rendered = () =>
    body(renderer.scene.findByProps({ name: 'world-asset-model' }).instance);
  const first = rendered().material;
  const firstDispose = vi.spyOn(first, 'dispose');
  await renderer.update(render(adjustments, true));
  await renderer.update(render(adjustments));
  expect(rendered().material.normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(rendered().material.emissiveIntensity).toBe(6);
  expect(firstDispose).toHaveBeenCalledTimes(1);
  await renderer.update(
    render([{ targetId: 'body', normal: { mode: 'off' } }])
  );
  expect(rendered().material.normalScale.toArray()).toEqual([0, 0]);
  expect(rendered().material.emissiveIntensity).toBe(3);
  await renderer.update(render());
  expect(rendered().material).toBe(source);
  expect(source.normalScale.toArray()).toEqual([-1, 0.6]);
  await renderer.unmount();
  expect(sourceDispose).not.toHaveBeenCalled();
  expect(mapDispose).not.toHaveBeenCalled();
});

it('isolates two placements that share a loader resource', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <WorldAssetModel {...props} materialChannels={adjustments} />
      <WorldAssetModel {...props} />
    </>
  );
  const [changed, untouched] = renderer.scene.findAllByProps({
    name: 'world-asset-model',
  });
  expect(body(changed.instance).material.normalScale.toArray()).toEqual([
    -0.5, 0.3,
  ]);
  expect(body(untouched.instance).material).toBe(source);
  await renderer.unmount();
});

it('treats every actual fitted repeat and cap but leaves trim and moving leaves alone', async () => {
  state.asset = {
    boundsMeters: [2, 3.5, 0.3],
    heightFit: {
      mode: 'repeat-above',
      node: 'Infill',
      baseHeight: 2,
      rowHeight: 1,
      capNode: 'Cap',
      capHeight: 0.5,
    },
    roles: [
      { role: 'frame', node: 'Body' },
      { role: 'above', node: 'Infill' },
      { role: 'cap', node: 'Cap' },
      { role: 'leaf', node: 'Leaf', door: 'entry' },
    ],
  };
  state.scene = new THREE.Group();
  for (const [name, height, y] of [
    ['Body', 2, 1],
    ['Infill', 1, 2.5],
    ['Cap', 0.5, 3.25],
    ['UnenrolledTrim', 1, 0.5],
    ['Leaf', 1.8, 0.9],
  ] as const) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        2 / SYNTY_SCALE,
        height / SYNTY_SCALE,
        0.3 / SYNTY_SCALE
      ),
      source
    );
    mesh.name = name;
    mesh.position.y = y / SYNTY_SCALE;
    state.scene.add(mesh);
  }
  const catalog = state.catalog!.catalog!;
  const binding = catalog.channelBindings![0];
  state.catalog = {
    ...state.catalog!,
    catalog: {
      ...catalog,
      channelBindings: [
        {
          ...binding,
          targets: [
            {
              ...binding.targets[0],
              selectors: ['Body', 'Infill', 'Cap'].map((node) => ({
                node,
                material: 'Authored',
              })),
            },
          ],
        },
      ],
    },
  };
  const renderer = await ReactThreeTestRenderer.create(
    <WorldAssetModel
      {...props}
      targetHeight={5.2}
      materialChannels={adjustments}
    />
  );
  const root = renderer.scene.findByProps({
    name: 'world-asset-model',
  }).instance;
  const treated: THREE.MeshStandardMaterial[] = [];
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.name === 'UnenrolledTrim' || node.name === 'Leaf')
      expect(node.material).toBe(source);
    else treated.push(node.material as THREE.MeshStandardMaterial);
  });
  expect(treated).toHaveLength(5);
  for (const value of treated) {
    expect(value.normalScale.toArray()).toEqual([-0.5, 0.3]);
    expect(value.emissiveIntensity).toBe(6);
  }
  expect(new Set(treated).size).toBe(1);
  expect(source.normalScale.toArray()).toEqual([-1, 0.6]);
  await renderer.unmount();
});
