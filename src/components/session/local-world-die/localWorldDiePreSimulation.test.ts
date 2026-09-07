import type { Scene3D } from '@/components/session/atlasToScene3D';
import { createNeutralVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';
import { describe, expect, it } from 'vitest';
import { buildLocalWorldDieColliders } from './localWorldDieColliders';
import { preSimulateLocalWorldDie } from './localWorldDiePreSimulation';

function scene(): Scene3D {
  return {
    exits: [],
    floorTiles: new Map([
      ['0,0,0', { x: 0, y: 0, z: 0, roomId: 'room-a' }],
      ['1,-1,0', { x: 1, y: -1, z: 0, roomId: 'room-a' }],
    ]),
    props: [],
    archetypes: [],
    lighting: {} as Scene3D['lighting'],
    wallRuns: [],
    doorGaps: [],
  };
}

describe('local planned throw pre-simulation', () => {
  it('returns a bounded settled terminal for the neutral concept launch', async () => {
    const map = scene();
    const result = await preSimulateLocalWorldDie({
      scene: map,
      colliders: buildLocalWorldDieColliders(map, new Set()),
      held: { position: [0, 0], height: 1.25 },
      profile: createNeutralVisualThrowProfile(1),
    });

    expect(result.kind).toBe('settled');
    expect(result.step).toBeGreaterThan(0);
    expect(result.step).toBeLessThanOrEqual(180);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('classifies a launch beyond the floor mask as off-table', async () => {
    const map = scene();
    const result = await preSimulateLocalWorldDie({
      scene: map,
      colliders: buildLocalWorldDieColliders(map, new Set()),
      held: { position: [50, 50], height: 0.1 },
      profile: createNeutralVisualThrowProfile(2),
    });

    expect(result.kind).toBe('off-table');
    expect(result.step).toBe(1);
  });
});
