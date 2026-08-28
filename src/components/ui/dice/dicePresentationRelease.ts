import {
  parseVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

const PRESENTATION_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const PRESET_IDENTIFIER_SEGMENT = /^[a-z][a-z0-9-]{0,31}$/;
const RELEASE_KEYS = [
  'schemaVersion',
  'presentationId',
  'presetId',
  'throwProfile',
] as const;

export interface DicePresentationRelease {
  readonly schemaVersion: 2;
  readonly presentationId: string;
  readonly presetId: string;
  readonly throwProfile: VisualThrowProfileV1;
}

function sameKeys(actual: readonly PropertyKey[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    expected.every((key) => actual.includes(key))
  );
}

function snapshotExactObject(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const keys = Reflect.ownKeys(value);
    if (!sameKeys(keys, expectedKeys)) return undefined;
    const record = value as Record<string, unknown>;
    const snapshot: Record<string, unknown> = {};
    for (const key of expectedKeys) snapshot[key] = record[key];
    return snapshot;
  } catch {
    return undefined;
  }
}

export function isDicePresentationIdentifier(value: unknown): value is string {
  return typeof value === 'string' && PRESENTATION_IDENTIFIER.test(value);
}

export function isDicePresetIdentifier(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64)
    return false;
  const segments = value.split('.');
  return (
    segments.length <= 8 &&
    segments.every((segment) => PRESET_IDENTIFIER_SEGMENT.test(segment))
  );
}

export function createDicePresentationRelease(input: {
  presentationId: string;
  presetId: string;
  throwProfile: VisualThrowProfileV1;
}): DicePresentationRelease {
  const { presentationId, presetId } = input;
  if (!isDicePresentationIdentifier(presentationId))
    throw Error('presentation id is malformed');
  if (!isDicePresetIdentifier(presetId)) throw Error('preset id is malformed');
  const throwProfile = parseVisualThrowProfile(input.throwProfile);
  if (!throwProfile) throw Error('throw profile is malformed');

  return Object.freeze({
    schemaVersion: 2,
    presentationId,
    presetId,
    throwProfile,
  });
}

export function parseDicePresentationRelease(
  value: unknown
): DicePresentationRelease | undefined {
  const snapshot = snapshotExactObject(value, RELEASE_KEYS);
  if (
    !snapshot ||
    snapshot.schemaVersion !== 2 ||
    !isDicePresentationIdentifier(snapshot.presentationId) ||
    !isDicePresetIdentifier(snapshot.presetId)
  )
    return undefined;

  const throwProfile = parseVisualThrowProfile(snapshot.throwProfile);
  if (!throwProfile) return undefined;

  return Object.freeze({
    schemaVersion: 2,
    presentationId: snapshot.presentationId,
    presetId: snapshot.presetId,
    throwProfile,
  });
}

export function dicePresentationReleaseKey(
  release: Pick<DicePresentationRelease, 'presentationId'>
) {
  return release.presentationId;
}
