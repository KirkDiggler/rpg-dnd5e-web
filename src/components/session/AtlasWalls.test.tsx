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
      max: [number, number, number]
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
      return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
    };
    if (url.includes('Door_Surround')) {
      scene.add(
        box([-1, 0, -0.2], [-0.7, 2, 0.2]),
        box([0.7, 0, -0.2], [1, 2, 0.2]),
        box([-1, 2, -0.2], [1, 2.5, 0.2])
      );
    } else {
      scene.add(box([0, 0, -0.1], [1.2, 1.9, 0.1]));
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
    bounds: { min: [-2, 0, -0.2], max: [2, 4, 0.2] },
  },
  base: {
    file: 'env/Crypt_Wall_Base_01.glb',
    sha256: 'a'.repeat(64),
    bounds: { min: [-1.8, 0, -0.3], max: [1.8, 0.3, 0.3] },
  },
  cap: {
    file: 'env/Crypt_Wall_Cap_01.glb',
    sha256: 'a'.repeat(64),
    bounds: { min: [-1.9, 0, -0.2], max: [1.9, 0.4, 0.2] },
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

describe('AtlasWalls profile assembly', () => {
  beforeEach(() => loadedUrls.splice(0));

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

  it('preserves the legacy frame/leaf output and locked-vs-open state contract without a profile', async () => {
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

    const open = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.OPEN } as never]])}
      />
    );
    expect(meshNodes(open)).toHaveLength(1);
  });
});
