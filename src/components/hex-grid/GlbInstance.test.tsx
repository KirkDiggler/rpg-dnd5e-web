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

  const nestedScene = new THREE.Group();
  nestedScene.position.set(20, 30, 40);
  nestedScene.rotation.y = 0.37;
  nestedScene.scale.set(9, 8, 7);
  const nestedGroup = new THREE.Group();
  nestedGroup.name = 'nested-transform-group';
  nestedGroup.position.set(1, 2, 3);
  nestedGroup.rotation.y = Math.PI / 2;
  nestedGroup.scale.set(2, 1, 0.5);
  const meshA = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
  );
  meshA.name = 'submesh-a';
  meshA.position.set(1, 0, 0);
  const meshB = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x00ff00 })
  );
  meshB.name = 'submesh-b';
  meshB.position.set(0, 0, 3);
  nestedGroup.add(meshA, meshB);
  nestedScene.add(nestedGroup);

  const skinnedScene = new THREE.Group();
  skinnedScene.add(
    new THREE.SkinnedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    )
  );

  return {
    useGLTF: (url: string) => ({
      scene: url.includes('nested-transform')
        ? nestedScene
        : url.includes('skinned')
          ? skinnedScene
          : scene,
    }),
  };
});

import { useGLTF } from '@react-three/drei';
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

  it("a non-uniform scale is baked into the geometry (vertex positions transformed, not left on Object3D.scale) AND base-anchored to the floor plane (Y=0), not left centered on the model's own local origin", async () => {
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
    // BoxGeometry's +/-0.5 bounds baked at scale [2,3,4] -> X/Z stay
    // centered (+/-1, +/-2 — proves the scale transform landed on the
    // geometry itself, not the left-at-1 Object3D scale), but Y is
    // base-anchored (Kirk's live-walk extreme-height test,
    // ?wallCutaway=1&wallHeight=12.4: tall walls floated, a clear gap
    // between the floor and the piece's own base) — the centered [-1.5,
    // 1.5] range shifts to [0, 3] so the SCALED geometry's own base sits
    // exactly at local Y=0, matching where <primitive position={[x,0,z]}>
    // actually places the floor, regardless of this model's own
    // (here, centered) authored pivot.
    let maxX = 0,
      minY = Infinity,
      maxY = -Infinity,
      maxZ = 0;
    for (let i = 0; i < pos.count; i++) {
      maxX = Math.max(maxX, Math.abs(pos.getX(i)));
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
      maxZ = Math.max(maxZ, Math.abs(pos.getZ(i)));
    }
    expect(maxX).toBeCloseTo(1, 5);
    expect(maxZ).toBeCloseTo(2, 5);
    expect(minY).toBeCloseTo(0, 5);
    expect(maxY).toBeCloseTo(3, 5);
  });

  it.each([
    { sy: 0.8, label: 'default wallHeight' },
    { sy: 2.4, label: 'cutaway tall default' },
    { sy: 12.4, label: "Kirk's extreme-value test" },
  ])(
    "base-anchors the geometry at $label (sy=$sy): the scaled bounding box's bottom sits at Y=0 regardless of scale magnitude",
    async ({ sy }) => {
      const renderer = await ReactThreeTestRenderer.create(
        <GlbInstance
          file={`anchor-${sy}.glb`}
          position={{ x: 0, z: 0 }}
          rotationY={0}
          scale={[0.75, sy, 0.75]}
        />
      );
      const mesh = findMesh(renderer);
      const pos = mesh.geometry.getAttribute('position');
      let minY = Infinity;
      for (let i = 0; i < pos.count; i++) {
        minY = Math.min(minY, pos.getY(i));
      }
      expect(minY).toBeCloseTo(0, 5);
    }
  );

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

  it('bakes nested mesh transforms into each geometry while preserving spacing, names, materials, normals, and one shared floor anchor', async () => {
    const source = (
      useGLTF as unknown as (url: string) => { scene: THREE.Group }
    )('/models/synty/env/nested-transform.glb').scene;
    source.updateMatrixWorld(true);
    const relativeRoot = source.matrixWorld.clone().invert();
    const rootScale = new THREE.Matrix4().makeScale(2, 3, 4);
    const expected: Array<{
      name: string;
      box: THREE.Box3;
      normal: THREE.Vector3;
    }> = [];
    source.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const relative = relativeRoot.clone().multiply(child.matrixWorld);
      const geometry = child.geometry
        .clone()
        .applyMatrix4(rootScale.clone().multiply(relative));
      geometry.computeBoundingBox();
      expected.push({
        name: child.name,
        box: geometry.boundingBox!.clone(),
        normal: new THREE.Vector3(
          geometry.getAttribute('normal').getX(0),
          geometry.getAttribute('normal').getY(0),
          geometry.getAttribute('normal').getZ(0)
        ),
      });
      geometry.dispose();
    });
    const expectedMinY = Math.min(...expected.map(({ box }) => box.min.y));

    const renderer = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="nested-transform.glb"
        position={{ x: 0, z: 0 }}
        rotationY={0}
        scale={[2, 3, 4]}
      />
    );
    const meshes = renderer.scene
      .findAll(
        (node) =>
          (node as { instance?: unknown }).instance instanceof THREE.Mesh
      )
      .map((node) => (node as unknown as { instance: THREE.Mesh }).instance)
      .sort((a, b) => a.name.localeCompare(b.name));

    expect(meshes.map((mesh) => mesh.name)).toEqual(['submesh-a', 'submesh-b']);
    expect(
      meshes.map((mesh) => {
        const material = Array.isArray(mesh.material)
          ? mesh.material[0]!
          : mesh.material;
        return (material as THREE.MeshStandardMaterial).color.getHexString();
      })
    ).toEqual(['ff0000', '00ff00']);
    expect(source.position.toArray()).toEqual([20, 30, 40]);
    expect(meshes[0]!.position.toArray()).toEqual([0, 0, 0]);
    expect(meshes[0]!.scale.toArray()).toEqual([1, 1, 1]);

    let combinedMinY = Infinity;
    for (let i = 0; i < meshes.length; i += 1) {
      const geometry = meshes[i]!.geometry;
      geometry.computeBoundingBox();
      const actual = geometry.boundingBox!;
      const wanted = expected[i]!.box.clone().translate(
        new THREE.Vector3(0, -expectedMinY, 0)
      );
      expect(actual.min.toArray()).toEqual(wanted.min.toArray());
      expect(actual.max.toArray()).toEqual(wanted.max.toArray());
      const normal = meshes[i]!.geometry.getAttribute('normal');
      expect(
        new THREE.Vector3(
          normal.getX(0),
          normal.getY(0),
          normal.getZ(0)
        ).toArray()
      ).toEqual(expected[i]!.normal.toArray());
      expect(
        normal.getX(0) ** 2 + normal.getY(0) ** 2 + normal.getZ(0) ** 2
      ).toBeCloseTo(1, 8);
      combinedMinY = Math.min(combinedMinY, actual.min.y);
    }
    expect(combinedMinY).toBeCloseTo(0, 8);
  });

  it('refuses to flatten a skinned mesh for non-uniform baking', async () => {
    await expect(
      ReactThreeTestRenderer.create(
        <GlbInstance
          file="skinned-fixture.glb"
          position={{ x: 0, z: 0 }}
          rotationY={0}
          scale={[2, 3, 4]}
        />
      )
    ).rejects.toThrow(/skinned/i);
  });

  it('defaults positionY to zero and adds it to the primitive world Y position', async () => {
    const defaultRenderer = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="position-default.glb"
        position={{ x: 1, z: 2 }}
        rotationY={0}
        scale={1}
      />
    );
    const positionedRenderer = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="position-additive.glb"
        position={{ x: 1, z: 2 }}
        positionY={0.2}
        rotationY={0}
        scale={1}
      />
    );
    const primitive = (renderer: typeof defaultRenderer) =>
      renderer.scene.findAll(
        (node) =>
          (node as { instance?: unknown }).instance instanceof THREE.Group
      )[0] as unknown as { instance: THREE.Group };
    expect(primitive(defaultRenderer).instance.position.y).toBe(0);
    expect(primitive(positionedRenderer).instance.position.toArray()).toEqual([
      1, 0.2, 2,
    ]);
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
