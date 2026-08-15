import type { QuaternionTuple } from './attackDieContract';
import type {
  DiceMotionPose,
  DiceMotionSolver,
  DiceMotionSolverInput,
  DiceShadowPose,
  DiceTranslation,
} from './diceMotionSolver';
import type { HeldRollGroupState } from './rollGroupGestureController';
import type { VisualThrowProfileV1 } from './visualThrowProfile';

export const ROLL_DURATION_MS = 1900;
export const CONVERGENCE_START_MS = 1200;
export const HOLD_LIFT = 0.16;
export const RESTING_TRANSLATION = Object.freeze([-0.23, 0, 0] as const);
export const NEUTRAL_QUATERNION = Object.freeze([
  0.31, -0.47, 0.19, 0.805,
] as const);

const CONVERGENCE_DURATION_MS = ROLL_DURATION_MS - CONVERGENCE_START_MS;
const CENTERED_LIFT_TRANSLATION = Object.freeze([0, HOLD_LIFT, 0] as const);
const VALID_PHASES = new Set([
  'hidden',
  'entering',
  'ready',
  'rolling',
  'settled',
  'exiting',
]);
const TARGET_UNIT_TOLERANCE = 0.000001;
const DIRECTION_UNIT_TOLERANCE = 0.000001;
const MAX_UINT32 = 0xffff_ffff;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const lerp = (start: number, end: number, progress: number) =>
  start + (end - start) * progress;

function frozenTranslation(x: number, y: number, z: number): DiceTranslation {
  return Object.freeze([x, y, z] as DiceTranslation);
}

function frozenQuaternion(
  x: number,
  y: number,
  z: number,
  w: number
): QuaternionTuple {
  return Object.freeze([x, y, z, w] as QuaternionTuple);
}

function normalizedQuaternion(
  quaternion: QuaternionTuple
): QuaternionTuple | undefined {
  const magnitude = Math.hypot(...quaternion);
  if (!Number.isFinite(magnitude) || magnitude === 0) return undefined;
  return frozenQuaternion(
    quaternion[0] / magnitude,
    quaternion[1] / magnitude,
    quaternion[2] / magnitude,
    quaternion[3] / magnitude
  );
}

function quaternionDot(first: QuaternionTuple, second: QuaternionTuple) {
  return (
    first[0] * second[0] +
    first[1] * second[1] +
    first[2] * second[2] +
    first[3] * second[3]
  );
}

export function angularDistanceDegrees(
  first: QuaternionTuple,
  second: QuaternionTuple
): number {
  const normalizedFirst = normalizedQuaternion(first);
  const normalizedSecond = normalizedQuaternion(second);
  if (!normalizedFirst || !normalizedSecond) return 180;
  const cosine = clamp(
    Math.abs(quaternionDot(normalizedFirst, normalizedSecond)),
    0,
    1
  );
  return (2 * Math.acos(cosine) * 180) / Math.PI;
}

function slerp(
  first: QuaternionTuple,
  second: QuaternionTuple,
  progress: number
): QuaternionTuple {
  if (progress <= 0) return first;
  if (progress >= 1) return second;

  const start = normalizedQuaternion(first) ?? NEUTRAL_QUATERNION;
  let end = normalizedQuaternion(second) ?? NEUTRAL_QUATERNION;
  let cosine = quaternionDot(start, end);
  if (cosine < 0) {
    end = frozenQuaternion(-end[0], -end[1], -end[2], -end[3]);
    cosine = -cosine;
  }

  if (cosine > 0.9995) {
    return (
      normalizedQuaternion(
        frozenQuaternion(
          lerp(start[0], end[0], progress),
          lerp(start[1], end[1], progress),
          lerp(start[2], end[2], progress),
          lerp(start[3], end[3], progress)
        )
      ) ?? start
    );
  }

  const angle = Math.acos(clamp(cosine, -1, 1));
  const sine = Math.sin(angle);
  const startWeight = Math.sin((1 - progress) * angle) / sine;
  const endWeight = Math.sin(progress * angle) / sine;
  return frozenQuaternion(
    start[0] * startWeight + end[0] * endWeight,
    start[1] * startWeight + end[1] * endWeight,
    start[2] * startWeight + end[2] * endWeight,
    start[3] * startWeight + end[3] * endWeight
  );
}

function seedPhase(profile: VisualThrowProfileV1): number {
  const seedFraction = profile.motionSeed / 0x1_0000_0000;
  return (
    seedFraction * Math.PI * 2 +
    profile.releaseSpeed * 1.7 +
    profile.shakeEnergy * 2.3 +
    profile.spinBias * 1.1
  );
}

