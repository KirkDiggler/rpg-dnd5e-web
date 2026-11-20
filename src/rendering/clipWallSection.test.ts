import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clipWallSection } from './clipWallSection';
function fixture() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(4, 3, 0.5);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.position.set(1, 1.5, 0);
  root.add(mesh);
  return { root, mesh, geometry };
}
function bounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root, true);
}
describe('detached visual-section clipping', () => {
  it('clips only longitudinal geometry without squeezing its height or changing the cached source', () => {
    const { root, mesh, geometry } = fixture(),
      original = Array.from(geometry.getAttribute('position').array),
      owned: THREE.BufferGeometry[] = [];
    clipWallSection({ root, min: 0.2, max: 1.8, owned });
    const b = bounds(root);
    expect(b.min.x).toBeCloseTo(0.2);
    expect(b.max.x).toBeCloseTo(1.8);
    expect(b.min.y).toBe(0);
    expect(b.max.y).toBe(3);
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(
      original
    );
    expect(mesh.geometry).not.toBe(geometry);
    expect(owned).toContain(mesh.geometry);
    owned.forEach((g) => g.dispose());
  });
  it('interpolates every UV channel at the cut rather than restarting a texture chart', () => {
    const { root, mesh } = fixture(),
      pos = mesh.geometry.getAttribute('position');
    const uv = new THREE.Float32BufferAttribute(pos.count * 2, 2);
    for (let i = 0; i < pos.count; i++)
      uv.setXY(i, (pos.getX(i) + 1) / 4, pos.getY(i) / 3);
    mesh.geometry.setAttribute('uv2', uv);
    clipWallSection({ root, min: 0.2, max: 1.8, owned: [] });
    const p = mesh.geometry.getAttribute('position'),
      mapped = mesh.geometry.getAttribute('uv2');
    for (let i = 0; i < p.count; i++) {
      expect(mapped.getX(i)).toBeCloseTo((p.getX(i) + 1) / 4, 6);
      expect(mapped.getY(i)).toBeCloseTo(p.getY(i) / 3, 6);
    }
    expect(
      mesh.geometry.groups.reduce((count, group) => count + group.count, 0)
    ).toBe(p.count);
  });
  it('removes triangles outside the visible slice instead of keeping hidden source vertices', () => {
    const { root, mesh } = fixture();
    clipWallSection({ root, min: 10, max: 11, owned: [] });
    expect(mesh.geometry.getAttribute('position').count).toBe(0);
  });
  it('refuses live hierarchies and nonfinite/inverted clip planes', () => {
    const { root } = fixture();
    for (const [min, max] of [
      [2, 1],
      [1, 1],
      [NaN, 2],
    ])
      expect(() => clipWallSection({ root, min, max, owned: [] })).toThrow(
        /clip/i
      );
    new THREE.Group().add(root);
    expect(() => clipWallSection({ root, min: 0, max: 1, owned: [] })).toThrow(
      /detached/
    );
  });
});
