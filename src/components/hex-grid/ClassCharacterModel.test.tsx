import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { ComponentProps } from 'react';
import * as THREE from 'three';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
  MainHandSocket,
} from './mainHandPresentation';
import type {
  OffHandAttachmentStatus,
  OffHandPresentation,
} from './offHandEquipment';

const fighterUrl = '/models/synty/characters/fighter.glb';
const failedWeapon = '/models/synty/characters/weapons/fighter-weapon.glb';
const firstWeapon = '/models/synty/characters/weapons/fighter-weapon-a.glb';
const remappedWeapon =
  '/models/synty/characters/weapons/fighter-weapon-remap.glb';
const socket = {
  bone: 'Hand_R',
  boneUnitMeters: 0.01,
  positionMeters: [-0.0554, 0.1299, 0.0237] as [number, number, number],
  rotationQuaternion: [-0.7071067811865475, 0, 0, 0.7071067811865476] as [
    number,
    number,
    number,
    number,
  ],
  scale: 1,
};
const modularFantasyHeroSocket = {
  bone: 'Hand_R',
  boneUnitMeters: 0.01,
  positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199] as [
    number,
    number,
    number,
  ],
  rotationQuaternion: [
    -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
    0.47490151020194044,
  ] as [number, number, number, number],
  scale: 1,
} satisfies MainHandSocket;

type Task8ClassCharacterModelProps = ComponentProps<
  typeof ClassCharacterModel
> & {
  mainHandSocketOverride?: MainHandSocket;
  offHandPresentation?: OffHandPresentation;
  onOffHandStatus?: (status: OffHandAttachmentStatus) => void;
};

const Task8ClassCharacterModel = ClassCharacterModel as unknown as (
  props: Task8ClassCharacterModelProps
) => ReturnType<typeof ClassCharacterModel>;

const gltf = vi.hoisted(() => ({
  scenes: new Map<string, THREE.Group>(),
  failed: new Set<string>(),
}));

vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
    if (gltf.failed.has(url)) throw new Error(`failed ${url}`);

    let scene = gltf.scenes.get(url);
    if (!scene) {
      scene = new THREE.Group();
      scene.name = `cached:${url}`;

      if (url === fighterUrl) {
        const root = new THREE.Group();
        root.name = 'Root';
        const hand = new THREE.Bone();
        hand.name = 'Hand_R';
        const offHand = new THREE.Bone();
        offHand.name = 'Hand_L';
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial()
        );
        body.name = 'fighter-body';
        root.add(hand, offHand, body);
        scene.add(root);
      } else {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial()
        );
        mesh.name = `cached-mesh:${url}`;
        scene.add(mesh);
      }

      gltf.scenes.set(url, scene);
    }

    return { scene, animations: [] };
  },
  useAnimations: () => ({ actions: {}, names: [] }),
}));

import { ClassCharacterModel } from './ClassCharacterModel';

function presentationFor(weaponUrl: string): MainHandPresentation {
  return {
    ref: 'dnd5e:item:longsword',
    weaponUrl,
    socket,
  };
}

function handBone(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
): THREE.Bone {
  return renderer.scene.findAll(
    (node) =>
      node.instance instanceof THREE.Bone &&
      (node.instance as THREE.Bone).name === 'Hand_R'
  )[0]!.instance as THREE.Bone;
}

function expectVectorCloseTo(
  actual: readonly number[],
  expected: readonly number[]
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]!, 9);
  });
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  gltf.scenes.clear();
  gltf.failed.clear();
});

it('mounts main and off-hand assets independently on their exact bones', async () => {
  const offStatuses: OffHandAttachmentStatus[] = [];
  const offHandPresentation: OffHandPresentation = {
    ref: 'dnd5e:item:shield',
    assetUrl: '/models/synty/off-hand/shield.glb',
    assetKind: 'shield',
    socket: {
      bone: 'Hand_L',
      boneUnitMeters: 0.01,
      positionMeters: [0, 0, 0],
      rotationQuaternion: [0, 0, 0, 1],
      scale: 1,
    },
  };
  const renderer = await ReactThreeTestRenderer.create(
    <Task8ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={presentationFor(firstWeapon)}
      offHandPresentation={offHandPresentation}
      onOffHandStatus={(status) => offStatuses.push(status)}
    />
  );

  const right = renderer.scene.findAll(
    (node) =>
      node.instance instanceof THREE.Bone && node.instance.name === 'Hand_R'
  )[0]!.instance as THREE.Bone;
  const left = renderer.scene.findAll(
    (node) =>
      node.instance instanceof THREE.Bone && node.instance.name === 'Hand_L'
  )[0]!.instance as THREE.Bone;
  expect(right.children).toHaveLength(1);
  expect(left.children).toHaveLength(1);
  expect(offStatuses.at(-1)?.code).toBe('attached');
});

