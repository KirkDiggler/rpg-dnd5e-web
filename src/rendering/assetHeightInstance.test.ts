import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  assembleAssetHeightInstance,
  expandPartBindings,
  expandPartSelections,
  legacyAssetHeightProfile,
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

const anchoredProfile = {
  mode: 'anchored',
  node: 'Upper',
  capNode: 'Cap',
  lowerAnchor: 'LowerAnchor',
  upperAnchor: 'UpperAnchor',
  lowerHeight: 2,
  upperHeight: 3,
  extension: 'stretch',
} as const;
function anchoredSource() {
  const root = source();
  const frame = root.getObjectByName('Frame')!;
  frame.scale.y = 1.1;
  frame.position.y = 1.1 / SYNTY_SCALE;
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(2 / SYNTY_SCALE, 0.7 / SYNTY_SCALE, 0.4 / SYNTY_SCALE)
  );
  cap.name = 'Cap';
  cap.position.y = 3.15 / SYNTY_SCALE;
  const lower = new THREE.Object3D();
  lower.name = 'LowerAnchor';
  lower.position.y = 2 / SYNTY_SCALE;
  const upper = new THREE.Object3D();
  upper.name = 'UpperAnchor';
  upper.position.y = -0.15 / SYNTY_SCALE;
  cap.add(upper);
  root.add(lower, cap);
  return root;
}

describe('placement-owned height assembly', () => {
  it('does not guess a legacy repeat policy for an anchored source without metadata', () => {
    const root = anchoredSource();
    root.getObjectByName('LowerAnchor')!.name = 'HeightFit_v1_Lower';
    root.getObjectByName('UpperAnchor')!.name = 'HeightFit_v1_Upper';
    expect(() =>
      legacyAssetHeightProfile(
        root,
        [
          { role: 'above', node: 'Upper' },
          { role: 'cap', node: 'Cap' },
        ],
        3.5
      )
    ).toThrow('Anchored');
  });
  it('uses explicit anchors despite overlapping fixed trim and cap bounds', () => {
    const cached = anchoredSource();
    const a = cached.clone(true),
      b = cached.clone(true);
    const first = assembleAssetHeightInstance({
      root: a,
      nativeHeight: 3.5,
      targetHeight: 6,
      profile: anchoredProfile,
      protectedNodes: ['Leaf'],
    });
    const second = assembleAssetHeightInstance({
      root: b,
      nativeHeight: 3.5,
      targetHeight: 4,
      profile: anchoredProfile,
      protectedNodes: ['Leaf'],
    });
    expect(height(a)).toBeCloseTo(6);
    expect(height(b)).toBeCloseTo(4);
    expect(height(cached)).toBeCloseTo(3.5);
    expect(height(a.getObjectByName('Cap')!)).toBeCloseTo(0.7);
    expect(height(a.getObjectByName('Frame')!)).toBeCloseTo(2.2);
    expect(height(a.getObjectByName('Leaf')!)).toBeCloseTo(1.8);
    expect(a.getObjectByName('Cap')!.scale.toArray()).toEqual([1, 1, 1]);
    expect(first.nodeCopies.size).toBe(0);
    expect(
      a.getObjectByName('UpperAnchor')!.getWorldPosition(new THREE.Vector3())
        .y * SYNTY_SCALE
    ).toBeCloseTo(5.5);
    const cap = a.getObjectByName('Cap') as THREE.Mesh;
    expect(cap.geometry).not.toBe(
      (cached.getObjectByName('Cap') as THREE.Mesh).geometry
    );
    expect(cap.geometry).not.toBe(
      (b.getObjectByName('Cap') as THREE.Mesh).geometry
    );
    const before = (cached.getObjectByName('Upper') as THREE.Mesh).geometry
      .getAttribute('uv')
      .array.slice();
    expect(
      (a.getObjectByName('Upper') as THREE.Mesh).geometry.getAttribute('uv')
        .array
    ).toEqual(before);
    first.owned.forEach((g) => g.dispose());
    second.owned.forEach((g) => g.dispose());
  });

  it('refuses invalid anchored markers before changing the hierarchy', () => {
    const cases = [
      (root: THREE.Group) => root.remove(root.getObjectByName('LowerAnchor')!),
      (root: THREE.Group) => {
        const duplicate = new THREE.Object3D();
        duplicate.name = 'LowerAnchor';
        root.add(duplicate);
      },
      (root: THREE.Group) => root.attach(root.getObjectByName('UpperAnchor')!),
      (root: THREE.Group) =>
        root
          .getObjectByName('Upper')!
          .attach(root.getObjectByName('LowerAnchor')!),
      (root: THREE.Group) => {
        root.getObjectByName('LowerAnchor')!.position.x = 1;
      },
      (root: THREE.Group) => {
        root.getObjectByName('LowerAnchor')!.position.y += 0.1;
      },
      (root: THREE.Group) => {
        root
          .getObjectByName('LowerAnchor')!
          .add(new THREE.Mesh(new THREE.BoxGeometry()));
      },
    ];
    for (const mutate of cases) {
      const root = anchoredSource();
      mutate(root);
      const capY = root.getObjectByName('Cap')!.position.y;
      expect(() =>
        assembleAssetHeightInstance({
          root,
          nativeHeight: 3.5,
          targetHeight: 6,
          profile: anchoredProfile,
        })
      ).toThrow(/anchor/i);
      expect(root.getObjectByName('Cap')!.position.y).toBe(capY);
    }
  });

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

  it('moves one top cap while preserving its shape and the lower feature', () => {
    const cached = source();
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(
        2 / SYNTY_SCALE,
        0.5 / SYNTY_SCALE,
        0.4 / SYNTY_SCALE
      )
    );
    cap.name = 'Cap';
    cap.position.y = 3.25 / SYNTY_SCALE;
    cached.add(cap);
    const root = cached.clone(true);
    const result = assembleAssetHeightInstance({
      root,
      nativeHeight: 3.5,
      targetHeight: 6,
      profile: { ...profile, capNode: 'Cap', capHeight: 0.5 },
      protectedNodes: ['Leaf'],
    });
    expect(height(root)).toBeCloseTo(6);
    const fitted = root.getObjectByName('Cap')!;
    expect(height(fitted)).toBeCloseTo(0.5);
    expect(fitted.scale.toArray()).toEqual([1, 1, 1]);
    expect(result.nodeCopies.has('Cap')).toBe(false);
    expect(height(root.getObjectByName('Leaf')!)).toBeCloseTo(1.8);
    expect(height(cached)).toBeCloseTo(3.5);
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
