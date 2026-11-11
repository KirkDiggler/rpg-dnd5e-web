import type {
  WallFinishOverrides,
  WallFinishSide,
} from '@/concepts/world-building/wallFinishTypes';

/** Copy captured face facts, never fetch or infer a source/region default. */
export function copyWallFaceFinishes(
  value: unknown,
  path = 'wall.faceFinishes'
): WallFinishOverrides {
  if (!Array.isArray(value))
    throw Error(`${path}: face finishes must be a list`);
  const result: WallFinishOverrides = {};
  for (const entry of value) {
    if (!entry || typeof entry !== 'object')
      throw Error(`${path}: invalid face finish`);
    const { side, materialRef } = entry;
    if (
      (side !== 'positive-z' && side !== 'negative-z') ||
      typeof materialRef !== 'string' ||
      !materialRef.trim()
    )
      throw Error(`${path}: invalid face or material reference`);
    if (Object.hasOwn(result, side))
      throw Error(`${path}: duplicate face finish`);
    result[side as WallFinishSide] = materialRef;
  }
  return result;
}
