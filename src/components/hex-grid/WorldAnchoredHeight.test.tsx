import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WorldAssetModel } from './WorldAssetModel';

// Synthetic source geometry only. Both fixed trim and the cap overhang the
// declared infill span; a parent Y scale would stretch the protected parts.
const sources = new Map<string, THREE.Group>();
function source(ref: string): THREE.Group {
  if (sources.has(ref)) return sources.get(ref)!;
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.name = 'WallBody_v1';
  root.add(body);
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  material.name = 'AuthoredAtlas';
  for (const [name, height, y] of [
    ['Frame', 2.2, 1.1],
    ['Infill', 1, 2.5],
    ['Cap', 0.7, 3.15],
  ] as const) {
    const geometry = new THREE.BoxGeometry(
      2 / SYNTY_SCALE,
      height / SYNTY_SCALE,
      0.3 / SYNTY_SCALE
    );
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, 0.1 + uv.getX(i) * 0.1, 0.1 + uv.getY(i) * 0.1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = y / SYNTY_SCALE;
    body.add(mesh);
  }
  if (ref === 'anchored-door') {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.8 / SYNTY_SCALE,
        1.8 / SYNTY_SCALE,
        0.1 / SYNTY_SCALE
      ),
      material
    );
    leaf.name = 'Leaf';
    leaf.position.y = 0.9 / SYNTY_SCALE;
    root.add(leaf);
  }
  const point = (
    name: string,
    coordinates: number[],
    parent: THREE.Object3D = root
  ) => {
    const marker = new THREE.Object3D();
    marker.name = name;
    marker.position.fromArray(coordinates.map((v) => v / SYNTY_SCALE));
    parent.add(marker);
  };
  point('Lower', [0, 2, 0]);
  point('Upper', [0, -0.15, 0], body.getObjectByName('Cap')!);
  point('Opening_v1_entry', [0, 0, 0]);
  point('OpeningPoint_entry_00', [-0.4, 0, 0]);
  point('OpeningPoint_entry_01', [0.4, 0, 0]);
  point('WallFit_v1_Start', [-1, 0, 0]);
  point('WallFit_v1_End', [1, 0, 0]);
  point('WallFit_v1_Front', [0, 0, 0.15]);
  point('WallFit_v1_Back', [0, 0, -0.15]);
  point('WallFit_v1_Top', [0, 3.5, 0]);
  sources.set(ref, root);
  return root;
}
vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => ({
    scene: source(
      url.includes('anchored-door') ? 'anchored-door' : 'anchored-panel'
    ),
  }),
}));
vi.mock('@/generated/worldAssetCatalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/generated/worldAssetCatalog')>()),
  resolveWorldAsset: (ref: string): GeneratedWorldAsset => ({
    ref,
    displayName: ref,
    category: 'env',
    url: `/${ref}.glb`,
    glbSha256: 'a'.repeat(64),
    sizeBytes: 1,
    boundsMeters: [2, 3.5, 0.3],
    tags: [ref === 'anchored-door' ? 'wall-opening' : 'wall-body-fit'],
    supportsDecoration: false,
    heightFit: {
      mode: 'anchored',
      node: 'Infill',
      capNode: 'Cap',
      lowerAnchor: 'Lower',
      upperAnchor: 'Upper',
      lowerHeight: 2,
      upperHeight: 3,
      extension: 'stretch',
    },
    roles: [
      { role: 'frame', node: 'Frame' },
      { role: 'above', node: 'Infill' },
      { role: 'cap', node: 'Cap' },
      ...(ref === 'anchored-door'
        ? [{ role: 'leaf' as const, node: 'Leaf', door: 'entry' }]
        : []),
    ],
    ...(ref === 'anchored-door'
      ? {
          wallOpening: {
            profile: 'wall-opening-v1' as const,
            openingId: 'entry',
            widthMeters: 0.8,
            frameWidthMeters: 2,
            frameHeightMeters: 3.5,
            wallDepthMeters: 0.3,
            leftExtentMeters: 1,
          },
        }
      : {}),
  }),
}));
function height(node: THREE.Object3D): number {
  node.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(node, true).getSize(new THREE.Vector3())
    .y;
}

describe('anchored profiles through the real model adapter', () => {
  it('does not apply a second height scale to fitted door leaves or the whole cap', async () => {
    const view = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef="anchored-door"
        position={[0, 0, 0]}
        wallOpeningFit={{ width: 2, height: 6, depth: 0.3 }}
      />
    );
    const root = view.scene.findByProps({ name: 'world-asset-model' }).instance;
    expect(height(root)).toBeCloseTo(6);
    expect(height(root.getObjectByName('Cap')!)).toBeCloseTo(0.7);
    expect(height(root.getObjectByName('Leaf')!)).toBeCloseTo(1.8);
    expect(height(source('anchored-door')) * SYNTY_SCALE).toBeCloseTo(3.5);
    await view.unmount();
  });

  it('preserves packed atlas UVs through plain-wall width, offset and height fitting', async () => {
    const cached = source('anchored-panel');
    const before = ['Frame', 'Infill', 'Cap'].map((name) =>
      Array.from(
        (cached.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('uv')
          .array
      )
    );
    const view = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef="anchored-panel"
        position={[0, 0, 0]}
        plainWallFit={{ width: 4, height: 6, depth: 0.3, offset: 7 }}
      />
    );
    const root = view.scene.findByProps({ name: 'world-asset-model' }).instance;
    expect(height(root)).toBeCloseTo(6);
    expect(height(root.getObjectByName('Cap')!)).toBeCloseTo(0.7);
    for (const [i, name] of ['Frame', 'Infill', 'Cap'].entries()) {
      expect(
        Array.from(
          (root.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('uv')
            .array
        )
      ).toEqual(before[i]);
      expect(
        Array.from(
          (cached.getObjectByName(name) as THREE.Mesh).geometry.getAttribute(
            'uv'
          ).array
        )
      ).toEqual(before[i]);
    }
    await view.unmount();
  });
});
