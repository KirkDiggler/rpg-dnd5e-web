import type { Scene3D } from '@/components/session/atlasToScene3D';
import { describe, expect, it } from 'vitest';
import { createLocalWorldDieAttemptSnapshot } from './localWorldDieAttemptSnapshot';

function scene(): Scene3D {
  return {
    exits: [],
    floorTiles: new Map([['0,0,0', { x: 0, y: 0, z: 0, roomId: 'room-a' }]]),
    props: [],
    archetypes: [],
    lighting: {} as Scene3D['lighting'],
    wallRuns: [],
    doorGaps: [
      {
        key: 'door-east',
        connection: 'door-east',
        position: { x: 1, z: 0 },
        leafPosition: { x: 0.5, z: 0 },
        rotationY: 0,
      },
    ],
  };
}

describe('createLocalWorldDieAttemptSnapshot', () => {
  it('freezes scene and door collision truth until a new attempt scope', () => {
    const map = scene();
    const openDoors = new Set(['door-east']);
    const first = createLocalWorldDieAttemptSnapshot({
      scopeKey: 'presentation-1:1',
      scene: map,
      openDoorIds: openDoors,
    });

    openDoors.clear();

    expect(first.scopeKey).toBe('presentation-1:1');
    expect(first.scene).toBe(map);
    expect(first.colliders.some(({ id }) => id === 'door-east')).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.colliders)).toBe(true);

    const retry = createLocalWorldDieAttemptSnapshot({
      scopeKey: 'presentation-1:2',
      scene: map,
      openDoorIds: openDoors,
    });
    expect(retry.colliders.some(({ id }) => id === 'door-east')).toBe(true);
  });
});
