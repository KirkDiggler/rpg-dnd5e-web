import * as THREE from 'three';
import { expect, it } from 'vitest';
import {
  assembleAssetHeightInstance,
  expandPartBindings,
  expandPartSelections,
} from './assetHeightInstance';
import { SYNTY_SCALE } from './calibrationConstants';
import { applyWallSurfaceCharts } from './wallSurfaceCharts';

it('uses final repeated positions for one continuous physical masonry chart', () => {
  const root = new THREE.Group();
  const map = new THREE.Texture();
  map.channel = 2;
  const normalMap = new THREE.Texture();
  normalMap.channel = 2;
  const material = new THREE.MeshStandardMaterial({ map, normalMap });
  material.name = 'Masonry';
  for (const [name, height, y] of [
    ['Frame', 2, 1],
    ['Upper', 1, 2.5],
  ] as const) {
    const geometry = new THREE.PlaneGeometry(
      2 / SYNTY_SCALE,
      height / SYNTY_SCALE
    );
    geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = y / SYNTY_SCALE;
    root.add(mesh);
  }
  const frame = root.getObjectByName('Frame') as THREE.Mesh;
  const sourceUV = Array.from(frame.geometry.getAttribute('uv2').array);
  const frameSource = frame.geometry;
  frame.geometry = frame.geometry.clone();
  const owned = [frame.geometry];
  const assembly = assembleAssetHeightInstance({
    root,
    nativeHeight: 3,
    targetHeight: 6,
    profile: {
      mode: 'repeat-above',
      node: 'Upper',
      baseHeight: 2,
      rowHeight: 1,
    },
    ownedGeometry: owned,
  });
  owned.push(...assembly.owned);
  const expanded = expandPartBindings(
    [
      {
        id: 'front',
        node: 'Frame',
        material: 'Masonry',
        side: 'positive-z' as const,
        family: 'masonry',
      },
      {
        id: 'upper-front',
        node: 'Upper',
        material: 'Masonry',
        side: 'positive-z' as const,
        family: 'masonry',
      },
    ],
    assembly.nodeCopies
  );
  const charts = expandPartSelections(
    ['front', 'upper-front'].map((surfaceId) => ({
      surfaceId,
      phase: 0.25,
      direction: 1 as const,
      repeat: [3.75, 3.75] as const,
      elevation: 1,
    })),
    expanded.ids
  );
  applyWallSurfaceCharts({
    root,
    assetRef: 'fixture',
    bindings: expanded.bindings,
    charts,
    fit: { width: 2, height: 6, depth: 0.3, offset: 4 },
    profile: {
      body: root,
      start: -1 / SYNTY_SCALE,
      end: 1 / SYNTY_SCALE,
      centerX: 0,
      centerZ: 0,
      baseY: 0,
      width: 2 / SYNTY_SCALE,
      height: 6 / SYNTY_SCALE,
      depth: 0.3 / SYNTY_SCALE,
    },
    owned,
  });
  root.updateMatrixWorld(true);
  let meshes = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    meshes++;
    const p = node.geometry.getAttribute('position'),
      uv = node.geometry.getAttribute('uv2');
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(p, i)
        .applyMatrix4(node.matrixWorld);
      expect(uv.getY(i)).toBeCloseTo(-(1 + point.y * SYNTY_SCALE) / 3.75, 6);
      expect(uv.getX(i)).toBeCloseTo(
        (0.25 + 4 + 1 + point.x * SYNTY_SCALE) / 3.75,
        6
      );
    }
  });
  expect(meshes).toBe(5);
  expect(Array.from(frameSource.getAttribute('uv2').array)).toEqual(sourceUV);
  owned.forEach((geometry) => geometry.dispose());
});
