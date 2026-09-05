export type Vec3 = [number, number, number];

export interface SimpleBounds {
  min: Vec3;
  max: Vec3;
}

export function centeredFloorOffset(
  bounds: SimpleBounds,
  totalScale: number,
  fineOffsetMeters: Vec3
): Vec3 {
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  return [
    -centerX * totalScale + fineOffsetMeters[0],
    -bounds.min[1] * totalScale + fineOffsetMeters[1],
    -centerZ * totalScale + fineOffsetMeters[2],
  ];
}
