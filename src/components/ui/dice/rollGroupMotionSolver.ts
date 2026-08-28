import type { AnchoredHeldRollGroupState } from './anchoredRollGroupGestureController';
import type { QuaternionTuple } from './attackDieContract';
import type {
  DiceMotionPose,
  DiceShadowPose,
  DiceTranslation,
} from './diceMotionSolver';
import type { RollGroupMemberLayout } from './rollGroupLayout';
import { ROLL_GROUP_HELD_PLANE_HEIGHT } from './rollGroupTrayGeometry';
import {
  parseVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

export type RollGroupFeelCandidateId = 'weighty' | 'energetic' | 'physical';

export interface RollGroupFeelProfile {
  readonly id: RollGroupFeelCandidateId;
  readonly displayName: string;
  readonly durationMs: number;
  readonly travel: number;
  readonly tumble: number;
  readonly rebound: number;
  readonly scatter: number;
  readonly rerollDurationMs: number;
  readonly flashDurationMs: number;
  readonly modifierDurationMs: number;
}

export const ROLL_GROUP_FEEL_PROFILES: Readonly<
  Record<RollGroupFeelCandidateId, RollGroupFeelProfile>
> = Object.freeze({
  weighty: Object.freeze({
    id: 'weighty',
    displayName: 'Weighty',
    durationMs: 1500,
    travel: 0.24,
    tumble: 0.82,
    rebound: 0.06,
    scatter: 0.04,
    rerollDurationMs: 980,
    flashDurationMs: 180,
    modifierDurationMs: 140,
  }),
  energetic: Object.freeze({
    id: 'energetic',
    displayName: 'Energetic',
    durationMs: 1050,
    travel: 0.42,
    tumble: 1.38,
    rebound: 0.14,
    scatter: 0.11,
    rerollDurationMs: 760,
    flashDurationMs: 120,
    modifierDurationMs: 100,
  }),
  physical: Object.freeze({
    id: 'physical',
    displayName: 'Physical',
    durationMs: 1280,
    travel: 0.34,
    tumble: 1.02,
    rebound: 0.22,
    scatter: 0.08,
    rerollDurationMs: 860,
    flashDurationMs: 150,
    modifierDurationMs: 120,
  }),
});

export type RollGroupMotionPhase =
  | 'held'
  | 'rolling-originals'
  | 'settled-originals'
  | 'rerolling'
  | 'settled-final';

const HOLD_LIFT = 0.16;
const IDENTITY_QUATERNION = Object.freeze([0, 0, 0, 1] as const);
const TARGET_UNIT_TOLERANCE = 0.000001;
const MAX_UINT32 = 0xffff_ffff;
const VALID_PHASES = new Set<RollGroupMotionPhase>([
  'held',
  'rolling-originals',
  'settled-originals',
  'rerolling',
  'settled-final',
]);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const lerp = (start: number, end: number, progress: number) =>
  start + (end - start) * progress;

function frozenTranslation(x: number, y: number, z: number): DiceTranslation {
  return Object.freeze([x, y, z] as const);
}

function frozenQuaternion(
  x: number,
  y: number,
  z: number,
  w: number
): QuaternionTuple {
  return Object.freeze([x, y, z, w] as const);
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

function quaternionDot(
  first: QuaternionTuple,
  second: QuaternionTuple
): number {
  return (
    first[0] * second[0] +
    first[1] * second[1] +
    first[2] * second[2] +
    first[3] * second[3]
  );
}

function slerp(
  first: QuaternionTuple,
  second: QuaternionTuple,
  progress: number
): QuaternionTuple {
  if (progress <= 0) return first;
  if (progress >= 1) return second;

  const start = normalizedQuaternion(first) ?? IDENTITY_QUATERNION;
  let end = normalizedQuaternion(second) ?? IDENTITY_QUATERNION;
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

function shadowFor(translation: DiceTranslation): DiceShadowPose {
  const heightProgress = clamp(translation[1] / 0.45, 0, 1);
  return Object.freeze({
    translation: frozenTranslation(translation[0], 0, translation[2]),
    scale: lerp(1.1, 0.83, heightProgress),
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
    IDENTITY_QUATERNION,
    frozenTranslation(0, HOLD_LIFT, 0),
    false,
    false,
    true
  );
}

function exactRestPose(
  target: QuaternionTuple,
  layout: RollGroupMemberLayout
): DiceMotionPose {
  return pose(
    target,
    frozenTranslation(layout.center[0], 0, layout.center[1]),
    true,
    true,
    false
  );
}

function isFiniteTuple(tuple: readonly number[], length: number): boolean {
  return (
    Array.isArray(tuple) &&
    tuple.length === length &&
    tuple.every(
      (value, index) => Object.hasOwn(tuple, index) && Number.isFinite(value)
    )
  );
}

function validTarget(target: QuaternionTuple): boolean {
  if (!isFiniteTuple(target, 4)) return false;
  const magnitude = Math.hypot(...target);
  return (
    Number.isFinite(magnitude) &&
    Math.abs(magnitude - 1) <= TARGET_UNIT_TOLERANCE
  );
}

function validLayout(layout: RollGroupMemberLayout): boolean {
  return (
    typeof layout.dieId === 'string' &&
    layout.dieId.length > 0 &&
    isFiniteTuple(layout.center, 2) &&
    Number.isFinite(layout.radius) &&
    layout.radius > 0 &&
    layout.radius < 1
  );
}

function validHeldState(held: AnchoredHeldRollGroupState): boolean {
  return (
    isFiniteTuple(held.anchor, 2) &&
    isFiniteTuple(held.pointerPlane, 2) &&
    isFiniteTuple(held.planePosition, 2) &&
    isFiniteTuple(held.normalizedPosition, 2) &&
    isFiniteTuple(held.normalizedTilt, 2) &&
    held.normalizedPosition[0] >= 0 &&
    held.normalizedPosition[0] <= 1 &&
    held.normalizedPosition[1] >= 0 &&
    held.normalizedPosition[1] <= 1 &&
    held.normalizedTilt[0] >= -1 &&
    held.normalizedTilt[0] <= 1 &&
    held.normalizedTilt[1] >= -1 &&
    held.normalizedTilt[1] <= 1 &&
    Number.isFinite(held.shakeEnergy) &&
    held.shakeEnergy >= 0 &&
    held.shakeEnergy <= 1 &&
    Number.isFinite(held.wobblePhase) &&
    held.wobblePhase >= 0 &&
    held.wobblePhase < 1 &&
    typeof held.grabbedDieId === 'string' &&
    held.grabbedDieId.length > 0
  );
}

function validFeelProfile(profile: RollGroupFeelProfile): boolean {
  const canonical = ROLL_GROUP_FEEL_PROFILES[profile.id];
  return (
    canonical !== undefined &&
    profile.displayName === canonical.displayName &&
    profile.durationMs === canonical.durationMs &&
    profile.travel === canonical.travel &&
    profile.tumble === canonical.tumble &&
    profile.rebound === canonical.rebound &&
    profile.scatter === canonical.scatter &&
    profile.rerollDurationMs === canonical.rerollDurationMs &&
    profile.flashDurationMs === canonical.flashDurationMs &&
    profile.modifierDurationMs === canonical.modifierDurationMs
  );
}

function hashUnit(seed: number, index: number, salt: number): number {
  let state = (seed ^ Math.imul(index + 1, 0x9e37_79b9) ^ salt) >>> 0;
  state ^= state >>> 16;
  state = Math.imul(state, 0x7feb_352d) >>> 0;
  state ^= state >>> 15;
  state = Math.imul(state, 0x846c_a68b) >>> 0;
  state ^= state >>> 16;
  return state / 0x1_0000_0000;
}

function hashSigned(seed: number, index: number, salt: number): number {
  return hashUnit(seed, index, salt) * 2 - 1;
}

function seedPhase(
  profile: RollGroupFeelProfile,
  throwProfile: VisualThrowProfileV1,
  memberIndex: number
): number {
  return (
    hashUnit(throwProfile.motionSeed, memberIndex, 0x5b1d_4e77) * Math.PI * 2 +
    profile.travel * 1.9 +
    profile.tumble * 0.8 +
    throwProfile.spinBias * 1.3
  );
}

function axisQuaternion(axis: 'x' | 'y' | 'z', angle: number): QuaternionTuple {
  const sine = Math.sin(angle / 2);
  const cosine = Math.cos(angle / 2);
  if (axis === 'x') return frozenQuaternion(sine, 0, 0, cosine);
  if (axis === 'y') return frozenQuaternion(0, sine, 0, cosine);
  return frozenQuaternion(0, 0, sine, cosine);
}

function vectorAxisQuaternion(
  axis: readonly [number, number, number],
  angle: number
): QuaternionTuple {
  const sine = Math.sin(angle / 2);
  const cosine = Math.cos(angle / 2);
  return frozenQuaternion(
    axis[0] * sine,
    axis[1] * sine,
    axis[2] * sine,
    cosine
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

const NEUTRAL_HELD_QUATERNION = frozenQuaternion(0, 0, 0, 1);

function heldQuaternion(
  input: Parameters<typeof solveRollGroupMemberMotion>[0],
  phase: number
): QuaternionTuple {
  if (!input.held || input.reducedMotion) return NEUTRAL_HELD_QUATERNION;
  const tiltX = input.held.normalizedTilt[0] * 0.22;
  const tiltZ = input.held.normalizedTilt[1] * 0.22;
  const wobble =
    Math.sin((input.held.wobblePhase + phase / (Math.PI * 2)) * Math.PI * 2) *
    input.held.shakeEnergy *
    0.08;
  return (
    normalizedQuaternion(
      multiplyQuaternions(
        multiplyQuaternions(
          axisQuaternion('x', tiltX),
          axisQuaternion('z', tiltZ)
        ),
        axisQuaternion('y', wobble)
      )
    ) ?? NEUTRAL_HELD_QUATERNION
  );
}

function releaseOrigin(
  input: Parameters<typeof solveRollGroupMemberMotion>[0]
): readonly [number, number] {
  const centerBiasX = input.heldLayout.center[0] * 0.8;
  const centerBiasY = input.heldLayout.center[1] * 0.8;
  const releaseX = (input.throwProfile.releasePosition[0] - 0.5) * 0.34;
  const releaseY =
    (input.throwProfile.releasePosition[1] - 0.5) *
    ROLL_GROUP_HELD_PLANE_HEIGHT;
  return [centerBiasX + releaseX, centerBiasY + releaseY] as const;
}

function translationForProfile(
  input: Parameters<typeof solveRollGroupMemberMotion>[0],
  profile: RollGroupFeelProfile,
  progress: number,
  phase: number,
  seed: number
): DiceTranslation {
  const restX = input.restingLayout.center[0];
  const restZ = input.restingLayout.center[1];
  const [originX, originZ] = releaseOrigin(input);
  const dirX = input.throwProfile.releaseDirection[0];
  const dirZ = input.throwProfile.releaseDirection[1];
  const scatterX = hashSigned(seed, input.memberIndex, 0x19d2_8f31);
  const scatterZ = hashSigned(seed, input.memberIndex, 0x27b7_4aa5);
  const releaseEnergy = 0.12 + input.throwProfile.releaseSpeed * 0.88;
  const travelX =
    (dirX * profile.travel * 0.34 + scatterX * profile.scatter * 0.18) *
    releaseEnergy;
  const travelZ =
    (dirZ * profile.travel * 0.28 + scatterZ * profile.scatter * 0.18) *
    releaseEnergy;
  const shakeLift = input.throwProfile.shakeEnergy * 0.06;
  const speedLift = input.throwProfile.releaseSpeed * 0.08;

  const directedEnvelope = Math.sin(progress * Math.PI);

  if (profile.id === 'weighty') {
    const eased = 1 - Math.pow(1 - progress, 1.7);
    const sway =
      Math.sin(progress * Math.PI + phase) *
      profile.scatter *
      0.03 *
      (1 - progress) *
      progress;
    return frozenTranslation(
      lerp(originX, restX, eased) + travelX * directedEnvelope + sway,
      Math.sin(progress * Math.PI) * (0.07 + speedLift + shakeLift * 0.7),
      lerp(originZ, restZ, eased) + travelZ * directedEnvelope + sway * 0.4
    );
  }

  if (profile.id === 'energetic') {
    const eased = 1 - Math.pow(1 - progress, 2.6);
    const burst =
      Math.sin(progress * Math.PI * 3 + phase) *
      profile.rebound *
      0.05 *
      (1 - progress) *
      progress;
    return frozenTranslation(
      lerp(originX, restX, eased) + travelX * directedEnvelope + burst,
      Math.sin(progress * Math.PI) * (0.12 + speedLift * 1.2 + shakeLift) +
        Math.abs(Math.sin(progress * Math.PI * 4 + phase)) *
          profile.rebound *
          0.03 *
          (1 - progress),
      lerp(originZ, restZ, eased) + travelZ * directedEnvelope - burst * 0.7
    );
  }

  const impactProgress = 0.58;
  const deflectX =
    hashSigned(seed, input.memberIndex, 0x77a9_0b3d) * profile.rebound * 0.16;
  const deflectZ =
    hashSigned(seed, input.memberIndex, 0x0aa4_c953) * profile.rebound * 0.16;
  const impactX = originX + travelX * 0.85 + deflectX * profile.scatter * 0.5;
  const impactZ = originZ + travelZ * 0.85 + deflectZ * profile.scatter * 0.5;

  if (progress < impactProgress) {
    const local = progress / impactProgress;
    return frozenTranslation(
      lerp(originX, impactX, 1 - Math.pow(1 - local, 2)),
      Math.sin(local * Math.PI * 0.9) * (0.09 + speedLift + shakeLift * 0.9),
      lerp(originZ, impactZ, 1 - Math.pow(1 - local, 2))
    );
  }

  const local = (progress - impactProgress) / (1 - impactProgress);
  const rebound =
    Math.sin(local * Math.PI * 3 + phase) *
    (1 - local) *
    profile.rebound *
    0.08;
  return frozenTranslation(
    lerp(impactX, restX, local) + deflectX * rebound,
    Math.abs(Math.sin(local * Math.PI * 3.5)) *
      (0.03 + profile.rebound * 0.05) *
      (1 - local),
    lerp(impactZ, restZ, local) + deflectZ * rebound
  );
}

function pathRollAxis(
  input: Parameters<typeof solveRollGroupMemberMotion>[0],
  profile: RollGroupFeelProfile,
  deltaX: number,
  deltaZ: number,
  phase: number
): readonly [number, number, number] {
  const distance = Math.hypot(deltaX, deltaZ);
  const baseX = distance > 0.000001 ? deltaZ / distance : Math.sin(phase);
  const baseZ = distance > 0.000001 ? -deltaX / distance : -Math.cos(phase);
  const wobble =
    profile.scatter * 0.025 + input.throwProfile.shakeEnergy * 0.015;
  const x =
    baseX +
    hashSigned(input.throwProfile.motionSeed, input.memberIndex, 0x153a_79d1) *
      wobble;
  const y =
    input.throwProfile.spinBias * 0.12 +
    hashSigned(input.throwProfile.motionSeed, input.memberIndex, 0x63ac_51e7) *
      wobble *
      0.25;
  const z =
    baseZ +
    hashSigned(input.throwProfile.motionSeed, input.memberIndex, 0x41bd_802f) *
      wobble;
  const magnitude = Math.hypot(x, y, z);
  if (!Number.isFinite(magnitude) || magnitude <= 0.000001)
    return [0, 0, -1] as const;
  return [x / magnitude, y / magnitude, z / magnitude] as const;
}

function tumbleQuaternion(
  input: Parameters<typeof solveRollGroupMemberMotion>[0],
  profile: RollGroupFeelProfile,
  progress: number,
  phase: number
): QuaternionTuple {
  const seed = input.throwProfile.motionSeed;
  const stepCount = Math.max(1, Math.ceil(progress * 24));
  const airborneProgress = clamp(progress / 0.48, 0, 1);
  const airborneEase = 1 - Math.pow(1 - airborneProgress, 2);
  const airborneTurns =
    input.throwProfile.releaseSpeed * (1.5 + profile.tumble * 1.1);
  const airborneSpin = vectorAxisQuaternion(
    pathRollAxis(
      input,
      profile,
      input.throwProfile.releaseDirection[0],
      input.throwProfile.releaseDirection[1],
      phase
    ),
    airborneEase * airborneTurns * Math.PI * 2
  );
  let rotation = multiplyQuaternions(airborneSpin, axisQuaternion('y', phase));
  let previous = translationForProfile(input, profile, 0, phase, seed);

  for (let step = 1; step <= stepCount; step += 1) {
    const stepProgress = (progress * step) / stepCount;
    const next = translationForProfile(
      input,
      profile,
      stepProgress,
      phase,
      seed
    );
    const deltaX = next[0] - previous[0];
    const deltaZ = next[2] - previous[2];
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance > 0.000001) {
      const roll = vectorAxisQuaternion(
        pathRollAxis(input, profile, deltaX, deltaZ, phase),
        distance / input.heldLayout.radius
      );
      rotation = multiplyQuaternions(roll, rotation);
    }
    previous = next;
  }

  return normalizedQuaternion(rotation) ?? axisQuaternion('y', phase);
}

function animatedQuaternion(
  input: Parameters<typeof solveRollGroupMemberMotion>[0],
  profile: RollGroupFeelProfile,
  progress: number,
  phase: number
): QuaternionTuple {
  const convergenceStart =
    profile.id === 'weighty' ? 0.68 : profile.id === 'energetic' ? 0.52 : 0.6;
  if (progress <= convergenceStart) {
    return tumbleQuaternion(input, profile, progress, phase);
  }
  const start = tumbleQuaternion(input, profile, convergenceStart, phase);
  return slerp(
    start,
    input.target,
    (progress - convergenceStart) / (1 - convergenceStart)
  );
}

export function solveRollGroupMemberMotion(input: {
  readonly profile: RollGroupFeelProfile;
  readonly phase: RollGroupMotionPhase;
  readonly elapsedMs: number;
  readonly reducedMotion: boolean;
  readonly target: QuaternionTuple;
  readonly throwProfile: VisualThrowProfileV1;
  readonly memberIndex: number;
  readonly memberCount: number;
  readonly held?: AnchoredHeldRollGroupState;
  readonly affectedByCurrentReroll: boolean;
  readonly heldLayout: RollGroupMemberLayout;
  readonly restingLayout: RollGroupMemberLayout;
}): DiceMotionPose {
  try {
    if (
      !validFeelProfile(input.profile) ||
      !VALID_PHASES.has(input.phase) ||
      !Number.isFinite(input.elapsedMs) ||
      input.elapsedMs < 0 ||
      typeof input.reducedMotion !== 'boolean' ||
      !validTarget(input.target) ||
      !parseVisualThrowProfile(input.throwProfile) ||
      !Number.isInteger(input.memberCount) ||
      input.memberCount <= 0 ||
      !Number.isInteger(input.memberIndex) ||
      input.memberIndex < 0 ||
      input.memberIndex >= input.memberCount ||
      typeof input.affectedByCurrentReroll !== 'boolean' ||
      !validLayout(input.heldLayout) ||
      !validLayout(input.restingLayout) ||
      (input.held !== undefined && !validHeldState(input.held)) ||
      !Number.isInteger(input.throwProfile.motionSeed) ||
      input.throwProfile.motionSeed < 0 ||
      input.throwProfile.motionSeed > MAX_UINT32
    ) {
      return failedPose();
    }

    if (input.phase === 'held') {
      const groupX = input.held?.planePosition[0] ?? 0;
      const groupZ = input.held?.planePosition[1] ?? 0;
      const lift = input.reducedMotion
        ? HOLD_LIFT
        : HOLD_LIFT + (input.held?.shakeEnergy ?? 0) * 0.02;
      return pose(
        heldQuaternion(
          input,
          seedPhase(input.profile, input.throwProfile, input.memberIndex)
        ),
        frozenTranslation(
          groupX + input.heldLayout.center[0],
          lift,
          groupZ + input.heldLayout.center[1]
        ),
        false,
        false,
        false
      );
    }

    if (
      input.phase === 'settled-originals' ||
      input.phase === 'settled-final'
    ) {
      return exactRestPose(input.target, input.restingLayout);
    }

    if (input.phase === 'rerolling' && !input.affectedByCurrentReroll) {
      return exactRestPose(input.target, input.restingLayout);
    }

    if (input.reducedMotion)
      return exactRestPose(input.target, input.restingLayout);

    const durationMs =
      input.phase === 'rerolling'
        ? input.profile.rerollDurationMs
        : input.profile.durationMs;
    if (input.elapsedMs >= durationMs) {
      return exactRestPose(input.target, input.restingLayout);
    }

    const progress = clamp(input.elapsedMs / durationMs, 0, 1);
    const phase = seedPhase(
      input.profile,
      input.throwProfile,
      input.memberIndex
    );
    const translation = translationForProfile(
      input,
      input.profile,
      progress,
      phase,
      input.throwProfile.motionSeed
    );
    const quaternion = animatedQuaternion(
      input,
      input.profile,
      progress,
      phase
    );
    return pose(quaternion, translation, false, false, false);
  } catch {
    return failedPose();
  }
}
