import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  attachMainHandObject,
  type MainHandPresentation,
} from './mainHandPresentation';

const presentation = (): MainHandPresentation => ({
  ref: 'dnd5e:item:longsword',
  weaponUrl: '/models/synty/characters/weapons/fighter-weapon.glb',
  socket: {
    bone: 'Hand_R',
    boneUnitMeters: 0.01,
    positionMeters: [-0.0554, 0.1299, 0.0237],
    rotationQuaternion: [-0.7071067811865475, 0, 0, 0.7071067811865476],
    scale: 1,
  },
});

function characterWithHand(): { root: THREE.Group; hand: THREE.Bone } {
  const root = new THREE.Group();
  const hand = new THREE.Bone();
  hand.name = 'Hand_R';
  root.add(hand);
  return { root, hand };
}

describe('attachMainHandObject', () => {
  it('compensates the fighter 0.01 bone units and attaches exactly once', () => {
    const { root, hand } = characterWithHand();
    const weapon = new THREE.Group();

    const result = attachMainHandObject(root, weapon, presentation());

    expect(result.status.code).toBe('attached');
    expect(hand.children).toEqual([weapon]);
    expect(weapon.position.toArray()).toEqual([-5.54, 12.99, 2.37]);
    expect(weapon.scale.toArray()).toEqual([100, 100, 100]);
    expect(weapon.quaternion.toArray()).toEqual(
      expect.arrayContaining([
        expect.closeTo(-0.7071067811865475, 12),
        0,
        0,
        expect.closeTo(0.7071067811865476, 12),
      ])
    );

    result.detach();
    expect(hand.children).toEqual([]);
    result.detach();
    expect(hand.children).toEqual([]);
  });

  it('refuses a missing hand without mutating the weapon', () => {
    const root = new THREE.Group();
    const weapon = new THREE.Group();

    const result = attachMainHandObject(root, weapon, presentation());

    expect(result.status).toMatchObject({
      code: 'missing-bone',
      bone: 'Hand_R',
      ref: 'dnd5e:item:longsword',
    });
    expect(weapon.parent).toBeNull();
  });

  it.each([
    { field: 'boneUnitMeters', value: 0 },
    { field: 'boneUnitMeters', value: Number.NaN },
    { field: 'scale', value: 0 },
    { field: 'scale', value: Number.POSITIVE_INFINITY },
  ])(
    'refuses invalid $field=$value before scene mutation',
    ({ field, value }) => {
      const { root, hand } = characterWithHand();
      const weapon = new THREE.Group();
      const candidate = presentation();
      candidate.socket = { ...candidate.socket, [field]: value };

      const result = attachMainHandObject(root, weapon, candidate);

      expect(result.status.code).toBe('invalid-socket');
      expect(hand.children).toEqual([]);
      expect(weapon.parent).toBeNull();
    }
  );

  it('refuses non-finite position and a zero-length quaternion', () => {
    const { root, hand } = characterWithHand();
    const weapon = new THREE.Group();
    const candidate = presentation();
    candidate.socket = {
      ...candidate.socket,
      positionMeters: [Number.NaN, 0, 0],
      rotationQuaternion: [0, 0, 0, 0],
    };

    const result = attachMainHandObject(root, weapon, candidate);

    expect(result.status.code).toBe('invalid-socket');
    expect(hand.children).toEqual([]);
  });
});
