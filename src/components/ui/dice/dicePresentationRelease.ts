const PRESENTATION_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const PRESET_IDENTIFIER = /^[a-z][a-z0-9-]{0,63}$/;
const RELEASE_VARIATION_CARDINALITY = 997;
const RELEASE_KEYS = [
  'schemaVersion',
  'presentationId',
  'presetId',
  'variation',
  'vector',
  'shake',
] as const;

export interface AttackDieDecorativeRelease {
  variation: number;
  vector: readonly [number, number];
  shake: number;
}

export interface DicePresentationRelease extends AttackDieDecorativeRelease {
  schemaVersion: 1;
  presentationId: string;
  presetId: string;
}

interface CreateDicePresentationReleaseInput {
  presentationId: string;
  presetId: string;
  variation: number;
}

function snapshotExactObject(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      keys.length !== expectedKeys.length ||
      !expectedKeys.every((key) => keys.includes(key))
    )
      return undefined;
    const snapshot: Record<string, unknown> = {};
    for (const key of expectedKeys) snapshot[key] = record[key];
    return snapshot;
  } catch {
    return undefined;
  }
}

function snapshotVector(
  value: unknown
): readonly [unknown, unknown] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const keys = Object.keys(value);
    if (
      value.length !== 2 ||
      keys.length !== 2 ||
      !keys.includes('0') ||
      !keys.includes('1')
    )
      return undefined;
    return [value[0], value[1]];
  } catch {
    return undefined;
  }
}

const boundedFinite = (value: unknown, minimum: number, maximum: number) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= minimum &&
  value <= maximum;

export function isDicePresentationIdentifier(value: unknown): value is string {
  return typeof value === 'string' && PRESENTATION_IDENTIFIER.test(value);
}

export function isDicePresetIdentifier(value: unknown): value is string {
  return typeof value === 'string' && PRESET_IDENTIFIER.test(value);
}

export function createDicePresentationRelease({
  presentationId,
  presetId,
  variation,
}: CreateDicePresentationReleaseInput): DicePresentationRelease {
  if (!isDicePresentationIdentifier(presentationId))
    throw Error('presentation id is malformed');
  if (!isDicePresetIdentifier(presetId)) throw Error('preset id is malformed');
  if (!Number.isFinite(variation)) throw Error('variation must be finite');

  return Object.freeze({
    schemaVersion: 1,
    presentationId,
    presetId,
    variation: Math.abs(Math.trunc(variation)) % RELEASE_VARIATION_CARDINALITY,
    vector: Object.freeze([0, 0] as const),
    shake: 0,
  });
}

export function parseDicePresentationRelease(
  value: unknown
): DicePresentationRelease | undefined {
  const snapshot = snapshotExactObject(value, RELEASE_KEYS);
  if (!snapshot) return undefined;
  const vector = snapshotVector(snapshot.vector);
  if (
    snapshot.schemaVersion !== 1 ||
    !isDicePresentationIdentifier(snapshot.presentationId) ||
    !isDicePresetIdentifier(snapshot.presetId) ||
    !Number.isInteger(snapshot.variation) ||
    !boundedFinite(snapshot.variation, 0, RELEASE_VARIATION_CARDINALITY - 1) ||
    !vector ||
    !boundedFinite(vector[0], -1, 1) ||
    !boundedFinite(vector[1], -1, 1) ||
    !boundedFinite(snapshot.shake, 0, 1)
  )
    return undefined;

  return Object.freeze({
    schemaVersion: 1,
    presentationId: snapshot.presentationId,
    presetId: snapshot.presetId,
    variation: Number(snapshot.variation),
    vector: Object.freeze([Number(vector[0]), Number(vector[1])] as const),
    shake: Number(snapshot.shake),
  });
}

export function dicePresentationReleaseKey(
  release: Pick<DicePresentationRelease, 'presentationId'>
) {
  return release.presentationId;
}
