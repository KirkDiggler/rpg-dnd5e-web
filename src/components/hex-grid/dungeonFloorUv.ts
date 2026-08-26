/** Convert an absolute world-space floor point to profile texture UVs. */
export function dungeonFloorUv(
  worldX: number,
  worldZ: number,
  worldUnitsPerRepeat: number
): readonly [number, number] {
  if (!Number.isFinite(worldUnitsPerRepeat) || worldUnitsPerRepeat <= 0) {
    throw new Error('worldUnitsPerRepeat must be finite and positive');
  }
  return [worldX / worldUnitsPerRepeat, worldZ / worldUnitsPerRepeat];
}
