import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { attachBoneObject, type BonePresentation } from './boneAttachment';

const presentation = (): BonePresentation => ({
  ref: 'dnd5e:item:shield',
  assetUrl: '/models/synty/off-hand/shield.glb',
  socket: {
    bone: 'Hand_L',
    boneUnitMeters: 0.01,
    positionMeters: [0.1, 0.2, 0.3],
    rotationQuaternion: [0, 0, 0, 1],
    scale: 1,
  },
});

describe('attachBoneObject', () => {
  it('attaches beneath the exact configured bone with unit compensation', () => {
    const root = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = 'Hand_L';
    root.add(hand);
    const asset = new THREE.Group();

    const result = attachBoneObject(root, asset, presentation());

    expect(result.status).toMatchObject({
      code: 'attached',
      ref: 'dnd5e:item:shield',
      assetUrl: '/models/synty/off-hand/shield.glb',
      bone: 'Hand_L',
    });
    expect(hand.children).toEqual([asset]);
    expect(asset.position.toArray()).toEqual([10, 20, 30]);
    expect(asset.scale.toArray()).toEqual([100, 100, 100]);
    result.detach();
    result.detach();
    expect(hand.children).toEqual([]);
  });

  it('refuses an invalid socket before mutating the asset', () => {
    const root = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = 'Hand_L';
    root.add(hand);
    const asset = new THREE.Group();
    asset.position.set(1, 2, 3);
    const candidate = presentation();
    candidate.socket = { ...candidate.socket, boneUnitMeters: 0 };

    const result = attachBoneObject(root, asset, candidate);

    expect(result.status.code).toBe('invalid-socket');
    expect(asset.parent).toBeNull();
    expect(asset.position.toArray()).toEqual([1, 2, 3]);
  });
});
