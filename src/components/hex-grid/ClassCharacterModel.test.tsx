import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
} from './mainHandPresentation';

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
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial()
        );
        body.name = 'fighter-body';
        root.add(hand, body);
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

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  gltf.scenes.clear();
  gltf.failed.clear();
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

  const hand = renderer.scene.findAll(
    (node) =>
      node.instance instanceof THREE.Bone &&
      (node.instance as THREE.Bone).name === 'Hand_R'
  )[0]!.instance as THREE.Bone;
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
