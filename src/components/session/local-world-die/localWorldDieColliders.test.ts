import type { Scene3D } from '@/components/session/atlasToScene3D';
import { describe, expect, it } from 'vitest';
import { buildLocalWorldDieColliders } from './localWorldDieColliders';
import { fingerprintLocalWorldDieColliders } from './localWorldDiePreSimulation';

function scene(reverse: boolean): Scene3D {
  const floors: Array<
    [string, { x: number; y: number; z: number; roomId: string }]
  > = [
    ['floor-b', { x: 1, y: -1, z: 0, roomId: 'room-a' }],
    ['floor-a', { x: 0, y: 0, z: 0, roomId: 'room-a' }],
  ];
  const walls = [
    {
      key: 'wall-b',
      start: { x: 1, z: 0 },
      end: { x: 2, z: 0 },
      height: 1,
      facing: { x: 0, z: 1 },
    },
    {
      key: 'wall-a',
      start: { x: 0, z: 0 },
      end: { x: 1, z: 0 },
      height: 1,
      facing: { x: 0, z: 1 },
    },
  ];
  const doorGaps = [
    {
      key: 'door-b',
      connection: 'door-b',
      position: { x: 2, z: 0 },
      leafPosition: { x: 1.5, z: 0 },
      rotationY: 0,
    },
    {
      key: 'door-a',
      connection: 'door-a',
      position: { x: 1, z: 0 },
      leafPosition: { x: 0.5, z: 0 },
      rotationY: 0,
    },
  ];
  return {
    exits: [],
    floorTiles: new Map(reverse ? [...floors].reverse() : floors),
    props: [],
    archetypes: [],
    lighting: {} as Scene3D['lighting'],
    wallRuns: reverse ? walls.reverse() : walls,
    doorGaps: reverse ? doorGaps.reverse() : doorGaps,
  };
}

describe('buildLocalWorldDieColliders', () => {
  it('canonicalizes equivalent scene insertion orders before physics and hashing', async () => {
    const forward = buildLocalWorldDieColliders(scene(false), new Set());
    const reverse = buildLocalWorldDieColliders(scene(true), new Set());

    expect(forward.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      'floor:floor:floor-a',
      'floor:floor:floor-b',
      'wall:wall-a',
      'wall:wall-b',
      'door:door-a',
      'door:door-b',
    ]);
    expect(reverse).toEqual(forward);
    expect(await fingerprintLocalWorldDieColliders(reverse)).toEqual(
      await fingerprintLocalWorldDieColliders(forward)
    );
  });
});
