import type { DiceTrayPhase } from './DiceTray';
import type { QuaternionTuple } from './attackDieContract';
import type { AttackDieDecorativeRelease } from './dicePresentationRelease';
export interface AttackDieMotionInput {
  elapsedMs: number;
  reducedMotion: boolean;
  current: QuaternionTuple;
  target: QuaternionTuple;
  decorativeSeed?: number;
}
export interface AttackDieMotionFrame {
  quaternion: QuaternionTuple;
  observeNow: boolean;
  exactTargetHeld: boolean;
  failed: boolean;
}
export type AttackDieTranslation = readonly [number, number, number];

const LEFT_RESTING_X = -0.23;
const RIGHT_ENTRY_X = 1.05;
const NEUTRAL_QUATERNION: QuaternionTuple = [0.31, -0.47, 0.19, 0.805];
const CENTER_TRANSLATION: AttackDieTranslation = [0, 0, 0];
const LEFT_RESTING_TRANSLATION: AttackDieTranslation = [LEFT_RESTING_X, 0, 0];

export function attackDieRollTranslation(
  elapsedMs: number,
  reducedMotion: boolean
): AttackDieTranslation {
  if (reducedMotion) return LEFT_RESTING_TRANSLATION;
  const progress = Math.min(1, Math.max(0, elapsedMs / 1800));
  const eased = 1 - Math.pow(1 - progress, 3);
  const x = RIGHT_ENTRY_X + (LEFT_RESTING_X - RIGHT_ENTRY_X) * eased;
  const y = Math.sin(progress * Math.PI) * 0.08;
  const z = -Math.sin(progress * Math.PI) * 0.12;
  return progress === 1 ? LEFT_RESTING_TRANSLATION : [x, y, z];
}

export function attackDiePoseForPhase(input: {
  phase: DiceTrayPhase;
  elapsedMs: number;
  reducedMotion: boolean;
  current: QuaternionTuple;
  target: QuaternionTuple;
  release?: AttackDieDecorativeRelease;
}): AttackDieMotionFrame & { translation: AttackDieTranslation } {
  const { phase, elapsedMs, reducedMotion, current, target, release } = input;

  if (phase === 'rolling') {
    return {
      ...stepAttackDieMotion({
        elapsedMs,
        reducedMotion,
        current,
        target,
        decorativeSeed: release?.variation,
      }),
      translation: attackDieRollTranslation(elapsedMs, reducedMotion),
    };
  }

  if (phase === 'settled' || phase === 'exiting') {
    return {
      quaternion: target,
      translation: LEFT_RESTING_TRANSLATION,
      observeNow: false,
      exactTargetHeld: true,
      failed: false,
    };
  }

  return {
    quaternion: NEUTRAL_QUATERNION,
    translation: CENTER_TRANSLATION,
    observeNow: false,
    exactTargetHeld: false,
    failed: false,
  };
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
  decorativeSeed = 0,
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
  if (elapsedMs < 1200) {
    const angle = elapsedMs * 0.004;
    const seedPhase = (Math.abs(decorativeSeed) % 997) * 0.013;
    const decorative: QuaternionTuple = normalized([
      Math.sin(angle * 0.71 + seedPhase) * 0.55,
      Math.sin(angle * 1.13 + 0.7 + seedPhase * 0.7) * 0.45,
      Math.sin(angle * 0.83 + 1.4 + seedPhase * 1.3) * 0.5,
      Math.cos(angle + seedPhase * 0.4),
    ]);
    return {
      quaternion: decorative,
      observeNow: false,
      exactTargetHeld: false,
      failed: false,
    };
  }
  return {
    quaternion: slerp(current, target, Math.min(1, (elapsedMs - 1200) / 700)),
    observeNow: false,
    exactTargetHeld: false,
    failed: false,
  };
}
