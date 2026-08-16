export interface VisualThrowProfileV1 {
  readonly schemaVersion: 1;
  readonly releasePosition: readonly [number, number];
  readonly releaseDirection: readonly [number, number];
  readonly releaseSpeed: number;
  readonly shakeEnergy: number;
  readonly spinBias: number;
  readonly motionSeed: number;
}

export interface VisualThrowProfileInput {
  releasePosition: readonly [number, number];
  releaseDirection: readonly [number, number];
  releaseSpeed: number;
  shakeEnergy: number;
  spinBias: number;
  motionSeed: number;
}

const PROFILE_KEYS = [
  'schemaVersion',
  'releasePosition',
  'releaseDirection',
  'releaseSpeed',
  'shakeEnergy',
  'spinBias',
  'motionSeed',
] as const;
const DIRECTION_EPSILON = 1e-9;
const UNIT_TOLERANCE = 1e-6;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function frozenTuple(first: number, second: number): readonly [number, number] {
  return Object.freeze([first, second] as [number, number]);
}

function frozenProfile(
  releasePosition: readonly [number, number],
  releaseDirection: readonly [number, number],
  releaseSpeed: number,
  shakeEnergy: number,
  spinBias: number,
  motionSeed: number
): VisualThrowProfileV1 {
  return Object.freeze({
    schemaVersion: 1 as const,
    releasePosition,
    releaseDirection,
    releaseSpeed,
    shakeEnergy,
    spinBias,
    motionSeed,
  });
}

export function createVisualThrowProfile(
  input: VisualThrowProfileInput
): VisualThrowProfileV1 {
  const positionX = input.releasePosition[0];
  const positionY = input.releasePosition[1];
  const directionX = input.releaseDirection[0];
  const directionY = input.releaseDirection[1];
  const { releaseSpeed, shakeEnergy, spinBias, motionSeed } = input;
  const values = [
    positionX,
    positionY,
    directionX,
    directionY,
    releaseSpeed,
    shakeEnergy,
    spinBias,
    motionSeed,
  ];
  if (!values.every(Number.isFinite) || !Number.isInteger(motionSeed)) {
    throw new RangeError(
      'Visual throw profile values must be finite and motion seed must be an integer'
    );
  }

  const directionLength = Math.hypot(directionX, directionY);
  const hasCanonicalZeroDirection = directionLength <= DIRECTION_EPSILON;
  let releaseDirection: readonly [number, number];
  if (hasCanonicalZeroDirection) {
    releaseDirection = frozenTuple(0, 0);
  } else {
    const directionScale = Math.max(Math.abs(directionX), Math.abs(directionY));
    const scaledX = directionX / directionScale;
    const scaledY = directionY / directionScale;
    const scaledLength = Math.hypot(scaledX, scaledY);
    releaseDirection = frozenTuple(
      scaledX / scaledLength,
      scaledY / scaledLength
    );
  }

  return frozenProfile(
    frozenTuple(clamp(positionX, 0, 1), clamp(positionY, 0, 1)),
    releaseDirection,
    hasCanonicalZeroDirection ? 0 : clamp(releaseSpeed, 0, 1),
    clamp(shakeEnergy, 0, 1),
    clamp(spinBias, -1, 1),
    motionSeed >>> 0
  );
}

export function createNeutralVisualThrowProfile(
  motionSeed: number
): VisualThrowProfileV1 {
  return createVisualThrowProfile({
    releasePosition: [0.5, 0.5],
    releaseDirection: [0, 0],
    releaseSpeed: 0,
    shakeEnergy: 0,
    spinBias: 0,
    motionSeed,
  });
}

function hasExactKeys(
  actual: readonly PropertyKey[],
  expected: readonly string[]
): boolean {
  return (
    actual.length === expected.length &&
    expected.every((key) => actual.includes(key))
  );
}

function snapshotProfile(
  value: unknown
): Record<(typeof PROFILE_KEYS)[number], unknown> | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    if (!hasExactKeys(keys, PROFILE_KEYS)) return undefined;

    const record = value as Record<(typeof PROFILE_KEYS)[number], unknown>;
    return {
      schemaVersion: record.schemaVersion,
      releasePosition: record.releasePosition,
      releaseDirection: record.releaseDirection,
      releaseSpeed: record.releaseSpeed,
      shakeEnergy: record.shakeEnergy,
      spinBias: record.spinBias,
      motionSeed: record.motionSeed,
    };
  } catch {
    return undefined;
  }
}

function snapshotTuple(
  value: unknown
): readonly [unknown, unknown] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const keys = Reflect.ownKeys(value);
    if (!hasExactKeys(keys, ['0', '1', 'length']) || value.length !== 2) {
      return undefined;
    }
    return [value[0], value[1]];
  } catch {
    return undefined;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function parseVisualThrowProfile(
  value: unknown
): VisualThrowProfileV1 | undefined {
  const profile = snapshotProfile(value);
  if (!profile || profile.schemaVersion !== 1) return undefined;

  const position = snapshotTuple(profile.releasePosition);
  const direction = snapshotTuple(profile.releaseDirection);
  if (!position || !direction) return undefined;

  const [positionX, positionY] = position;
  const [directionX, directionY] = direction;
  if (
    !isFiniteNumber(positionX) ||
    !isFiniteNumber(positionY) ||
    !isFiniteNumber(directionX) ||
    !isFiniteNumber(directionY) ||
    !isFiniteNumber(profile.releaseSpeed) ||
    !isFiniteNumber(profile.shakeEnergy) ||
    !isFiniteNumber(profile.spinBias) ||
    !isFiniteNumber(profile.motionSeed)
  ) {
    return undefined;
  }

  const directionLength = Math.hypot(directionX, directionY);
  if (
    !isInRange(positionX, 0, 1) ||
    !isInRange(positionY, 0, 1) ||
    !isInRange(profile.releaseSpeed, 0, 1) ||
    !isInRange(profile.shakeEnergy, 0, 1) ||
    !isInRange(profile.spinBias, -1, 1) ||
    !Number.isInteger(profile.motionSeed) ||
    !isInRange(profile.motionSeed, 0, 0xffff_ffff) ||
    (directionLength === 0 && profile.releaseSpeed !== 0) ||
    (directionLength !== 0 && Math.abs(directionLength - 1) > UNIT_TOLERANCE)
  ) {
    return undefined;
  }

  return frozenProfile(
    frozenTuple(positionX, positionY),
    frozenTuple(directionX, directionY),
    profile.releaseSpeed,
    profile.shakeEnergy,
    profile.spinBias,
    profile.motionSeed
  );
}
