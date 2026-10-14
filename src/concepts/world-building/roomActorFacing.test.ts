import { headingFromDelta } from '@/components/hex-grid/facing';
import { FACING_NAMES, facingAngleDeg } from '@/components/hex-grid/facingYaw';
import { describe, expect, it } from 'vitest';
import { roomMonsterMarkerYaw } from './roomActorFacing';

const cell = { q: 0, r: 0 };

/** Where a +Z-forward rig's nose points after `rotation.y = yaw`
 * (Three.js maps local +Z to world (sin yaw, 0, cos yaw)). */
function noseOf(yaw: number) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

describe('roomMonsterMarkerYaw', () => {
  it.each([
    ['n', { x: 0, z: -1 }],
    ['ne', { x: Math.SQRT1_2, z: -Math.SQRT1_2 }],
    ['e', { x: 1, z: 0 }],
    ['se', { x: Math.SQRT1_2, z: Math.SQRT1_2 }],
    ['s', { x: 0, z: 1 }],
    ['sw', { x: -Math.SQRT1_2, z: Math.SQRT1_2 }],
    ['w', { x: -1, z: 0 }],
    ['nw', { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }],
  ])('turns a +Z-forward model to face %s on the board', (facing, want) => {
    const nose = noseOf(roomMonsterMarkerYaw({ location: cell, facing }));
    expect(nose.x).toBeCloseTo(want.x);
    expect(nose.z).toBeCloseTo(want.z);
  });

  it('agrees with the game heading for walking in each compass direction', () => {
    for (const facing of FACING_NAMES) {
      const deg = facingAngleDeg(facing)!;
      const rad = (deg * Math.PI) / 180;
      const game = headingFromDelta(Math.cos(rad), Math.sin(rad))!;
      const studio = roomMonsterMarkerYaw({ location: cell, facing });
      expect(Math.cos(studio - game)).toBeCloseTo(1);
    }
  });

  it('keeps the asset default when no facing is authored', () => {
    expect(roomMonsterMarkerYaw({ location: cell })).toBe(0);
  });

  it('composes the asset forward offset on top of the facing', () => {
    const offset = 0.3;
    for (const facing of FACING_NAMES) {
      expect(roomMonsterMarkerYaw({ location: cell, facing }, offset)).toBe(
        roomMonsterMarkerYaw({ location: cell, facing }) + offset
      );
    }
    expect(roomMonsterMarkerYaw({ location: cell }, offset)).toBe(offset);
  });
});
