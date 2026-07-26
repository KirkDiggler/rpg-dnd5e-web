import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// Same stub convention as SyntyHexWall.test.tsx/WallRunMesh.test.tsx.
vi.mock('@react-three/drei', () => {
  const scene = new THREE.Group();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    )
  );
  return { useGLTF: () => ({ scene }) };
});

import { GlbInstance } from './GlbInstance';

function findMesh(renderer: {
  scene: { findAll: (pred: (node: unknown) => boolean) => unknown[] };
}): THREE.Mesh {
  const [node] = renderer.scene.findAll(
    (n) => (n as { instance?: unknown }).instance instanceof THREE.Mesh
  );
  return (node as { instance: THREE.Mesh }).instance;
}

describe('GlbInstance — non-uniform scale baking (W3/W4 GlbInstance fix)', () => {
  it('a uniform scale is applied to the Object3D directly (unchanged fast path) — geometry is the shared cache original, untouched', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="a.glb"
        position={{ x: 0, z: 0 }}
        rotationY={0}
        scale={0.75}
      />
    );
    const mesh = findMesh(renderer);
    // BoxGeometry's default vertex position bounds are +/-0.5 on every
    // axis; a uniform scale leaves the GEOMETRY itself untouched (scale
    // lives on the Object3D), so the raw position attribute is unchanged.
    const pos = mesh.geometry.getAttribute('position');
    expect(Math.max(...pos.array)).toBeCloseTo(0.5, 5);
  });

  it('a non-uniform scale is baked into the geometry (vertex positions transformed, not left on Object3D.scale)', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="b.glb"
        position={{ x: 0, z: 0 }}
        rotationY={0}
        scale={[2, 3, 4]}
      />
    );
    const mesh = findMesh(renderer);
    const pos = mesh.geometry.getAttribute('position');
    // BoxGeometry's +/-0.5 bounds baked at scale [2,3,4] -> max extents
    // [1, 1.5, 2] on x/y/z respectively — proves the transform landed on
    // the geometry itself, not the (left-at-1) Object3D scale.
    let maxX = 0,
      maxY = 0,
      maxZ = 0;
    for (let i = 0; i < pos.count; i++) {
      maxX = Math.max(maxX, Math.abs(pos.getX(i)));
      maxY = Math.max(maxY, Math.abs(pos.getY(i)));
      maxZ = Math.max(maxZ, Math.abs(pos.getZ(i)));
    }
    expect(maxX).toBeCloseTo(1, 5);
    expect(maxY).toBeCloseTo(1.5, 5);
    expect(maxZ).toBeCloseTo(2, 5);
  });

  it('two instances with the SAME file and non-uniform scale share the identical cached geometry object (no redundant clone+recompute)', async () => {
    const rendererA = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="shared.glb"
        position={{ x: 0, z: 0 }}
        rotationY={0}
        scale={[0.5, 0.6, 0.7]}
      />
    );
    const rendererB = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="shared.glb"
        position={{ x: 5, z: 5 }}
        rotationY={1}
        scale={[0.5, 0.6, 0.7]}
      />
    );
    const meshA = findMesh(rendererA);
    const meshB = findMesh(rendererB);
    expect(meshA.geometry).toBe(meshB.geometry);
  });

  it('two instances with the same file but DIFFERENT non-uniform scale get distinct geometries', async () => {
    const rendererA = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="distinct.glb"
        position={{ x: 0, z: 0 }}
        rotationY={0}
        scale={[0.5, 0.6, 0.7]}
      />
    );
    const rendererB = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="distinct.glb"
        position={{ x: 0, z: 0 }}
        rotationY={0}
        scale={[0.9, 0.6, 0.7]}
      />
    );
    const meshA = findMesh(rendererA);
    const meshB = findMesh(rendererB);
    expect(meshA.geometry).not.toBe(meshB.geometry);
  });
});
