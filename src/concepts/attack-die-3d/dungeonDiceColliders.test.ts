import { describe, expect, it } from 'vitest';
import type { Scene3D } from '../../components/session/atlasToScene3D';
import {
  buildDungeonDiceColliders,
  chooseDungeonDiceOrigin,
} from './dungeonDiceColliders';

const scene: Scene3D = {
  floorTiles: new Map([
    ['0,0,0', { x: 0, y: 0, z: 0, roomId: '' }],
    ['1,-1,0', { x: 1, y: -1, z: 0, roomId: '' }],
  ]),
  wallRuns: [
    {
      key: 'wall:a',
      start: { x: -1, z: 2 },
      end: { x: 3, z: 2 },
      facing: { x: 0, z: 1 },
      height: 0,
    },
  ],
  doorGaps: [
    {
      key: 'door:a',
      connection: 'door:a',
      position: { x: 2, z: 1 },
      leafPosition: { x: 1.5, z: 1 },
      rotationY: Math.PI / 2,
    },
    {
      key: 'door:open',
      connection: 'door:open',
      position: { x: 4, z: 1 },
      leafPosition: { x: 3.5, z: 1 },
      rotationY: 0,
    },
  ],
  props: [
    {
      ref: 'dnd5e:props:altar',
      position: { x: 0, y: 0, z: 0 },
      facing: '',
      offset: { x: 0, y: 0, z: 0 },
    },
  ],
  archetypes: [],
};

describe('chooseDungeonDiceOrigin', () => {
  it('uses the nearest real floor cell that is not occupied', () => {
    const origin = chooseDungeonDiceOrigin(
      scene,
      { x: 0, y: 0, z: 0 },
      new Set(['0,0,0'])
    );

    expect(origin).toEqual([Math.sqrt(3), 0]);
  });
});

describe('buildDungeonDiceColliders', () => {
  it('builds floor, wall, and shut-door boxes while ignoring props and open doors', () => {
    const colliders = buildDungeonDiceColliders(scene, {
      surfaceY: 0.2,
      wallHeight: 2.4,
      openDoorIds: new Set(['door:open']),
    });

    expect(colliders.map((collider) => collider.kind)).toEqual([
      'floor',
      'floor',
      'wall',
      'door',
    ]);
    expect(colliders.some((collider) => collider.id.includes('altar'))).toBe(
      false
    );
    expect(colliders.some((collider) => collider.id === 'door:open')).toBe(
      false
    );
  });

  it('uses existing world positions and run geometry without inventing room bounds', () => {
    const colliders = buildDungeonDiceColliders(scene, {
      surfaceY: 0.2,
      wallHeight: 2.4,
      openDoorIds: new Set(),
    });
    const floor = colliders.find((collider) => collider.id === 'floor:0,0,0');
    const wall = colliders.find((collider) => collider.id === 'wall:a');
    const door = colliders.find((collider) => collider.id === 'door:a');

    expect(floor?.position).toEqual([0, 0.16, 0]);
    expect(floor?.halfExtents).toEqual([0.82, 0.04, 0.72]);
    expect(wall?.position).toEqual([1, 1.4, 2]);
    expect(wall?.halfExtents).toEqual([2, 1.2, 0.08]);
    expect(wall?.rotationY).toBeCloseTo(0, 12);
    expect(door?.position).toEqual([2, 1.4, 1]);
    expect(door?.rotationY).toBe(Math.PI / 2);
  });
});