function tumbleQuaternionAt(
  elapsedMs: number,
  profile: VisualThrowProfileV1
): QuaternionTuple {
  const phase = seedPhase(profile);
  const angle = clamp(elapsedMs, 0, CONVERGENCE_START_MS) * 0.004 + phase;
  return (
    normalizedQuaternion(
      frozenQuaternion(
        Math.sin(angle * 0.71 + profile.spinBias * 0.4) *
          (0.35 + profile.shakeEnergy * 0.2),
        Math.cos(angle * 1.13 + profile.releaseSpeed * 0.8) *
          (0.3 + profile.releaseSpeed * 0.15),
        Math.sin(angle * 0.83 + 1.4 + profile.shakeEnergy) *
          (0.38 + Math.abs(profile.spinBias) * 0.12),
        Math.cos(angle + phase * 0.4)
      )
    ) ?? NEUTRAL_QUATERNION
  );
}

function rollingTranslation(
  elapsedMs: number,
  profile: VisualThrowProfileV1
): DiceTranslation {
  if (elapsedMs >= ROLL_DURATION_MS) return RESTING_TRANSLATION;

  const progress = clamp(elapsedMs / ROLL_DURATION_MS, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  const envelope = Math.sin(Math.PI * progress);
  const releaseX = (profile.releasePosition[0] - 0.5) * 0.8;
  const releaseZ = (0.5 - profile.releasePosition[1]) * 0.55;
  const arc =
    envelope *
    (0.08 + profile.releaseSpeed * 0.18 + profile.shakeEnergy * 0.07);
  const bounce =
    Math.abs(
      Math.sin(
        progress * Math.PI * (2 + profile.shakeEnergy * 3) + seedPhase(profile)
      )
    ) *
    profile.shakeEnergy *
    0.035 *
    envelope;
  return frozenTranslation(
    lerp(releaseX, -0.23, eased) +
      profile.releaseDirection[0] * profile.releaseSpeed * 0.16 * envelope,
    HOLD_LIFT * (1 - progress) + arc + bounce,
    lerp(releaseZ, 0, eased) -
      profile.releaseDirection[1] * profile.releaseSpeed * 0.14 * envelope
  );
}

function shadowFor(translation: DiceTranslation): DiceShadowPose {
  const heightProgress = clamp(translation[1] / 0.4, 0, 1);
  return Object.freeze({
    translation: frozenTranslation(translation[0], 0, translation[2]),
    scale: lerp(1.12, 0.82, heightProgress),
    opacity: lerp(0.34, 0.14, heightProgress),
  });
}

function pose(
  quaternion: QuaternionTuple,
  translation: DiceTranslation,
  observeNow: boolean,
  exactTargetHeld: boolean,
  failed: boolean
): DiceMotionPose {
  return Object.freeze({
    quaternion,
    translation,
    shadow: shadowFor(translation),
    observeNow,
    exactTargetHeld,
    failed,
  });
}

function failedPose(): DiceMotionPose {
  return pose(
    NEUTRAL_QUATERNION,
    CENTERED_LIFT_TRANSLATION,
    false,
    false,
    true
  );
}

function neutralPose(): DiceMotionPose {
  return pose(
    NEUTRAL_QUATERNION,
    CENTERED_LIFT_TRANSLATION,
    false,
    false,
    false
  );
}

function multiplyQuaternions(
  first: QuaternionTuple,
  second: QuaternionTuple
): QuaternionTuple {
  const [x1, y1, z1, w1] = first;
  const [x2, y2, z2, w2] = second;
  return frozenQuaternion(
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2
  );
}

function axisQuaternion(axis: 'x' | 'y' | 'z', angle: number): QuaternionTuple {
  const sine = Math.sin(angle / 2);
  const cosine = Math.cos(angle / 2);
  if (axis === 'x') return frozenQuaternion(sine, 0, 0, cosine);
  if (axis === 'y') return frozenQuaternion(0, sine, 0, cosine);
  return frozenQuaternion(0, 0, sine, cosine);
}

function heldQuaternion(held: HeldRollGroupState): QuaternionTuple {
  const wobble =
    Math.sin(held.wobblePhase * Math.PI * 2) * held.shakeEnergy * 0.12;
  const tiltX = held.normalizedTilt[0] * 0.28;
  const tiltZ = held.normalizedTilt[1] * 0.28;
  return (
    normalizedQuaternion(
      multiplyQuaternions(
        multiplyQuaternions(
          axisQuaternion('x', tiltX),
          axisQuaternion('z', tiltZ)
        ),
        axisQuaternion('y', wobble)
      )
    ) ?? NEUTRAL_QUATERNION
  );
}

function heldPose(held: HeldRollGroupState): DiceMotionPose {
  const translation = frozenTranslation(
    (held.normalizedPosition[0] - 0.5) * 0.8,
    HOLD_LIFT,
    (0.5 - held.normalizedPosition[1]) * 0.55
  );
  return pose(heldQuaternion(held), translation, false, false, false);
}

function finiteTuple2(tuple: readonly number[]): boolean {
  return (
    Array.isArray(tuple) &&
    tuple.length === 2 &&
    Object.hasOwn(tuple, 0) &&
    Object.hasOwn(tuple, 1) &&
    Number.isFinite(tuple[0]) &&
    Number.isFinite(tuple[1])
  );
}

function finiteTuple4(tuple: readonly number[]): boolean {
  return (
    Array.isArray(tuple) &&
    tuple.length === 4 &&
    Object.hasOwn(tuple, 0) &&
    Object.hasOwn(tuple, 1) &&
    Object.hasOwn(tuple, 2) &&
    Object.hasOwn(tuple, 3) &&
    Number.isFinite(tuple[0]) &&
    Number.isFinite(tuple[1]) &&
    Number.isFinite(tuple[2]) &&
    Number.isFinite(tuple[3])
  );
}

function inRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validThrowProfile(profile: VisualThrowProfileV1): boolean {
  if (
    profile.schemaVersion !== 1 ||
    !finiteTuple2(profile.releasePosition) ||
    !finiteTuple2(profile.releaseDirection) ||
    !inRange(profile.releasePosition[0], 0, 1) ||
    !inRange(profile.releasePosition[1], 0, 1) ||
    !inRange(profile.releaseSpeed, 0, 1) ||
    !inRange(profile.shakeEnergy, 0, 1) ||
    !inRange(profile.spinBias, -1, 1) ||
    !Number.isInteger(profile.motionSeed) ||
    !inRange(profile.motionSeed, 0, MAX_UINT32)
  ) {
    return false;
  }

  const directionMagnitude = Math.hypot(...profile.releaseDirection);
  return directionMagnitude === 0
    ? profile.releaseSpeed === 0
    : Math.abs(directionMagnitude - 1) <= DIRECTION_UNIT_TOLERANCE;
}

function validHeldState(held: HeldRollGroupState): boolean {
  return (
    finiteTuple2(held.normalizedPosition) &&
    finiteTuple2(held.normalizedTilt) &&
    inRange(held.normalizedPosition[0], 0, 1) &&
    inRange(held.normalizedPosition[1], 0, 1) &&
    inRange(held.normalizedTilt[0], -1, 1) &&
    inRange(held.normalizedTilt[1], -1, 1) &&
    inRange(held.shakeEnergy, 0, 1) &&
    Number.isFinite(held.wobblePhase) &&
    held.wobblePhase >= 0 &&
    held.wobblePhase < 1
  );
}

function validInput(input: Parameters<DiceMotionSolver['solve']>[0]): boolean {
  if (
    input.member.memberIndex !== 0 ||
    input.member.memberCount !== 1 ||
    !VALID_PHASES.has(input.phase) ||
    !Number.isFinite(input.elapsedMs) ||
    typeof input.reducedMotion !== 'boolean' ||
    !finiteTuple4(input.target) ||
    !validThrowProfile(input.throwProfile)
  ) {
    return false;
  }

  const targetMagnitude = Math.hypot(...input.target);
  return (
    Number.isFinite(targetMagnitude) &&
    Math.abs(targetMagnitude - 1) <= TARGET_UNIT_TOLERANCE &&
    (!input.held || validHeldState(input.held))
  );
}

export const ChoreographedSolverV1: DiceMotionSolver = Object.freeze({
  revision: 'choreographed-v1' as const,
  solve(input: DiceMotionSolverInput) {
    try {
      if (!validInput(input)) return failedPose();

      if (input.phase === 'settled' || input.phase === 'exiting') {
        return pose(input.target, RESTING_TRANSLATION, false, true, false);
      }

      if (input.phase === 'entering' || input.phase === 'ready') {
        if (!input.held || input.reducedMotion) return neutralPose();
        return heldPose(input.held);
      }

      if (input.phase !== 'rolling') return neutralPose();

      if (input.reducedMotion) {
        return input.elapsedMs > 0
          ? pose(input.target, RESTING_TRANSLATION, true, true, false)
          : neutralPose();
      }

      if (input.elapsedMs >= ROLL_DURATION_MS) {
        return pose(input.target, RESTING_TRANSLATION, true, true, false);
      }

      const translation = rollingTranslation(
        input.elapsedMs,
        input.throwProfile
      );
      if (input.elapsedMs < CONVERGENCE_START_MS) {
        return pose(
          tumbleQuaternionAt(input.elapsedMs, input.throwProfile),
          translation,
          false,
          false,
          false
        );
      }

      const convergenceStart = tumbleQuaternionAt(
        CONVERGENCE_START_MS,
        input.throwProfile
      );
      return pose(
        slerp(
          convergenceStart,
          input.target,
          (input.elapsedMs - CONVERGENCE_START_MS) / CONVERGENCE_DURATION_MS
        ),
        translation,
        false,
        false,
        false
      );
    } catch {
      return failedPose();
    }
  },
});
