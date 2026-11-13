import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fitWallOpeningInstance } from './wallOpeningFit';

function fixture() {
  const root = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(5, 5, 0.5),
    new THREE.MeshStandardMaterial()
  );
  frame.name = 'Frame';
  frame.position.y = 2.5;
  root.add(frame);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1));
  leaf.name = 'Leaf';
  leaf.position.set(0.3, 1.1, 0);
  root.add(leaf);
  const marker = (name: string, x: number, y: number, z: number) => {
    const node = new THREE.Object3D();
    node.name = name;
    node.position.set(x, y, z);
    root.add(node);
  };
  marker('Opening_v1_entry', 0.3, 0.1, 0);
  marker('OpeningPoint_entry_00', -0.2, 0.1, 0);
  marker('OpeningPoint_entry_01', 0.8, 0.1, 0);
  marker('WallFit_v1_Front', 0, 0, 0.25);
  marker('WallFit_v1_Back', 0, 0, -0.25);
  return { root, frame, leaf };
}
const descriptor = {
  openingId: 'entry',
  frameNode: 'Frame',
  widthMeters: 0.75,
  frameWidthMeters: 3.75,
  frameHeightMeters: 3.75,
  wallDepthMeters: 0.375,
  leftExtentMeters: 2.1,
};

describe('aperture-fitted fixed surround', () => {
  it('anchors to the aperture, measures the fixed frame, and owns only fixed geometry', () => {
    const { root, frame, leaf } = fixture();
    const source = frame.geometry;
    const moving = leaf.geometry;
    const before = Array.from(source.getAttribute('position').array);
    const result = fitWallOpeningInstance(root, descriptor);
    expect(result.profile).toMatchObject({
      start: -2.5,
      end: 2.5,
      centerX: 0.3,
      centerZ: 0,
      baseY: 0,
      width: 5,
      height: 5,
      depth: 0.5,
    });
    expect(result.owned).toEqual([frame.geometry]);
    expect(frame.geometry).not.toBe(source);
    expect(leaf.geometry).toBe(moving);
    expect(Array.from(source.getAttribute('position').array)).toEqual(before);
    expect(leaf.position.toArray()).toEqual([0.3, 1.1, 0]);
  });
  it('refuses stale provider dimensions instead of fitting the whole assembly as its opening', () => {
    expect(() =>
      fitWallOpeningInstance(fixture().root, {
        ...descriptor,
        widthMeters: 3.75,
      })
    ).toThrow(/metrics/);
  });
  it('requires unique, geometry-free fit anchors', () => {
    const { root } = fixture();
    const duplicate = new THREE.Object3D();
    duplicate.name = 'Opening_v1_entry';
    root.add(duplicate);
    expect(() => fitWallOpeningInstance(root, descriptor)).toThrow(
      /one Opening/
    );
  });
});
