import {
  GENERATED_WORLD_ASSETS,
  resolveWorldAsset,
  type GeneratedWorldAsset,
  type WorldAssetResolutionDiagnostic,
} from '@/generated/worldAssetCatalog';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

const roleFixtures = vi.hoisted(() => {
  const base = {
    displayName: 'Roles Fixture',
    category: 'env',
    url: '/models/synty/world-assets/env/dark-fortress/roles-fixture.glb',
    glbSha256: 'a'.repeat(64),
    sizeBytes: 1,
    boundsMeters: [4, 4, 0.4],
    tags: [] as string[],
    supportsDecoration: false,
  };
  return {
    ref: 'dnd5e:env:dark-fortress:roles_fixture_01',
    asset: {
      ...base,
      ref: 'dnd5e:env:dark-fortress:roles_fixture_01',
      roles: [
        { role: 'frame', node: 'Frame_Part' },
        { role: 'leaf', node: 'Leaf_East', door: 'east' },
        { role: 'leaf', node: 'Leaf_West', door: 'west' },
        { role: 'leaf', node: 'Gate_Left', door: 'gate' },
        { role: 'leaf', node: 'Gate_Right', door: 'gate' },
        { role: 'leaf', node: 'Bridge_Leaf', door: 'bridge' },
        { role: 'above', node: 'Masonry_Above' },
      ],
    },
    cornerRef: 'dnd5e:env:dark-fortress:roles_corner_01',
    cornerAsset: {
      ...base,
      ref: 'dnd5e:env:dark-fortress:roles_corner_01',
      url: '/models/synty/world-assets/env/dark-fortress/roles-corner.glb',
      boundsMeters: [4, 3, 4],
      roles: [
        { role: 'leaf', node: 'Leaf_East', door: 'a' },
        { role: 'leaf', node: 'Leaf_West', door: 'b' },
      ],
    },
    missingRef: 'dnd5e:env:dark-fortress:roles_missing_01',
    missingAsset: {
      ...base,
      ref: 'dnd5e:env:dark-fortress:roles_missing_01',
      url: '/models/synty/world-assets/env/dark-fortress/roles-missing.glb',
      roles: [{ role: 'leaf', node: 'Missing_Leaf', door: 'x' }],
    },
  };
});

vi.mock('@/generated/worldAssetCatalog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/generated/worldAssetCatalog')>();
  return {
    ...actual,
    resolveWorldAsset: (
      ref: string,
      onDiagnostic?: (diagnostic: WorldAssetResolutionDiagnostic) => void
    ) => {
      if (ref === roleFixtures.ref) {
        return roleFixtures.asset as unknown as GeneratedWorldAsset;
      }
      if (ref === roleFixtures.missingRef) {
        return roleFixtures.missingAsset as unknown as GeneratedWorldAsset;
      }
      if (ref === roleFixtures.cornerRef) {
        return roleFixtures.cornerAsset as unknown as GeneratedWorldAsset;
      }
      return actual.resolveWorldAsset(ref, onDiagnostic);
    },
  };
});

const loadedUrls = vi.hoisted(() => [] as string[]);
vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
    loadedUrls.push(url);
    if (url.includes('roles-')) {
      const scene = new THREE.Group();
      const material = new THREE.MeshStandardMaterial();
      const add = (
        name: string,
        width: number,
        height: number,
        depth: number,
        x: number,
        y: number,
        z: number
      ) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
          material
        );
        mesh.name = name;
        mesh.position.set(x, y, z);
        scene.add(mesh);
      };
      add('Frame_Part', 4, 3, 0.4, 0, 1.5, 0);
      add('Leaf_East', 1, 2.4, 0.1, 0.5, 1.2, 0);
      add('Leaf_West', 1, 2.4, 0.1, 3.5, 1.2, 0);
      add('Gate_Left', 1, 2.4, 0.1, 0.5, 1.2, 1);
      add('Gate_Right', 1, 2.4, 0.1, 1.5, 1.2, 1);
      add('Masonry_Above', 4, 0.5, 0.4, 0, 3.25, 0);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 4), material);
      bridge.name = 'Bridge_Leaf';
      bridge.geometry.translate(0, 0.1, 2);
      scene.add(bridge);
      return { scene };
    }
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.24207866191864014,
          0.2667747139930725,
          0.23023077845573425
        ),
        new THREE.MeshStandardMaterial()
      )
    );
    return { scene };
  },
}));

