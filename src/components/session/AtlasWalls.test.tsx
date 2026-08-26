import type { DungeonShellWallProfile } from '@/rendering/dungeonShellManifest';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasWalls } from './AtlasWalls';

const loadedUrls: string[] = [];

vi.mock('@react-three/drei', () => {
  const useGLTF = (url: string) => {
    loadedUrls.push(url);
    const scene = new THREE.Group();
    const box = (
      min: [number, number, number],
      max: [number, number, number],
      name: string
    ) => {
      const geometry = new THREE.BoxGeometry(
        max[0] - min[0],
        max[1] - min[1],
        max[2] - min[2]
      );
      geometry.translate(
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2
      );
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      mesh.name = name;
      return mesh;
    };
    if (url.includes('Crypt_Wall_Body_01')) {
      scene.add(box([-1, 0, -0.2], [3, 4, 0.2], 'profile-body'));
    } else if (url.includes('Crypt_Wall_Base_01')) {
      scene.add(box([0, 0, -0.3], [2, 0.4, 0.3], 'profile-base'));
    } else if (url.includes('Crypt_Wall_Cap_01')) {
      scene.add(box([0.25, 0, -0.2], [2.25, 0.4, 0.2], 'profile-cap'));
    } else if (url.includes('Door_Surround')) {
      scene.add(
        box([-1, 0, -0.3], [-0.7, 2, 0.3], 'surround-left'),
        box([0.7, 0, -0.3], [1, 2, 0.3], 'surround-right'),
        box([-1, 2, -0.3], [1, 2.5, 0.3], 'surround-lintel')
      );
    } else if (url.includes('Door_Frame')) {
      scene.add(box([-0.9995, 0, -0.2], [0.9995, 2.5347, 0.2], 'legacy-frame'));
    } else {
      scene.add(box([0, 0, -0.1], [1.2, 1.9, 0.1], 'door-leaf'));
    }
    return { scene };
  };
  useGLTF.preload = () => undefined;
  return { useGLTF };
});

const profile: DungeonShellWallProfile = {
  body: {
    file: 'env/Crypt_Wall_Body_01.glb',
    sha256: 'a'.repeat(64),
    localSpanAxis: '+X',
    localFaceAxis: 'Z',
    twoSided: true,
    bounds: { min: [-1, 0, -0.2], max: [3, 4, 0.2] },
  },
  base: {
    file: 'env/Crypt_Wall_Base_01.glb',
    sha256: 'a'.repeat(64),
    bounds: { min: [0, 0, -0.3], max: [2, 0.4, 0.3] },
  },
  cap: {
    file: 'env/Crypt_Wall_Cap_01.glb',
    sha256: 'a'.repeat(64),
    bounds: { min: [0.25, 0, -0.2], max: [2.25, 0.4, 0.2] },
  },
  doorSurround: {
    file: 'env/Crypt_Wall_Door_Surround_01.glb',
    sha256: 'a'.repeat(64),
    bounds: { min: [-1, 0, -0.3], max: [1, 2.5, 0.3] },
  },
};

const wallRuns = [
  {
    key: 'wall',
    start: { x: -2, z: 0 },
    end: { x: -0.5, z: 0 },
    facing: { x: 0, z: 1 },
    height: 0,
  },
  {
    key: 'wall-2',
    start: { x: 0.5, z: 0 },
    end: { x: 2, z: 0 },
    facing: { x: 0, z: 1 },
    height: 0,
  },
];

const doorGaps = [
  {
    key: 'door-key',
    connection: 'door-id',
    position: { x: 0, z: 0 },
    leafPosition: { x: -0.5, z: 0 },
    rotationY: 0,
  },
];

function meshNodes(renderer: {
  scene: { findAll: (predicate: (node: unknown) => boolean) => unknown[] };
}) {
  return renderer.scene.findAll((node) => {
    const n = node as { type?: string; instance?: unknown };
    return n.type === 'Mesh' || n.instance instanceof THREE.Mesh;
  });
}

function primitiveGroups(renderer: {
  scene: { findAll: (predicate: (node: unknown) => boolean) => unknown[] };
}): THREE.Group[] {
  return renderer.scene
    .findAll((node) => {
      const instance = (node as { instance?: unknown }).instance;
      return (
        instance instanceof THREE.Group &&
        instance.children.some((child) => child instanceof THREE.Mesh)
      );
    })
    .map((node) => (node as { instance: THREE.Group }).instance);
}

function worldBox(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
}

function meshName(group: THREE.Group): string {
  return (
    group.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh
  ).name;
}