it('cleans both slots when the same exact ref and URL are equipped in both hands', async () => {
  const sharedUrl = '/models/synty/weapons/dagger.glb';
  const main = presentationFor(sharedUrl);
  main.ref = 'dnd5e:item:dagger';
  const off: OffHandPresentation = {
    ref: 'dnd5e:item:dagger',
    assetUrl: sharedUrl,
    assetKind: 'weapon',
    socket: {
      bone: 'Hand_L',
      boneUnitMeters: 0.01,
      positionMeters: [0, 0, 0],
      rotationQuaternion: [0, 0, 0, 1],
      scale: 1,
    },
  };
  const renderer = await ReactThreeTestRenderer.create(
    <Task8ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={main}
      offHandPresentation={off}
    />
  );
  const bones = (name: string) =>
    renderer.scene.findAll(
      (node) =>
        node.instance instanceof THREE.Bone && node.instance.name === name
    )[0]!.instance as THREE.Bone;
  expect(bones('Hand_R').children).toHaveLength(1);
  expect(bones('Hand_L').children).toHaveLength(1);

  await renderer.update(<Task8ClassCharacterModel url={fighterUrl} />);

  expect(bones('Hand_R').children).toHaveLength(0);
  expect(bones('Hand_L').children).toHaveLength(0);
});

it('keeps the fighter rendered when only its weapon load fails', async () => {
  const statuses: MainHandAttachmentStatus[] = [];
  gltf.failed.add(failedWeapon);

  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={presentationFor(failedWeapon)}
      onMainHandStatus={(status) => statuses.push(status)}
    />
  );

  expect(
    renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        'fighter-body'
    )
  ).toHaveLength(1);
  expect(statuses.at(-1)?.code).toBe('asset-load-failed');
});

it('remounts the actual ref+URL attachment path when the ref stays the same', async () => {
  const statuses: MainHandAttachmentStatus[] = [];
  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={presentationFor(firstWeapon)}
      onMainHandStatus={(status) => statuses.push(status)}
    />
  );

  const hand = handBone(renderer);
  const firstClone = hand.children[0]!;

  expect(
    firstClone.getObjectByName(`cached-mesh:${firstWeapon}`)
  ).toBeDefined();
  expect(gltf.scenes.get(firstWeapon)?.parent).toBeNull();

  await renderer.update(
    <ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={presentationFor(remappedWeapon)}
      onMainHandStatus={(status) => statuses.push(status)}
    />
  );

  const remappedClone = hand.children[0]!;
  expect(hand.children).toHaveLength(1);
  expect(remappedClone).not.toBe(firstClone);
  expect(firstClone.parent).toBeNull();
  expect(
    remappedClone.getObjectByName(`cached-mesh:${remappedWeapon}`)
  ).toBeDefined();
  expect(
    remappedClone.getObjectByName(`cached-mesh:${firstWeapon}`)
  ).toBeUndefined();
  expect(gltf.scenes.get(firstWeapon)?.parent).toBeNull();
  expect(gltf.scenes.get(remappedWeapon)?.parent).toBeNull();
  expect(statuses.at(-1)).toMatchObject({
    code: 'attached',
    ref: 'dnd5e:item:longsword',
    weaponUrl: remappedWeapon,
  });
});

it('attaches the clone at the override socket and leaves the input presentation unchanged', async () => {
  const mainHandPresentation = presentationFor(firstWeapon);
  const originalPresentation = {
    ref: mainHandPresentation.ref,
    weaponUrl: mainHandPresentation.weaponUrl,
    socket: {
      bone: mainHandPresentation.socket.bone,
      boneUnitMeters: mainHandPresentation.socket.boneUnitMeters,
      positionMeters: [...mainHandPresentation.socket.positionMeters] as [
        number,
        number,
        number,
      ],
      rotationQuaternion: [
        ...mainHandPresentation.socket.rotationQuaternion,
      ] as [number, number, number, number],
      scale: mainHandPresentation.socket.scale,
    },
  } satisfies MainHandPresentation;

  const renderer = await ReactThreeTestRenderer.create(
    <Task8ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={mainHandPresentation}
      mainHandSocketOverride={modularFantasyHeroSocket}
    />
  );

  const attachedClone = handBone(renderer).children[0]!;
  const unitsPerMeter = 1 / modularFantasyHeroSocket.boneUnitMeters;

  expectVectorCloseTo(attachedClone.position.toArray(), [
    modularFantasyHeroSocket.positionMeters[0] * unitsPerMeter,
    modularFantasyHeroSocket.positionMeters[1] * unitsPerMeter,
    modularFantasyHeroSocket.positionMeters[2] * unitsPerMeter,
  ]);
  expectVectorCloseTo(attachedClone.quaternion.toArray(), [
    ...modularFantasyHeroSocket.rotationQuaternion,
  ]);
  expectVectorCloseTo(attachedClone.scale.toArray(), [
    modularFantasyHeroSocket.scale * unitsPerMeter,
    modularFantasyHeroSocket.scale * unitsPerMeter,
    modularFantasyHeroSocket.scale * unitsPerMeter,
  ]);
  expect(mainHandPresentation).toEqual(originalPresentation);
  expect(mainHandPresentation.socket).toBe(socket);
});