import { WorldAssetModel } from './WorldAssetModel';

const REF = 'dnd5e:props:dark-fortress:alchemy_tools_01';

describe('generated exact world asset resolution', () => {
  it('returns only the concrete generated entry and diagnoses unsupported exact refs without fallback', () => {
    expect(resolveWorldAsset(REF)).toEqual(GENERATED_WORLD_ASSETS[REF]);
    expect(resolveWorldAsset(REF)).toMatchObject({
      ref: REF,
      displayName: 'Alchemy Tools 01',
      category: 'props',
      url: '/models/synty/world-assets/props/dark-fortress/alchemy_tools_01.glb',
      supportsDecoration: false,
    });
    const diagnostic = vi.fn();
    expect(
      resolveWorldAsset('dnd5e:props:dark-fortress:missing', diagnostic)
    ).toBeUndefined();
    expect(diagnostic).toHaveBeenCalledWith({
      ref: 'dnd5e:props:dark-fortress:missing',
      reason: 'unsupported-exact-ref',
    });
  });
});

describe('WorldAssetModel provider-baked placement', () => {
  it('loads the exact URL with shared scale while preserving authored transform and baked grounding', async () => {
    loadedUrls.length = 0;
    const onBoundsMeasured = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={REF}
        position={[2, 0.3, -4]}
        rotationY={0.7}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    expect(loadedUrls).toEqual([GENERATED_WORLD_ASSETS[REF]!.url]);
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    expect(model.instance.position.toArray()).toEqual([
      2,
      0.3 + DUNGEON_SURFACE_Y,
      -4,
    ]);
    expect(model.instance.rotation.y).toBeCloseTo(0.7);
    expect(model.instance.scale.x).toBeCloseTo(SYNTY_SCALE);
    expect(
      renderer.scene.findAllByProps({ name: 'prop-model-bounds-anchor' })
    ).toHaveLength(0);
    const [width, height, depth] = GENERATED_WORLD_ASSETS[REF]!.boundsMeters;
    expect(onBoundsMeasured).toHaveBeenCalledWith({
      minY: 0,
      maxY: height,
      width,
      height,
      depth,
    });
    await renderer.unmount();
  });

  it('applies grounded Y-only height scaling to generated bounds', async () => {
    const onBoundsMeasured = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={REF}
        position={[0, 0, 0]}
        heightScale={1.5}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    expect(model.instance.scale.toArray()).toEqual([
      SYNTY_SCALE,
      SYNTY_SCALE * 1.5,
      SYNTY_SCALE,
    ]);
    const [width, height, depth] = GENERATED_WORLD_ASSETS[REF]!.boundsMeters;
    expect(onBoundsMeasured).toHaveBeenCalledWith({
      minY: 0,
      maxY: height * 1.5,
      width,
      height: height * 1.5,
      depth,
    });
  });

  it('reports the actual rendered source geometry size exactly once', async () => {
    const onBoundsMeasured = vi.fn();
    const [width, height, depth] = GENERATED_WORLD_ASSETS[REF]!.boundsMeters;
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={REF}
        position={[0, 0, 0]}
        rotationY={0}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    model.instance.updateWorldMatrix(true, true);
    const actual = new THREE.Box3()
      .setFromObject(model.instance)
      .getSize(new THREE.Vector3());
    expect(actual.x).toBeCloseTo(width);
    expect(actual.y).toBeCloseTo(height);
    expect(actual.z).toBeCloseTo(depth);
    expect(onBoundsMeasured).toHaveBeenCalledTimes(1);
    expect(onBoundsMeasured).toHaveBeenCalledWith({
      minY: 0,
      maxY: height,
      width,
      height,
      depth,
    });
    await renderer.unmount();
  });

  it('renders empty and reports a diagnostic for an unsupported exact ref', async () => {
    loadedUrls.length = 0;
    const onDiagnostic = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef="dnd5e:props:dark-fortress:missing"
        position={[0, 0, 0]}
        onDiagnostic={onDiagnostic}
      />
    );
    expect(renderer.scene.children).toHaveLength(0);
    expect(loadedUrls).toEqual([]);
    expect(onDiagnostic).toHaveBeenCalledWith({
      ref: 'dnd5e:props:dark-fortress:missing',
      reason: 'unsupported-exact-ref',
    });
  });
});