function expectBox(
  group: THREE.Group,
  min: [number, number, number],
  max: [number, number, number]
) {
  const box = worldBox(group);
  expect(box.min.x).toBeCloseTo(min[0], 6);
  expect(box.min.y).toBeCloseTo(min[1], 6);
  expect(box.min.z).toBeCloseTo(min[2], 6);
  expect(box.max.x).toBeCloseTo(max[0], 6);
  expect(box.max.y).toBeCloseTo(max[1], 6);
  expect(box.max.z).toBeCloseTo(max[2], 6);
}

describe('AtlasWalls profile assembly', () => {
  beforeEach(() => loadedUrls.splice(0));

  it('places the measured profile frame and derived leaf exactly at floor level for both rotations', async () => {
    const twoDoors = [
      { ...doorGaps[0]!, connection: 'door-one' },
      {
        key: 'door-two',
        connection: 'door-two',
        position: { x: 3, z: 1 },
        leafPosition: { x: 2.5, z: 1 },
        rotationY: Math.PI / 2,
      },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={twoDoors}
        profile={profile}
        wallHeight={2.4}
        doors={new Map([['door-one', { state: DoorState.LOCKED } as never]])}
      />
    );
    const groups = primitiveGroups(renderer);
    expect(groups).toHaveLength(4);
    const frames = groups.filter(
      (group) => meshName(group) === 'surround-left'
    );
    const leaves = groups.filter((group) => meshName(group) === 'door-leaf');
    expect(frames).toHaveLength(2);
    expect(leaves).toHaveLength(2); // locked and unknown both stay shut

    const firstFrame = frames.find((group) => group.position.x === 0)!;
    expect(firstFrame.position.toArray()).toEqual([0, 0.2, 0.01]);
    expect(firstFrame.rotation.y).toBeCloseTo(0, 8);
    expectBox(firstFrame, [-0.5, 0.2, -0.215], [0.5, 2.9, 0.235]);
    const firstLeaf = leaves.find((group) => group.position.x === -0.5)!;
    expect(firstLeaf.position.toArray()).toEqual([-0.5, 0.2, 0]);
    expect(firstLeaf.rotation.y).toBeCloseTo(0, 8);
    expectBox(firstLeaf, [-0.5, 0.2, -0.075], [0.24, 2.38, 0.075]);

    const secondFrame = frames.find((group) => group.position.x > 3)!;
    expect(secondFrame.position.x).toBeCloseTo(3.01, 8);
    expect(secondFrame.position.y).toBeCloseTo(0.2, 8);
    expect(secondFrame.position.z).toBeCloseTo(1, 8);
    expect(secondFrame.rotation.y).toBeCloseTo(Math.PI / 2, 8);
    expectBox(secondFrame, [2.785, 0.2, 0.5], [3.235, 2.9, 1.5]);
    const secondLeaf = leaves.find((group) => group.position.x === 2.5)!;
    expect(secondLeaf.rotation.y).toBeCloseTo(Math.PI / 2, 8);
    expectBox(secondLeaf, [2.425, 0.2, 0.26], [2.575, 2.38, 1]);
  });

  it('raises the profile frame to body-plus-cap top at a raised authored height', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        profile={profile}
        wallHeight={4.8}
        doors={new Map([['door-id', { state: DoorState.CLOSED } as never]])}
      />
    );
    const frame = primitiveGroups(renderer).find(
      (group) => meshName(group) === 'surround-left'
    )!;
    expectBox(frame, [-0.5, 0.2, -0.215], [0.5, 5.3, 0.235]);
    const leaf = primitiveGroups(renderer).find(
      (group) => meshName(group) === 'door-leaf'
    )!;
    expectBox(leaf, [-0.5, 0.2, -0.075], [0.24, 4.3, 0.075]);
  });

  it('keeps a combined door plus T/multiple-run fixture independent and adds no second endpoint extension', async () => {
    const combinedRuns: typeof wallRuns = [
      {
        key: 't-trunk',
        start: { x: 0, z: 0 },
        end: { x: 1, z: 0 },
        facing: { x: 0, z: 1 },
        height: 0,
      },
      {
        key: 't-arm',
        start: { x: 1, z: 0 },
        end: { x: 1, z: 1 },
        facing: { x: 1, z: 0 },
        height: 0,
      },
      {
        key: 'second-door-run',
        start: { x: 2, z: 0 },
        end: { x: 3.5, z: 0 },
        facing: { x: 0, z: 1 },
        height: 0,
      },
    ];
    const before = JSON.parse(JSON.stringify(combinedRuns));
    const combinedDoors = [
      { ...doorGaps[0]!, connection: 'door-one' },
      {
        key: 'door-two',
        connection: 'door-two',
        position: { x: 3, z: 1 },
        leafPosition: { x: 2.5, z: 1 },
        rotationY: Math.PI / 2,
      },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={combinedRuns}
        doorGaps={combinedDoors}
        profile={profile}
        doors={
          new Map([
            ['door-one', { state: DoorState.LOCKED } as never],
            ['door-two', { state: DoorState.OPEN } as never],
          ])
        }
      />
    );
    expect(combinedRuns).toEqual(before);
    const groups = primitiveGroups(renderer);
    expect(
      groups.filter((group) => meshName(group) === 'profile-body')
    ).toHaveLength(4);
    expect(
      groups.filter((group) => meshName(group) === 'surround-left')
    ).toHaveLength(2);
    expect(
      groups.filter((group) => meshName(group) === 'door-leaf')
    ).toHaveLength(1);
    const firstRunBody = groups
      .filter((group) => meshName(group) === 'profile-body')
      .find((group) => Math.abs(group.position.z) < 1e-8)!;
    expect(worldBox(firstRunBody).max.x).toBeCloseTo(1.08, 8);
    const secondRunBodies = groups
      .filter((group) => meshName(group) === 'profile-body')
      .filter(
        (group) => Math.abs(group.position.z) < 1e-8 && group.position.x > 2
      );
    expect(secondRunBodies).toHaveLength(2);
    expect(
      Math.max(...secondRunBodies.map((group) => worldBox(group).max.x))
    ).toBeCloseTo(3.58, 8);
  });

  it('uses profile body/base/cap and the accepted surround/leaf files while keeping the click id', async () => {
    const onDoorClick = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={wallRuns}
        doorGaps={doorGaps}
        profile={profile}
        doors={new Map([['door-id', { state: DoorState.LOCKED } as never]])}
        onDoorClick={onDoorClick}
        wallHeight={2.4}
      />
    );

    expect(meshNodes(renderer)).toHaveLength(16); // 4 profile tiles x 3 meshes + 3-part surround + leaf
    expect(loadedUrls).toEqual(
      expect.arrayContaining([
        '/models/synty/env/Crypt_Wall_Body_01.glb',
        '/models/synty/env/Crypt_Wall_Base_01.glb',
        '/models/synty/env/Crypt_Wall_Cap_01.glb',
        '/models/synty/env/Crypt_Wall_Door_Surround_01.glb',
        '/models/synty/env/SM_Env_Door_01.glb',
      ])
    );
    const clickable = renderer.scene.find(
      (node) => typeof node.props.onClick === 'function'
    );
    await renderer.fireEvent(clickable, 'click');
    expect(onDoorClick).toHaveBeenCalledWith('door-id');
  });

  it('omits the closed leaf only when the existing door state is OPEN', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        profile={profile}
        doors={new Map([['door-id', { state: DoorState.OPEN } as never]])}
      />
    );
    expect(meshNodes(renderer)).toHaveLength(3); // surround remains; leaf is omitted
  });

  it('preserves exact legacy frame/leaf files, transforms, positions, and state behavior without profile transforms', async () => {
    const locked = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.LOCKED } as never]])}
      />
    );
    expect(meshNodes(locked)).toHaveLength(2);
    expect(loadedUrls).toEqual(
      expect.arrayContaining([
        '/models/synty/env/SM_Env_Door_Frame_01.glb',
        '/models/synty/env/SM_Env_Door_01.glb',
      ])
    );
    const legacyGroups = primitiveGroups(locked);
    const legacyFrame = legacyGroups.find(
      (group) => meshName(group) === 'legacy-frame'
    )!;
    const legacyLeaf = legacyGroups.find(
      (group) => meshName(group) === 'door-leaf'
    )!;
    expect(legacyFrame.position.toArray()).toEqual([0, 0, 0]);
    expect(legacyFrame.rotation.y).toBe(0);
    expectBox(legacyFrame, [-0.5, 0, -0.15], [0.5, 2.4, 0.15]);
    expect(legacyLeaf.position.toArray()).toEqual([-0.5, 0, 0]);
    expect(legacyLeaf.rotation.y).toBe(0);
    expectBox(legacyLeaf, [-0.5, 0, -0.075], [0.4, 1.7990294709433068, 0.075]);

    const open = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.OPEN } as never]])}
      />
    );
    expect(meshNodes(open)).toHaveLength(1);
    expect(primitiveGroups(open).map(meshName)).toEqual(['legacy-frame']);
  });
});
