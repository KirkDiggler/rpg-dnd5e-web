import type { QuaternionTuple } from './attackDieContract';
export interface AttackDieMotionInput {
  elapsedMs: number;
  reducedMotion: boolean;
  current: QuaternionTuple;
  target: QuaternionTuple;
}
export interface AttackDieMotionFrame {
  quaternion: QuaternionTuple;
  observeNow: boolean;
  exactTargetHeld: boolean;
  failed: boolean;
}
const normalized = (q: QuaternionTuple): QuaternionTuple => {
  const n = Math.hypot(...q);
  return n ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : q;
};
const dot = (a: QuaternionTuple, b: QuaternionTuple) =>
  a.reduce((s, x, i) => s + x * b[i], 0);
export function angularDistanceDegrees(a: QuaternionTuple, b: QuaternionTuple) {
  return (
    (2 *
      Math.acos(Math.min(1, Math.abs(dot(normalized(a), normalized(b))))) *
      180) /
    Math.PI
  );
}
function slerp(
  a: QuaternionTuple,
  b: QuaternionTuple,
  t: number
): QuaternionTuple {
  a = normalized(a);
  b = normalized(b);
  let d = dot(a, b);
  if (d < 0) {
    b = [-b[0], -b[1], -b[2], -b[3]];
    d = -d;
  }
  if (d > 0.9995)
    return normalized(
      a.map((x, i) => x + (b[i] - x) * t) as unknown as QuaternionTuple
    );
  const angle = Math.acos(Math.min(1, d)),
    s = Math.sin(angle);
  return a.map(
    (x, i) => (x * Math.sin((1 - t) * angle) + b[i] * Math.sin(t * angle)) / s
  ) as unknown as QuaternionTuple;
}
export function stepAttackDieMotion({
  elapsedMs,
  reducedMotion,
  current,
  target,
}: AttackDieMotionInput): AttackDieMotionFrame {
  if (reducedMotion)
    return {
      quaternion: target,
      observeNow: elapsedMs > 0,
      exactTargetHeld: true,
      failed: false,
    };
  const error = angularDistanceDegrees(current, target);
  if (elapsedMs >= 1900 && error <= 0.25)
    return {
      quaternion: target,
      observeNow: true,
      exactTargetHeld: true,
      failed: false,
    };
  if (elapsedMs >= 2000)
    return {
      quaternion: current,
      observeNow: false,
      exactTargetHeld: false,
      failed: true,
    };
  if (elapsedMs < 1200)
    return {
      quaternion: current,
      observeNow: false,
      exactTargetHeld: false,
      failed: false,
    };
  return {
    quaternion: slerp(current, target, Math.min(1, (elapsedMs - 1200) / 700)),
    observeNow: false,
    exactTargetHeld: false,
    failed: false,
  };
}
