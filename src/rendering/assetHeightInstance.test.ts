import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  assembleAssetHeightInstance,
  expandPartBindings,
  expandPartSelections,
} from './assetHeightInstance';
import { SYNTY_SCALE } from './calibrationConstants';

const profile = {
  mode: 'repeat-above',
  node: 'Upper',
  baseHeight: 2,
  rowHeight: 1,
} as const;
function source() {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  for (const [name, height, y] of [
    ['Frame', 2, 1],
    ['Leaf', 1.8, 0.9],
    ['Upper', 1, 2.5],
  ] as const) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        2 / SYNTY_SCALE,
        height / SYNTY_SCALE,
        0.3 / SYNTY_SCALE
      ),
      material
    );
    mesh.name = name;
    mesh.position.y = y / SYNTY_SCALE;
    root.add(mesh);
  }
  return root;
}
function height(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return (
    new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3()).y *
    SYNTY_SCALE
  );
}

describe('placement-owned height assembly', () => {
  it('fits a centred upper pivot, preserves fixed parts and isolates cached geometry', () => {
    const cached = source(),
      a = cached.clone(true),
      b = cached.clone(true);
    const first = assembleAssetHeightInstance({
      root: a,
      nativeHeight: 3,
      targetHeight: 6,
      profile,
      protectedNodes: ['Leaf'],
    });
    const second = assembleAssetHeightInstance({
      root: b,
      nativeHeight: 3,
      targetHeight: 4.4,
      profile,
      protectedNodes: ['Leaf'],
    });
    expect(height(a)).toBeCloseTo(6);
    expect(height(b)).toBeCloseTo(4.4);
    expect(height(cached)).toBeCloseTo(3);
    expect(height(a.getObjectByName('Leaf')!)).toBeCloseTo(1.8);
    const mesh = a.getObjectByName(
      first.nodeCopies.get('Upper')![0]!
    ) as THREE.Mesh;
    const cachedMesh = cached.getObjectByName('Upper') as THREE.Mesh;
    const otherMesh = b.getObjectByName('Upper') as THREE.Mesh;
    expect(mesh.geometry).not.toBe(cachedMesh.geometry);
    expect(mesh.geometry).not.toBe(otherMesh.geometry);
    const old = cachedMesh.geometry.getAttribute('position').getY(0);
    mesh.geometry.getAttribute('position').setY(0, 999);
    expect(cachedMesh.geometry.getAttribute('position').getY(0)).toBe(old);
    expect(otherMesh.geometry.getAttribute('position').getY(0)).toBe(old);
    first.owned.forEach((g) => g.dispose());
    second.owned.forEach((g) => g.dispose());
  });

  it('refuses wrong loaded metrics or moving geometry in the repeat part', () => {
    expect(() =>
      assembleAssetHeightInstance({
        root: source(),
        nativeHeight: 3,
        targetHeight: 6,
        profile: { ...profile, baseHeight: 2.1, rowHeight: 0.9 },
      })
    ).toThrow('height profile');
    const root = source();
    root.getObjectByName('Upper')!.attach(root.getObjectByName('Leaf')!);
    expect(() =>
      assembleAssetHeightInstance({
        root,
        nativeHeight: 3,
        targetHeight: 6,
        profile,
        protectedNodes: ['Leaf'],
      })
    ).toThrow('protected');
  });

  it('creates no names or geometry outside the owned hierarchy', () => {
    const cached = source(),
      instance = cached.clone(true);
    const result = assembleAssetHeightInstance({
      root: instance,
      nativeHeight: 3,
      targetHeight: 120,
      profile,
    });
    expect(result.nodeCopies.get('Upper')).toHaveLength(63);
    expect(cached.children).toHaveLength(3);
    expect(new Set(instance.children.map((n) => n.name)).size).toBe(
      instance.children.length
    );
    expect(height(instance)).toBeCloseTo(120, 4);
  });

  it('expands existing material/chart bindings for each owned copy without changing source identities', () => {
    const result = assembleAssetHeightInstance({
      root: source(),
      nativeHeight: 3,
      targetHeight: 5,
      profile,
    });
    const original = [
      { id: 'front', node: 'Frame', material: 'Stone' },
      { id: 'upper-front', node: 'Upper', material: 'Stone' },
    ];
    const expanded = expandPartBindings(original, result.nodeCopies);
    expect(expanded.bindings).toHaveLength(4);
    expect(new Set(expanded.bindings.map((b) => b.id)).size).toBe(4);
    const charts = expandPartSelections(
      [{ surfaceId: 'upper-front', phase: 0.25 }],
      expanded.ids
    );
    expect(charts).toHaveLength(3);
    expect(charts.every((c) => c.phase === 0.25)).toBe(true);
    expect(charts.map((c) => c.surfaceId)).toEqual(
      expanded.bindings.filter((b) => b.node !== 'Frame').map((b) => b.id)
    );
    expect(original).toHaveLength(2);
  });
});
