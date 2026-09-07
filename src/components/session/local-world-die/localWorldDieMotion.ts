import type { VisualThrowProfileV1 } from '@/components/ui/dice/visualThrowProfile';

export function localWorldDieLaunch(profile: VisualThrowProfileV1) {
  const directionX = profile.releaseDirection[0];
  const directionZ = profile.releaseDirection[1];
  const moving = Math.hypot(directionX, directionZ) > 0.000001;
  const x = moving ? directionX : 0;
  const z = moving ? directionZ : 0;
  const horizontalSpeed = 0.5 + profile.releaseSpeed * 7.5;
  const angularSpeed = profile.releaseSpeed * 18 + profile.shakeEnergy * 1.5;
  return Object.freeze({
    linearVelocity: Object.freeze({
      x: x * horizontalSpeed,
      y: 0.8 + profile.releaseSpeed * 1.5,
      z: z * horizontalSpeed,
    }),
    angularVelocity: Object.freeze({
      x: z * angularSpeed,
      y: profile.spinBias * angularSpeed * 0.15,
      z: -x * angularSpeed,
    }),
  });
}
