const PRESENTATION_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const PRESET_IDENTIFIER = /^[a-z][a-z0-9-]{0,63}$/;
const RELEASE_VARIATION_CARDINALITY = 997;

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

const plainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[]
) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

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
  if (
    !plainObject(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'presentationId',
      'presetId',
      'variation',
      'vector',
      'shake',
    ]) ||
    value.schemaVersion !== 1 ||
    !isDicePresentationIdentifier(value.presentationId) ||
    !isDicePresetIdentifier(value.presetId) ||
    !Number.isInteger(value.variation) ||
    !boundedFinite(value.variation, 0, RELEASE_VARIATION_CARDINALITY - 1) ||
    !Array.isArray(value.vector) ||
    value.vector.length !== 2 ||
    Object.keys(value.vector).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(value.vector, 0) ||
    !Object.prototype.hasOwnProperty.call(value.vector, 1) ||
    !boundedFinite(value.vector[0], -1, 1) ||
    !boundedFinite(value.vector[1], -1, 1) ||
    !boundedFinite(value.shake, 0, 1)
  )
    return undefined;

  return Object.freeze({
    schemaVersion: 1,
    presentationId: value.presentationId,
    presetId: value.presetId,
    variation: Number(value.variation),
    vector: Object.freeze([
      Number(value.vector[0]),
      Number(value.vector[1]),
    ] as const),
    shake: Number(value.shake),
  });
}

export function dicePresentationReleaseKey(
  release: Pick<DicePresentationRelease, 'presentationId'>
) {
  return release.presentationId;
}
