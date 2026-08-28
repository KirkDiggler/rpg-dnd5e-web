import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
} from './mainHandPresentation';

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
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial()
      );
      mesh.name = `cached-mesh:${url}`;
      scene.add(mesh);
      gltf.scenes.set(url, scene);
    }
    return { scene };
  },
}));

import { MainHandAttachmentSlot } from './MainHandAttachment';

const sword: MainHandPresentation = {
  ref: 'dnd5e:item:longsword',
  weaponUrl: '/models/synty/characters/weapons/fighter-weapon.glb',
  socket: {
    bone: 'Hand_R',
    boneUnitMeters: 0.01,
    positionMeters: [-0.0554, 0.1299, 0.0237],
    rotationQuaternion: [-0.7071067811865475, 0, 0, 0.7071067811865476],
    scale: 1,
  },
};
const bow: MainHandPresentation = {
  ...sword,
  ref: 'dnd5e:item:shortbow',
  weaponUrl: '/models/synty/characters/weapons/bow-01.glb',
};

function character(): { root: THREE.Group; hand: THREE.Bone } {
  const root = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'Hand_R';
  root.add(hand);
  return { root, hand };
}

afterEach(() => {
  gltf.scenes.clear();
  gltf.failed.clear();
});

describe('MainHandAttachmentSlot', () => {
  it('attaches a clone and never reparents the cached GLTF scene', async () => {
    const { root, hand } = character();
    const statuses: MainHandAttachmentStatus[] = [];
    const renderer = await ReactThreeTestRenderer.create(
      <MainHandAttachmentSlot
        characterRoot={root}
        presentation={sword}
        onStatus={(status) => statuses.push(status)}
      />
    );

    const cached = gltf.scenes.get(sword.weaponUrl)!;
    expect(cached.parent).toBeNull();
    expect(hand.children).toHaveLength(1);
    expect(hand.children[0]).not.toBe(cached);
    const cachedMesh = cached.getObjectByName(
      `cached-mesh:${sword.weaponUrl}`
    ) as THREE.Mesh;
    const attachedMesh = hand.children[0]!.getObjectByName(
      `cached-mesh:${sword.weaponUrl}`
    ) as THREE.Mesh;
    expect(attachedMesh).toBeDefined();
    expect(attachedMesh.raycast).not.toBe(cachedMesh.raycast);
    expect(statuses.at(-1)?.code).toBe('attached');

    await renderer.unmount();
    expect(hand.children).toHaveLength(0);
  });

  it('replaces the old clone when the keyed slot changes weapon', async () => {
    const { root, hand } = character();
    const renderer = await ReactThreeTestRenderer.create(
      <MainHandAttachmentSlot
        key={sword.ref}
        characterRoot={root}
        presentation={sword}
      />
    );
    const swordClone = hand.children[0];

    await renderer.update(
      <MainHandAttachmentSlot
        key={bow.ref}
        characterRoot={root}
        presentation={bow}
      />
    );

    expect(hand.children).toHaveLength(1);
    expect(hand.children[0]).not.toBe(swordClone);
    expect(gltf.scenes.get(sword.weaponUrl)!.parent).toBeNull();
    expect(gltf.scenes.get(bow.weaponUrl)!.parent).toBeNull();
  });

  it('reports unarmed without loading a weapon', async () => {
    const { root, hand } = character();
    const statuses: MainHandAttachmentStatus[] = [];
    await ReactThreeTestRenderer.create(
      <MainHandAttachmentSlot
        characterRoot={root}
        onStatus={(status) => statuses.push(status)}
      />
    );

    expect(gltf.scenes.size).toBe(0);
    expect(hand.children).toHaveLength(0);
    expect(statuses.at(-1)?.code).toBe('unarmed');
  });

  it('contains a weapon load failure and reports the exact URL', async () => {
    const { root, hand } = character();
    const statuses: MainHandAttachmentStatus[] = [];
    gltf.failed.add(sword.weaponUrl);

    await ReactThreeTestRenderer.create(
      <MainHandAttachmentSlot
        key={sword.ref}
        characterRoot={root}
        presentation={sword}
        onStatus={(status) => statuses.push(status)}
      />
    );

    expect(hand.children).toHaveLength(0);
    expect(statuses.at(-1)).toMatchObject({
      code: 'asset-load-failed',
      ref: sword.ref,
      weaponUrl: sword.weaponUrl,
    });
  });
});
