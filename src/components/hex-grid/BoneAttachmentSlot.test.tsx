import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoneAttachmentStatus, BonePresentation } from './boneAttachment';

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
      scene.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial()
        )
      );
      gltf.scenes.set(url, scene);
    }
    return { scene };
  },
}));

import { BoneAttachmentSlot } from './BoneAttachmentSlot';

const shield: BonePresentation = {
  ref: 'dnd5e:item:shield',
  assetUrl: '/models/synty/off-hand/shield.glb',
  socket: {
    bone: 'Hand_L',
    boneUnitMeters: 0.01,
    positionMeters: [0, 0, 0],
    rotationQuaternion: [0, 0, 0, 1],
    scale: 1,
  },
};

function character() {
  const root = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'Hand_L';
  root.add(hand);
  return { root, hand };
}

afterEach(() => {
  gltf.scenes.clear();
  gltf.failed.clear();
});

describe('BoneAttachmentSlot', () => {
  it('clones cached assets and reports attached', async () => {
    const { root, hand } = character();
    const statuses: BoneAttachmentStatus[] = [];
    const renderer = await ReactThreeTestRenderer.create(
      <BoneAttachmentSlot
        characterRoot={root}
        presentation={shield}
        onStatus={(status) => statuses.push(status)}
      />
    );
    expect(hand.children).toHaveLength(1);
    expect(hand.children[0]).not.toBe(gltf.scenes.get(shield.assetUrl));
    expect(gltf.scenes.get(shield.assetUrl)?.parent).toBeNull();
    expect(statuses.at(-1)?.code).toBe('attached');
    await renderer.unmount();
    expect(hand.children).toHaveLength(0);
  });

  it('reports empty without loading an asset', async () => {
    const { root, hand } = character();
    const statuses: BoneAttachmentStatus[] = [];
    await ReactThreeTestRenderer.create(
      <BoneAttachmentSlot
        characterRoot={root}
        onStatus={(status) => statuses.push(status)}
      />
    );
    expect(gltf.scenes.size).toBe(0);
    expect(hand.children).toHaveLength(0);
    expect(statuses.at(-1)?.code).toBe('empty');
  });

  it('contains load failure and reports exact asset URL', async () => {
    const { root, hand } = character();
    const statuses: BoneAttachmentStatus[] = [];
    gltf.failed.add(shield.assetUrl);
    await ReactThreeTestRenderer.create(
      <BoneAttachmentSlot
        characterRoot={root}
        presentation={shield}
        onStatus={(status) => statuses.push(status)}
      />
    );
    expect(hand.children).toHaveLength(0);
    expect(statuses.at(-1)).toMatchObject({
      code: 'asset-load-failed',
      ref: shield.ref,
      assetUrl: shield.assetUrl,
    });
  });
});
