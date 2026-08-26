import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import type { MainHandAttachmentStatus } from './mainHandPresentation';

const failedWeapon = '/models/synty/characters/weapons/fighter-weapon.glb';

vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
    if (url === failedWeapon) throw new Error(`failed ${url}`);
    const scene = new THREE.Group();
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
    return { scene, animations: [] };
  },
  useAnimations: () => ({ actions: {}, names: [] }),
}));

import { ClassCharacterModel } from './ClassCharacterModel';

it('keeps the fighter rendered when only its weapon load fails', async () => {
  const statuses: MainHandAttachmentStatus[] = [];
  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url="/models/synty/characters/fighter.glb"
      mainHandPresentation={{
        ref: 'dnd5e:item:longsword',
        weaponUrl: failedWeapon,
        socket: {
          bone: 'Hand_R',
          boneUnitMeters: 0.01,
          positionMeters: [-0.0554, 0.1299, 0.0237],
          rotationQuaternion: [-0.7071067811865475, 0, 0, 0.7071067811865476],
          scale: 1,
        },
      }}
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