describe('WorldAssetModel named roles', () => {
  it('exposes one bindable door per door group with its leaf pivot', async () => {
    const onDoorsResolved = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={roleFixtures.ref}
        position={[0, 0, 0]}
        onDoorsResolved={onDoorsResolved}
      />
    );
    expect(onDoorsResolved).toHaveBeenCalledTimes(1);
    const doors = onDoorsResolved.mock.calls[0]![0] as Array<{
      id: string;
      position: [number, number, number];
    }>;
    expect(doors.map((door) => door.id).sort()).toEqual([
      'bridge',
      'east',
      'gate',
      'west',
    ]);
    expect(doors.find((door) => door.id === 'east')!.position).toEqual([
      0.5, 1.2, 0,
    ]);
    expect(doors.find((door) => door.id === 'gate')!.position).toEqual([
      0.5, 1.2, 1,
    ]);
    expect(doors.find((door) => door.id === 'bridge')!.position).toEqual([
      0, 0, 0,
    ]);
    await renderer.unmount();
  });

  it('fails by asset, role, and node when a declared node is absent and renders nothing', async () => {
    const onDiagnostic = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={roleFixtures.missingRef}
        position={[0, 0, 0]}
        onDiagnostic={onDiagnostic}
      />
    );
    expect(onDiagnostic).toHaveBeenCalledWith({
      ref: roleFixtures.missingRef,
      reason: 'missing-role-node',
      role: 'leaf',
      node: 'Missing_Leaf',
    });
    expect(
      renderer.scene.findAllByProps({ name: 'world-asset-model' })
    ).toHaveLength(0);
    await renderer.unmount();
  });

  it('grows only the above part, by whole courses, and reports the grown bounds', async () => {
    const onBoundsMeasured = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={roleFixtures.ref}
        position={[0, 0, 0]}
        heightScale={2}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    expect(model.instance.scale.y).toBeCloseTo(SYNTY_SCALE);
    expect(model.instance.getObjectByName('Frame_Part')!.scale.y).toBeCloseTo(
      1
    );
    expect(model.instance.getObjectByName('Leaf_East')!.scale.y).toBeCloseTo(1);
    // The assembly reaches its authored height times the scale — the same
    // rule a wall follows — and the courses past the opening keep their
    // authored thickness to within half a course.
    const row = 0.5 * SYNTY_SCALE;
    const opening = 4 - row;
    const above = 4 * 2 - opening;
    const courses = Math.round(above / row);
    expect(
      model.instance.getObjectByName('Masonry_Above')!.scale.y
    ).toBeCloseTo(above / (courses * row));
    expect(onBoundsMeasured).toHaveBeenCalledWith({
      minY: 0,
      maxY: 8,
      width: 4,
      height: 8,
      depth: 0.4,
    });
    await renderer.unmount();
  });

  it('tiles the above part and leaves the rest pose untouched at 100%', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel assetRef={roleFixtures.ref} position={[0, 0, 0]} />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    const above = model.instance.getObjectByName('Masonry_Above')!;
    expect(above.scale.y).toBeCloseTo(1);
    expect(above.position.y).toBeCloseTo(3.25);
    // Every course past the authored one stays hidden, so a door at its rest
    // height is the GLB's own geometry and nothing else.
    const courses: THREE.Object3D[] = [];
    model.instance.traverse((object) => {
      if (object.name === 'Masonry_Above') courses.push(object);
    });
    expect(courses.filter((course) => course.visible)).toHaveLength(1);

    const grown = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={roleFixtures.ref}
        position={[0, 0, 0]}
        heightScale={2}
      />
    );
    const grownModel = grown.scene.findByProps({ name: 'world-asset-model' });
    const stacked: THREE.Object3D[] = [];
    grownModel.instance.traverse((object) => {
      if (object.name === 'Masonry_Above') stacked.push(object);
    });
    const visible = stacked.filter((course) => course.visible);
    expect(visible.length).toBeGreaterThan(1);
    // Stacked, not stretched: each course sits one course above the last at
    // its own scaled thickness, so the column is continuous.
    const stride = 0.5 * visible[0]!.scale.y;
    visible.forEach((course, index) => {
      expect(course.position.y).toBeCloseTo(3.25 + index * stride);
    });
    await renderer.unmount();
    await grown.unmount();
  });

  it('leaves the bounds unchanged when roles have no above part', async () => {
    const onBoundsMeasured = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={roleFixtures.cornerRef}
        position={[0, 0, 0]}
        heightScale={2}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    expect(model.instance.scale.y).toBeCloseTo(SYNTY_SCALE);
    expect(
      model.instance.getObjectByName('Masonry_Above')!.scale.y
    ).toBeCloseTo(1);
    expect(onBoundsMeasured).toHaveBeenCalledWith({
      minY: 0,
      maxY: 3,
      width: 4,
      height: 3,
      depth: 4,
    });
    await renderer.unmount();
  });

  it('derives a horizontal hinge for a drawbridge-style leaf', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={roleFixtures.ref}
        position={[0, 0, 0]}
        openDoors={['bridge']}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    const leaf = model.instance.getObjectByName('Bridge_Leaf')!;
    const axis = new THREE.Vector3(
      leaf.quaternion.x,
      leaf.quaternion.y,
      leaf.quaternion.z
    ).normalize();
    expect(Math.abs(axis.x)).toBeCloseTo(1, 2);
    expect(axis.y).toBeCloseTo(0, 2);
    expect(axis.z).toBeCloseTo(0, 2);
    await renderer.unmount();
  });

  it('swings every leaf in an open group about its own hinge and leaves other groups at rest', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={roleFixtures.ref}
        position={[0, 0, 0]}
        openDoors={['gate']}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    const left = model.instance.getObjectByName('Gate_Left')!;
    const right = model.instance.getObjectByName('Gate_Right')!;
    const east = model.instance.getObjectByName('Leaf_East')!;
    const rest = new THREE.Quaternion();
    expect(left.quaternion.angleTo(rest)).toBeCloseTo(Math.PI / 2, 1);
    expect(right.quaternion.angleTo(rest)).toBeCloseTo(Math.PI / 2, 1);
    const forward = (object: THREE.Object3D) =>
      new THREE.Vector3(0, 0, 1).applyQuaternion(object.quaternion);
    expect(Math.sign(forward(left).x)).toBe(-Math.sign(forward(right).x));
    expect(east.quaternion.angleTo(rest)).toBeCloseTo(0);
    await renderer.unmount();
  });

  it('opens every declared group when the whole assembly is open', async () => {
    // `openDoors` names groups; `open` is the coarser form for a caller
    // holding a placed door's live state — the item IS one door, whatever
    // opening count its asset declares — and that caller never resolved
    // those ids.
    const rest = new THREE.Quaternion();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel assetRef={roleFixtures.ref} position={[0, 0, 0]} open />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    for (const node of ['Gate_Left', 'Gate_Right', 'Leaf_East', 'Leaf_West']) {
      expect(
        model.instance.getObjectByName(node)!.quaternion.angleTo(rest)
      ).toBeCloseTo(Math.PI / 2, 1);
    }
    await renderer.unmount();
  });
});

describe('authored node names stay data, not code', () => {
  it('never names an authored door node in hand-written source', () => {
    const forbidden =
      /(?<![A-Za-z0-9_])Door_(Frame|Left|Right|Wall_Above)(?![A-Za-z0-9_])/;
    const walk = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walk(path);
        return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
      });
    const files = walk(join(process.cwd(), 'src')).filter(
      (path) =>
        !path.includes(join('src', 'generated')) &&
        !/\.test\.(ts|tsx)$/.test(path)
    );
    const offenders = files.filter((path) =>
      forbidden.test(readFileSync(path, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
