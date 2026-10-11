import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { fitPlainWallInstance, inspectPlainWall } from './plainWallFit';

function fixture(): THREE.Group {
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.name = 'WallBody_v1';
  root.add(body);
  const box = new THREE.BoxGeometry(4, 3, 0.4).toNonIndexed();
  box.translate(-0.3, 1.5, 0);
  for (let pair = 0; pair < 3; pair++) {
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const source = box.getAttribute(name);
      const values: number[] = [];
      for (let i = pair * 12; i < (pair + 1) * 12; i++)
        for (let c = 0; c < source.itemSize; c++)
          values.push(source.array[i * source.itemSize + c]);
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(values, source.itemSize)
      );
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.position.x = 0.3;
    body.add(mesh);
  }
  for (const [name, p] of Object.entries({
    Start: [-2, 0, 0],
    End: [2, 0, 0],
    Front: [0, 0, 0.2],
    Back: [0, 0, -0.2],
    Top: [0, 3, 0],
  })) {
    const node = new THREE.Object3D();
    node.name = `WallFit_v1_${name}`;
    node.position.set(...(p as [number, number, number]));
    root.add(node);
  }
  return root;
}
const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};

describe('enrolled plain-wall instance fit', () => {
  it('keeps physical side-map density and continues its chart across repeated pieces', () => {
    const source = fixture(),
      a = source.clone(true),
      b = source.clone(true);
    fitPlainWallInstance(a, { width: 2, height: 2.25, depth: 0.3, offset: 0 });
    fitPlainWallInstance(b, { width: 2, height: 2.25, depth: 0.3, offset: 2 });
    const side = meshes(source)[2],
      p = side.geometry.getAttribute('position');
    const end = Array.from({ length: p.count }, (_, i) => i).find(
      (i) => p.getX(i) > 0 && p.getY(i) > 2 && p.getZ(i) > 0
    )!;
    const start = Array.from({ length: p.count }, (_, i) => i).find(
      (i) => p.getX(i) < 0 && p.getY(i) > 2 && p.getZ(i) > 0
    )!;
    const auv = meshes(a)[2].geometry.getAttribute('uv'),
      buv = meshes(b)[2].geometry.getAttribute('uv');
    expect(Math.abs(auv.getX(end) - auv.getX(start))).toBeCloseTo(2 / 3, 6);
    expect(auv.getX(end)).toBeCloseTo(buv.getX(start), 6);
    expect(auv.getY(end)).toBeCloseTo(buv.getY(start), 6);
  });
  it.each([1, -1])(
    'fits all material primitives to mating caps for turn %s without changing cached data',
    (turn) => {
      const source = fixture(),
        originals = meshes(source);
      const saved = originals.map((m) => ({
        positions: Array.from(m.geometry.getAttribute('position').array),
        uv: Array.from(m.geometry.getAttribute('uv').array),
        geometry: m.geometry,
        material: m.material,
      }));
      const a = source.clone(true),
        b = source.clone(true);
      const fa = fitPlainWallInstance(a, {
        width: 4,
        height: 3,
        depth: 0.4,
        end: -turn,
      });
      const fb = fitPlainWallInstance(b, {
        width: 4,
        height: 3,
        depth: 0.4,
        start: turn,
      });
      expect(fa.owned).toHaveLength(3);
      expect(fb.owned).toHaveLength(3);
      const caps = (
        root: THREE.Object3D,
        end: 'start' | 'end',
        second: boolean
      ): number[][] => {
        root.updateMatrixWorld(true);
        const result: number[][] = [];
        meshes(root).forEach((mesh, mi) => {
          const p = mesh.geometry.getAttribute('position');
          for (let i = 0; i < p.count; i++) {
            const oldX = saved[mi].positions[i * 3] + 0.3;
            if (end === 'end' ? oldX < 0 : oldX > 0) continue;
            const v = new THREE.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(mesh.matrixWorld);
            if (second) {
              const x = -turn * v.z,
                z = turn * (v.x + 2);
              v.set(x, v.y, z);
            } else v.x -= 2;
            expect(v.x + turn * v.z).toBeCloseTo(0, 5);
            result.push(v.toArray().map((n) => Number(n.toFixed(5))));
          }
        });
        return [
          ...new Map(result.map((p) => [JSON.stringify(p), p])).values(),
        ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      };
      expect(caps(a, 'end', false)).toEqual(caps(b, 'start', true));
      meshes(a).forEach((mesh, mi) => {
        const p = mesh.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++)
          if (saved[mi].positions[i * 3] + 0.3 < 0)
            expect(Array.from(p.array).slice(i * 3, i * 3 + 3)).toEqual(
              saved[mi].positions.slice(i * 3, i * 3 + 3)
            );
        expect(
          Array.from(mesh.geometry.getAttribute('normal').array).every(
            Number.isFinite
          )
        ).toBe(true);
        expect(
          Array.from(mesh.geometry.getAttribute('tangent').array).every(
            Number.isFinite
          )
        ).toBe(true);
        expect(mesh.material).toBe(saved[mi].material);
        expect(originals[mi].geometry).toBe(saved[mi].geometry);
        expect(
          Array.from(originals[mi].geometry.getAttribute('position').array)
        ).toEqual(saved[mi].positions);
        expect(
          Array.from(originals[mi].geometry.getAttribute('uv').array)
        ).toEqual(saved[mi].uv);
      });
      expect(
        Array.from(meshes(a)[0].geometry.getAttribute('uv').array)
      ).toEqual(saved[0].uv); // end caps
      expect(
        Array.from(meshes(a)[2].geometry.getAttribute('uv').array)
      ).not.toEqual(saved[2].uv); // masonry sides
      const dispose = vi.spyOn(originals[0].geometry, 'dispose');
      fa.owned.forEach((g) => g.dispose());
      expect(dispose).not.toHaveBeenCalled();
    }
  );
  it('reads body planes through transforms and refuses missing markers/short terminal pieces', () => {
    const root = fixture();
    root.position.set(2, 1, 3);
    expect(inspectPlainWall(root)).toMatchObject({
      width: 4,
      height: 3,
      centerX: 2,
      centerZ: 3,
      baseY: 1,
    });
    expect(inspectPlainWall(root).depth).toBeCloseTo(0.4, 14);
    expect(() =>
      fitPlainWallInstance(root, { width: 0.2, height: 3, depth: 0.4, end: 1 })
    ).toThrow(/longer/);
    root.remove(root.getObjectByName('WallFit_v1_Top')!);
    expect(() => inspectPlainWall(root)).toThrow(/WallFit_v1_Top/);
  });
});
