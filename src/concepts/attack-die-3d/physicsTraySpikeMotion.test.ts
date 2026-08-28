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

  it('treats a direction as a direction, not as extra energy', () => {
    // Pins a property this module RELIES ON but does not enforce: the profile
    // hands it a unit vector, so the length of whatever the caller typed can
    // never leak into speed. A diagonal throw is still one throw -- [1,1] must
    // not arrive 1.41x harder than [1,0]. Cheap insurance against the
    // invariant moving in visualThrowProfile.ts, where it actually lives.
    const magnitude = (value: { x: number; y: number; z: number }) =>
      Math.hypot(value.x, value.y, value.z);

    const east = physicsLaunchFromProfile(profile([1, 0], 0.8));
    const diagonal = physicsLaunchFromProfile(profile([1, 1], 0.8));

    expect(magnitude(diagonal.linearVelocity)).toBeCloseTo(
      magnitude(east.linearVelocity),
      6
    );
    expect(magnitude(diagonal.angularVelocity)).toBeCloseTo(
      magnitude(east.angularVelocity),
      6
    );
  });

  it('reads the same throw from any length of the same vector', () => {
    // [0.5,0.5] and [1,1] name one direction; only their length differs, and
    // the profile has already erased that difference before this module runs.
    const half = physicsLaunchFromProfile(profile([0.5, 0.5], 0.8));
    const full = physicsLaunchFromProfile(profile([1, 1], 0.8));

    expect(half.linearVelocity.x).toBeCloseTo(full.linearVelocity.x, 6);
    expect(half.linearVelocity.z).toBeCloseTo(full.linearVelocity.z, 6);
    expect(half.angularVelocity.x).toBeCloseTo(full.angularVelocity.x, 6);
    expect(half.angularVelocity.z).toBeCloseTo(full.angularVelocity.z, 6);
  });

  it('still refuses to divide by a zero-length direction', () => {
    const still = physicsLaunchFromProfile(profile([0, 0], 0.8));
    expect(still.linearVelocity.x).toBe(0);
    expect(still.linearVelocity.z).toBe(0);
    expect(Number.isFinite(still.linearVelocity.y)).toBe(true);
  });
});
