import type { VisualThrowProfileV1 } from '../../components/ui/dice/visualThrowProfile';

export interface PhysicsLaunchVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PhysicsLaunch {
  readonly linearVelocity: PhysicsLaunchVector;
  readonly angularVelocity: PhysicsLaunchVector;
}

export function physicsLaunchFromProfile(
  profile: VisualThrowProfileV1
): PhysicsLaunch {
  const directionX = profile.releaseDirection[0];
  const directionZ = profile.releaseDirection[1];
  // ALREADY UNIT LENGTH. `VisualThrowProfileV1.releaseDirection` is normalized
  // by `createVisualThrowProfile` on the way in — it divides by the larger
  // component and then by that result's length — so [1,1] and [0.5,0.5] both
  // arrive here as the same unit vector, and dividing again would be a no-op
  // that implies the invariant is not trusted.
  //
  // The magnitude is therefore only a zero test: a canonical zero direction is
  // the one value that is NOT unit length, and it means "no throw". Copilot
  // read this as a missing normalize on #838; the tests below pin the property
  // end-to-end so the next reader gets an answer instead of the same doubt.
  const directionMagnitude = Math.hypot(directionX, directionZ);
  const normalizedX = directionMagnitude > 0.000001 ? directionX : 0;
  const normalizedZ = directionMagnitude > 0.000001 ? directionZ : 0;
  const horizontalSpeed = 0.5 + profile.releaseSpeed * 7.5;
  const angularSpeed = profile.releaseSpeed * 18 + profile.shakeEnergy * 1.5;

  return Object.freeze({
    linearVelocity: Object.freeze({
      x: normalizedX * horizontalSpeed,
      y: 0.8 + profile.releaseSpeed * 1.5,
      z: normalizedZ * horizontalSpeed,
    }),
    angularVelocity: Object.freeze({
      x: normalizedZ * angularSpeed,
      y: profile.spinBias * angularSpeed * 0.15,
      z: -normalizedX * angularSpeed,
    }),
  });
}
