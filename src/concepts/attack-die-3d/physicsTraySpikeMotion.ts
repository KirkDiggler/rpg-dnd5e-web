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
