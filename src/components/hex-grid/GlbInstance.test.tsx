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

  it('bakes a nested rotated/scaled two-mesh fixture to independently derived bounds, spacing, normals, and one floor anchor', async () => {
    const source = (
      useGLTF as unknown as (url: string) => { scene: THREE.Group }
    )('/models/synty/env/nested-transform.glb').scene;

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

    // Hand-derived from the fixture: the outer scene transform is removed;
    // the child group rotates mesh A to x=[.75,1.25], z=[0,2] and mesh B to
    // x=[2.25,2.75], z=[2,4]. Applying [2,3,4] and shifting the shared
    // lowest Y (4.5) to the floor gives these literal results. A test that
    // leaves the child transform live would double-transform these boxes.
    const expectedBoxes = [
      { min: [1.5, 0, 0] as const, max: [2.5, 3, 8] as const },
      { min: [4.5, 0, 8] as const, max: [5.5, 3, 16] as const },
    ];
    for (let i = 0; i < meshes.length; i += 1) {
      meshes[i]!.geometry.computeBoundingBox();
      expect(meshes[i]!.geometry.boundingBox!.min.toArray()).toEqual(
        expectedBoxes[i]!.min
      );
      expect(meshes[i]!.geometry.boundingBox!.max.toArray()).toEqual(
        expectedBoxes[i]!.max
      );
    }
    expect(
      meshes[1]!.geometry.boundingBox!.min.x -
        meshes[0]!.geometry.boundingBox!.max.x
    ).toBe(2);
    expect(meshes[0]!.geometry.boundingBox!.max.z).toBe(
      meshes[1]!.geometry.boundingBox!.min.z
    );

    // BoxGeometry's first authored normal is +Z. Three.js's positive Y
    // rotation maps it to -Z here; the non-uniform scale preserves that
    // direction after the inverse-transpose normal bake.
    const normal = meshes[0]!.geometry.getAttribute('normal');
    expect(normal.getX(0)).toBeCloseTo(0, 8);
    expect(normal.getY(0)).toBe(0);
    expect(normal.getZ(0)).toBe(-1);
    expect(
      normal.getX(0) ** 2 + normal.getY(0) ** 2 + normal.getZ(0) ** 2
    ).toBe(1);

    const bakedGroup = renderer.scene.find(
      (node) =>
        (node as { instance?: unknown }).instance instanceof THREE.Group &&
        (node as unknown as { instance: THREE.Group }).instance.name ===
          'nested-transform-group'
    ) as unknown as { instance: THREE.Group };
    expect(bakedGroup.instance.position.toArray()).toEqual([0, 0, 0]);
    expect(bakedGroup.instance.scale.toArray()).toEqual([1, 1, 1]);
    expect(bakedGroup.instance.rotation.x).toBeCloseTo(0, 8);
    expect(bakedGroup.instance.rotation.y).toBeCloseTo(0, 8);
    expect(bakedGroup.instance.rotation.z).toBeCloseTo(0, 8);
    expect(bakedGroup.instance.rotation.order).toBe('XYZ');
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

  it('keeps the placement root exact and applies an optional offset only to the cloned child without mutating shared geometry', async () => {
    const source = (
      useGLTF as unknown as (url: string) => { scene: THREE.Group }
    )('/models/synty/env/child-offset.glb').scene;
    const sourceMesh = source.children[0] as THREE.Mesh;
    sourceMesh.geometry.computeBoundingBox();
    const sourceBoundsBefore = sourceMesh.geometry.boundingBox!.clone();

    const renderer = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="child-offset.glb"
        position={{ x: 3, z: 4 }}
        positionY={0.2}
        rotationY={Math.PI / 2}
        scale={[2, 3, 4]}
        localOffset={[0.25, 0.5, -0.75]}
      />
    );
    const groupNodes = renderer.scene.findAll(
      (node) => (node as { type?: string }).type === 'Group'
    ) as unknown as Array<{
      props: {
        object?: THREE.Group;
        position?: [number, number, number];
        rotation?: [number, number, number];
      };
    }>;
    const hingeRoot = groupNodes.find(
      (node) =>
        node.props.position?.[0] === 3 &&
        node.props.position[1] === 0.2 &&
        node.props.position[2] === 4
    );
    expect(hingeRoot?.props.rotation).toEqual([0, Math.PI / 2, 0]);
    const translatedChild = groupNodes.find((node) => node.props.object);
    expect(translatedChild?.props.position).toEqual([0.25, 0.5, -0.75]);
    expect(translatedChild?.props.rotation).toEqual([0, 0, 0]);

    const defaultRenderer = await ReactThreeTestRenderer.create(
      <GlbInstance
        file="child-offset.glb"
        position={{ x: 0, z: 0 }}
        rotationY={0}
        scale={[2, 3, 4]}
      />
    );
    expect(findMesh(renderer).geometry).toBe(
      findMesh(defaultRenderer).geometry
    );
    sourceMesh.geometry.computeBoundingBox();
    expect(sourceMesh.geometry.boundingBox!.min.toArray()).toEqual(
      sourceBoundsBefore.min.toArray()
    );
    expect(sourceMesh.geometry.boundingBox!.max.toArray()).toEqual(
      sourceBoundsBefore.max.toArray()
    );
    expect(source.position.toArray()).toEqual([0, 0, 0]);
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
