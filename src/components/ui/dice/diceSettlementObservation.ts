import type { DiceSettlementEntryV2 } from './diceRuntimeManifest';

export interface UpwardResultObservation {
  readonly result: number;
  readonly upDot: number;
  readonly runnerUpDot: number;
  readonly margin: number;
}

const D20_RESULT_COUNT = 20;
const D20_SUPPORTED_RESULTS = Object.freeze(
  Array.from({ length: D20_RESULT_COUNT }, (_, index) => index + 1)
);
const NORMALIZATION_TOLERANCE = 0.000001;
const MINIMUM_UPWARD_MARGIN = 0.2;

type Direction = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

function finiteUnitTuple(
  value: unknown,
  length: 3 | 4,
  label: 'witness direction' | 'world quaternion'
): asserts value is Direction | Quaternion {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every(
      (component) => typeof component === 'number' && Number.isFinite(component)
    )
  )
    throw Error(`${label} must be a finite unit tuple`);
  const magnitude = Math.hypot(...value);
  if (Math.abs(magnitude - 1) > NORMALIZATION_TOLERANCE)
    throw Error(`${label} must be normalized`);
}

function transformedUpDot(
  direction: Direction,
  quaternion: Quaternion
): number {
  const [vx, vy, vz] = direction;
  const [x, y, z, w] = quaternion;
  const transformedY =
    2 * (x * y + w * z) * vx +
    (1 - 2 * (x * x + z * z)) * vy +
    2 * (y * z - w * x) * vz;
  if (!Number.isFinite(transformedY))
    throw Error('witness direction produced nonfinite observation data');
  return Math.max(-1, Math.min(1, transformedY));
}

function observeUpwardPresetResultInternal(
  entries: Readonly<Record<string, DiceSettlementEntryV2>>,
  supportedResults: readonly number[],
  worldQuaternion: readonly [number, number, number, number],
  resultSetLabel: string,
  exactResultSetDescription: string
): UpwardResultObservation {
  finiteUnitTuple(worldQuaternion, 4, 'world quaternion');

  if (
    !Array.isArray(supportedResults) ||
    supportedResults.length === 0 ||
    supportedResults.some(
      (result, index) =>
        !Number.isInteger(result) || supportedResults.indexOf(result) !== index
    )
  )
    throw Error(`${resultSetLabel} must contain unique integer results`);

  if (entries === null || typeof entries !== 'object' || Array.isArray(entries))
    throw Error(`${resultSetLabel} must be a complete object`);
  const keys = Reflect.ownKeys(entries);
  const expectedKeys = supportedResults.map(String);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== 'string') ||
    !expectedKeys.every((result) => keys.includes(result))
  )
    throw Error(`${resultSetLabel} must contain ${exactResultSetDescription}`);

  const ranked = keys.map((key) => {
    const result = Number(key);
    const direction = entries[key as string]?.witness?.readDirection;
    finiteUnitTuple(direction, 3, 'witness direction');
    return {
      result,
      upDot: transformedUpDot(direction as Direction, worldQuaternion),
    };
  });
  ranked.sort((left, right) => right.upDot - left.upDot);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const margin = winner.upDot - runnerUp.upDot;
  if (!Number.isFinite(margin) || margin <= MINIMUM_UPWARD_MARGIN)
    throw Error('upward result has a tie or insufficient separation margin');

  return Object.freeze({
    result: winner.result,
    upDot: winner.upDot,
    runnerUpDot: runnerUp.upDot,
    margin,
  });
}

export function observeUpwardPresetResult(
  entries: Readonly<Record<string, DiceSettlementEntryV2>>,
  supportedResults: readonly number[],
  worldQuaternion: readonly [number, number, number, number]
): UpwardResultObservation {
  return observeUpwardPresetResultInternal(
    entries,
    supportedResults,
    worldQuaternion,
    'preset result set',
    'the supported results'
  );
}

export function observeUpwardResult(
  entries: Readonly<Record<string, DiceSettlementEntryV2>>,
  worldQuaternion: readonly [number, number, number, number]
): UpwardResultObservation {
  return observeUpwardPresetResultInternal(
    entries,
    D20_SUPPORTED_RESULTS,
    worldQuaternion,
    'd20 result set',
    'exactly results 1 through 20'
  );
}
