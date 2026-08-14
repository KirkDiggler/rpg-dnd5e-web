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

export function createDicePresentationRelease({
  presentationId,
  presetId,
  variation,
}: CreateDicePresentationReleaseInput): DicePresentationRelease {
  if (!presentationId.trim()) throw Error('presentation id must not be blank');
  if (presetId !== 'lightning') throw Error('preset is not allowlisted');
  if (!Number.isFinite(variation)) throw Error('variation must be finite');

  return Object.freeze({
    schemaVersion: 1,
    presentationId,
    presetId,
    variation: Math.abs(Math.trunc(variation)) % 997,
    vector: Object.freeze([0, 0] as const),
    shake: 0,
  });
}

export function dicePresentationReleaseKey(
  release: Pick<DicePresentationRelease, 'presentationId' | 'variation'>
) {
  return `${release.presentationId}:${release.variation}`;
}
