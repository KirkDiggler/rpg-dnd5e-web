import { describe, expect, it } from 'vitest';
import type { StructuralWall } from './structuralWalls';
import { deriveWallCornerFits } from './wallCornerFits';

function wall(
  id: string,
  start: { x: number; z: number },
  end: { x: number; z: number },
  thickness = 0.4
): StructuralWall {
  return {
    id,
    label: id,
    line: { start, end },
    openings: [],
    appearance: { assetRef: 'fit', height: 3, thickness, elevation: 0 },
    blocker: {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: { width: 4, depth: 0.25, offsetX: 0, offsetZ: 0 },
    },
  };
}

describe('wall corner messages (rpg-project#579)', () => {
  it('the appearance-mismatch message does not say Arrange', () => {
    const reason = deriveWallCornerFits(
      [
        wall('a', { x: -4, z: 0 }, { x: 0, z: 0 }),
        wall('b', { x: 0, z: 0 }, { x: 0, z: 4 }, 0.5),
      ],
      () => ({ width: 4, height: 3, depth: 0.4 })
    ).reasons.get('a');
    expect(reason).toBe(
      'Corner fitting requires matching thickness: 0.4 versus 0.5. Enter the same value on both walls.'
    );
    expect(reason).not.toMatch(/Arrange/);
  });
});
