import type { SimpleBounds, Vec3 } from '../prop-calibration/previewTransform';

export interface EditorCameraFrame {
  position: Vec3;
  target: Vec3;
  zoom: number;
}
/** Camera-only fitting. Source geometry/scale/UVs are never changed to fill the view. */
export function editorCameraFrame(
  bounds: SimpleBounds,
  scale: number,
  floorY: number,
  width: number,
  height: number
): EditorCameraFrame {
  const dimensions = bounds.max.map(
    (value, i) => (value - bounds.min[i]!) * scale
  );
  if (
    ![...dimensions, scale, floorY, width, height].every(Number.isFinite) ||
    scale <= 0 ||
    width <= 0 ||
    height <= 0 ||
    dimensions.some((d) => d < 0)
  )
    throw new Error('Cannot frame invalid asset bounds or viewport');
  // A bounding sphere encloses every camera orientation, including long floors.
  const diameter = Math.max(Math.hypot(...dimensions), 0.1);
  const target: Vec3 = [0, floorY + dimensions[1]! / 2, 0];
  const distance = Math.max(4, diameter * 2);
  return {
    target,
    position: [distance, target[1] + distance * 0.85, distance],
    zoom: (0.7 * Math.min(width, height)) / diameter,
  };
}
