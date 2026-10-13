// @vitest-environment node
import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fitPlainWallInstance } from './plainWallFit';
import { applyWallSurfaceCharts } from './wallSurfaceCharts';
function fixture() {
  const root = new THREE.Group(),
    body = new THREE.Group();
  body.name = 'WallBody_v1';
  root.add(body);
  const face = (name: string, z: number) => {
    const geometry = new THREE.PlaneGeometry(4, 3).translate(0, 1.5, z);
    if (z < 0) geometry.rotateY(Math.PI);
    geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
    const material = new THREE.MeshStandardMaterial();
    material.name = name;
    material.map = new THREE.Texture();
    material.map.channel = 2;
    material.normalMap = new THREE.Texture();
    material.normalMap.channel = 2;
    material.normalScale.set(1, -1);
    const mesh = new THREE.Mesh(geometry, material);
    body.add(mesh);
    return mesh;
  };
  const front = face('Front', 0.2),
    back = face('Back', 0.2);
  back.geometry.rotateY(Math.PI);
  const cap = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 0.4).rotateX(Math.PI / 2).translate(0, 3, 0),
    new THREE.MeshStandardMaterial()
  );
  body.add(cap);
  for (const [name, p] of Object.entries({
    Start: [-2, 0, 0],
    End: [2, 0, 0],
    Front: [0, 0, 0.2],
    Back: [0, 0, -0.2],
    Top: [0, 3, 0],
  })) {
    const marker = new THREE.Object3D();
    marker.name = `WallFit_v1_${name}`;
    marker.position.fromArray(p);
    root.add(marker);
  }
  const bindings: NonNullable<GeneratedWorldAsset['surfaces']> = [
    {
      id: 'front',
      node: 'WallBody_v1',
      material: 'Front',
      side: 'positive-z',
      family: 'masonry',
    },
    {
      id: 'back',
      node: 'WallBody_v1',
      material: 'Back',
      side: 'negative-z',
      family: 'masonry',
    },
  ];
  return { root, front, back, cap, bindings };
}
describe('fitted room wall charts', () => {
  it('maps physical source distances on UV2 only, leaves caps/cache untouched, and gives both faces an upward normal basis', () => {
    const f = fixture(),
      root = f.root.clone(true),
      fit = { width: 8, height: 3, depth: 0.4, offset: 4 };
    const fitted = fitPlainWallInstance(root, fit),
      meshes = root.getObjectByName('WallBody_v1')!.children as THREE.Mesh[];
    const capUv = Array.from(meshes[2].geometry.getAttribute('uv').array),
      sourceUv = Array.from(f.front.geometry.getAttribute('uv2').array);
    applyWallSurfaceCharts({
      root,
      assetRef: 'wall',
      bindings: f.bindings,
      fit,
      ...fitted,
      charts: [
        {
          surfaceId: 'front',
          phase: -0.2,
          direction: 1,
          repeat: [2, 3],
          elevation: 0,
        },
        {
          surfaceId: 'back',
          phase: 12.2,
          direction: -1,
          repeat: [2, 3],
          elevation: 0,
        },
      ],
    });
    expect(Array.from(meshes[2].geometry.getAttribute('uv').array)).toEqual(
      capUv
    );
    expect(Array.from(f.front.geometry.getAttribute('uv2').array)).toEqual(
      sourceUv
    );
    for (const [i, sign] of [
      [0, 1],
      [1, -1],
    ]) {
      const g = meshes[i].geometry,
        uv = g.getAttribute('uv2'),
        pos = g.getAttribute('position');
      expect(g.getAttribute('tangent')).toBeUndefined();
      for (let n = 0; n < pos.count; n++) {
        const along = 4 + (pos.getX(n) + 2) * 2;
        expect(uv.getX(n)).toBeCloseTo(
          (i === 0 ? -0.2 + along : 12.2 - along) / 2,
          5
        );
        expect(uv.getY(n)).toBeCloseTo(-pos.getY(n) / 3, 5);
      }
      const ids = [0, 1, 2].map((n) => g.index!.getX(n)),
        p = ids.map((n) => new THREE.Vector3().fromBufferAttribute(pos, n));
      const a = p[1].clone().sub(p[0]),
        b = p[2].clone().sub(p[0]);
      const du1 = uv.getX(ids[1]) - uv.getX(ids[0]),
        du2 = uv.getX(ids[2]) - uv.getX(ids[0]),
        dv1 = uv.getY(ids[1]) - uv.getY(ids[0]),
        dv2 = uv.getY(ids[2]) - uv.getY(ids[0]);
      const det = du1 * dv2 - du2 * dv1;
      const tangent = a
        .clone()
        .multiplyScalar(dv2)
        .addScaledVector(b, -dv1)
        .divideScalar(det)
        .normalize();
      const bitangent = a
        .clone()
        .multiplyScalar(-du2)
        .addScaledVector(b, du1)
        .divideScalar(det)
        .normalize();
      expect(tangent.x).toBeCloseTo(sign);
      expect(bitangent.y * -1).toBeCloseTo(1);
    }
  });
  it('refuses to rewrite cached geometry or material arrays', () => {
    const f = fixture(),
      fit = { width: 8, height: 3, depth: 0.4 },
      root = f.root.clone(true),
      fitted = fitPlainWallInstance(root, fit);
    expect(() =>
      applyWallSurfaceCharts({
        root: f.root,
        assetRef: 'wall',
        bindings: f.bindings,
        fit,
        ...fitted,
        charts: [
          {
            surfaceId: 'front',
            phase: 0,
            direction: 1,
            repeat: [2, 2],
            elevation: 0,
          },
        ],
      })
    ).toThrow(/owned/);
    const mesh = root.getObjectByName('WallBody_v1')!.children[0] as THREE.Mesh;
    mesh.material = [mesh.material as THREE.Material];
    mesh.geometry.addGroup(0, mesh.geometry.index!.count, 0);
    expect(() =>
      applyWallSurfaceCharts({
        root,
        assetRef: 'wall',
        bindings: f.bindings,
        fit,
        ...fitted,
        charts: [
          {
            surfaceId: 'front',
            phase: 0,
            direction: 1,
            repeat: [2, 2],
            elevation: 0,
          },
        ],
      })
    ).toThrow(/separate exported/);
  });
});
