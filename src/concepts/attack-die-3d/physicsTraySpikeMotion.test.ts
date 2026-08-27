import { describe, expect, it } from 'vitest';
import { createVisualThrowProfile } from '../../components/ui/dice/visualThrowProfile';
import { physicsLaunchFromProfile } from './physicsTraySpikeMotion';

function profile(direction: readonly [number, number], speed: number) {
  return createVisualThrowProfile({
    releasePosition: [0.5, 0.5],
    releaseDirection: direction,
    releaseSpeed: speed,
    shakeEnergy: 0.2,
    spinBias: 0,
    motionSeed: 42,
  });
}

describe('physicsLaunchFromProfile', () => {
  it('maps release direction to world linear velocity and perpendicular roll axis', () => {
    const east = physicsLaunchFromProfile(profile([1, 0], 0.8));
    const north = physicsLaunchFromProfile(profile([0, 1], 0.8));

    expect(east.linearVelocity.x).toBeGreaterThan(0);
    expect(Math.abs(east.linearVelocity.z)).toBeLessThan(0.000001);
    expect(east.angularVelocity.z).toBeLessThan(0);
    expect(Math.abs(east.angularVelocity.x)).toBeLessThan(
      Math.abs(east.angularVelocity.z) * 0.1
    );

    expect(north.linearVelocity.z).toBeGreaterThan(0);
    expect(Math.abs(north.linearVelocity.x)).toBeLessThan(0.000001);
    expect(north.angularVelocity.x).toBeGreaterThan(0);
    expect(Math.abs(north.angularVelocity.z)).toBeLessThan(
      Math.abs(north.angularVelocity.x) * 0.1
    );
  });

  it('gives hard releases materially more linear and angular velocity', () => {
    const slow = physicsLaunchFromProfile(profile([1, 0], 0.15));
    const hard = physicsLaunchFromProfile(profile([1, 0], 1));
    const magnitude = (value: { x: number; y: number; z: number }) =>
      Math.hypot(value.x, value.y, value.z);

    expect(magnitude(hard.linearVelocity)).toBeGreaterThan(
      magnitude(slow.linearVelocity) * 2.5
    );
    expect(magnitude(hard.angularVelocity)).toBeGreaterThan(
      magnitude(slow.angularVelocity) * 2.5
    );
  });
});
