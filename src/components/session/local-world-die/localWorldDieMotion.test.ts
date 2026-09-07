import { createVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';
import { describe, expect, it } from 'vitest';
import { localWorldDieLaunch } from './localWorldDieMotion';

describe('localWorldDieLaunch', () => {
  it('derives linear/angular velocity from the throw profile ALONE — no radius or mass term', () => {
    // This is what keeps the same throw gesture producing the same release
    // velocity and arc at any `dieScale` (#906): LocalWorldDieLayer.tsx sets
    // this result as an ABSOLUTE Rapier velocity (setLinvel/setAngvel), never
    // applies it as an impulse, so a bigger/smaller hull's greater/lesser
    // mass never enters this calculation at all. A future change that
    // threads a scale or mass parameter into this function would break that
    // invariant — this test pins the current, scale-free signature down.
    const profile = createVisualThrowProfile({
      releasePosition: [0.5, 0.5],
      releaseDirection: [0.6, 0.8],
      releaseSpeed: 0.7,
      shakeEnergy: 0.4,
      spinBias: 0.3,
      motionSeed: 12345,
    });
    const [dirX, dirZ] = profile.releaseDirection;
    const horizontalSpeed = 0.5 + profile.releaseSpeed * 7.5;
    const angularSpeed = profile.releaseSpeed * 18 + profile.shakeEnergy * 1.5;

    const launch = localWorldDieLaunch(profile);

    expect(launch.linearVelocity).toEqual({
      x: dirX * horizontalSpeed,
      y: 0.8 + profile.releaseSpeed * 1.5,
      z: dirZ * horizontalSpeed,
    });
    expect(launch.angularVelocity).toEqual({
      x: dirZ * angularSpeed,
      y: profile.spinBias * angularSpeed * 0.15,
      z: -dirX * angularSpeed,
    });
  });

  it('is a pure, repeatable function of the profile', () => {
    const profile = createVisualThrowProfile({
      releasePosition: [0.2, 0.9],
      releaseDirection: [-1, 0.3],
      releaseSpeed: 0.42,
      shakeEnergy: 0.1,
      spinBias: -0.6,
      motionSeed: 987,
    });
    expect(localWorldDieLaunch(profile)).toEqual(localWorldDieLaunch(profile));
  });

  it('a stationary release (zero speed, zero direction) has zero horizontal velocity', () => {
    const profile = createVisualThrowProfile({
      releasePosition: [0.5, 0.5],
      releaseDirection: [0, 0],
      releaseSpeed: 0,
      shakeEnergy: 0,
      spinBias: 0,
      motionSeed: 1,
    });
    const launch = localWorldDieLaunch(profile);
    expect(launch.linearVelocity.x).toBe(0);
    expect(launch.linearVelocity.z).toBe(0);
    expect(launch.linearVelocity.y).toBeCloseTo(0.8);
  });
});
