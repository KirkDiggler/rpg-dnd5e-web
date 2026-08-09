import type { Vec3 } from './types';

/** Structural shape shared by the current and incoming generated proto. */
export interface CanonicalWorldOffset {
  x: number;
  y: number;
  z: number;
}

/**
 * Presence-aware extraction. An explicit all-zero message remains an object;
 * omission remains undefined. Values are never rotated, clamped or defaulted.
 */
export function offsetFromPlacement(
  value: unknown
): CanonicalWorldOffset | undefined {
  const offset = (value as { offset?: CanonicalWorldOffset } | undefined)
    ?.offset;
  if (offset === undefined) return undefined;
  if (![offset.x, offset.y, offset.z].every(Number.isFinite)) {
    throw new TypeError(
      'placement offset must contain exactly three finite values'
    );
  }
  return { x: offset.x, y: offset.y, z: offset.z };
}

export function sameWorldOffset(
  a: CanonicalWorldOffset | undefined,
  b: CanonicalWorldOffset | undefined
): boolean {
  return (
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      a.x === b.x &&
      a.y === b.y &&
      a.z === b.z)
  );
}

export function worldOffsetTuple(
  offset: CanonicalWorldOffset | undefined
): Vec3 {
  return offset === undefined ? [0, 0, 0] : [offset.x, offset.y, offset.z];
}
