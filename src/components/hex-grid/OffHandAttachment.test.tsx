import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  OffHandAttachmentStatus,
  OffHandPresentation,
} from './offHandEquipment';

const gltf = vi.hoisted(() => ({ scenes: new Map<string, THREE.Group>() }));
vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
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

import { OffHandAttachmentSlot } from './OffHandAttachment';

const shield: OffHandPresentation = {
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

function character() {
  const root = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'Hand_L';
  root.add(hand);
  return { root, hand };
}

afterEach(() => gltf.scenes.clear());

describe('OffHandAttachmentSlot', () => {
  it('attaches independently beneath Hand_L', async () => {
    const { root, hand } = character();
    const statuses: OffHandAttachmentStatus[] = [];
    const renderer = await ReactThreeTestRenderer.create(
      <OffHandAttachmentSlot
        characterRoot={root}
        presentation={shield}
        onStatus={(status) => statuses.push(status)}
      />
    );
    expect(hand.children).toHaveLength(1);
    expect(statuses.at(-1)?.code).toBe('attached');
    await renderer.unmount();
    expect(hand.children).toHaveLength(0);
  });

  it('reports empty off hand without loading', async () => {
    const { root, hand } = character();
    const statuses: OffHandAttachmentStatus[] = [];
    await ReactThreeTestRenderer.create(
      <OffHandAttachmentSlot
        characterRoot={root}
        onStatus={(status) => statuses.push(status)}
      />
    );
    expect(gltf.scenes.size).toBe(0);
    expect(hand.children).toHaveLength(0);
    expect(statuses.at(-1)?.code).toBe('empty-off-hand');
  });
});
