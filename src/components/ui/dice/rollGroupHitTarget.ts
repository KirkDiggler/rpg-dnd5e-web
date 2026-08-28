import type { CSSProperties } from 'react';
import type { ClientBounds } from './rollGroupGestureController';
import type { RollGroupMemberLayout } from './rollGroupLayout';
import {
  ROLL_GROUP_HELD_PLANE_HEIGHT,
  ROLL_GROUP_HELD_PLANE_WIDTH,
} from './rollGroupTrayGeometry';
import type { TrayPlaneProjection } from './trayPlaneProjection';

const finitePoint = (
  point: readonly [number, number] | undefined
): point is readonly [number, number] =>
  point !== undefined && point.every(Number.isFinite);

export function projectRollGroupHitTarget(
  layout: RollGroupMemberLayout,
  projection: TrayPlaneProjection | undefined,
  overlay: ClientBounds | undefined
): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    zIndex: 2,
    margin: 0,
    padding: 0,
    border: 0,
    borderRadius: '50%',
    background: 'transparent',
    boxShadow: 'none',
    transform: 'translate(-50%, -50%)',
    touchAction: 'none',
  };
  if (projection && overlay) {
    const center = projection.planeToScreen(layout.center);
    const leftEdge = projection.planeToScreen([
      layout.center[0] - layout.radius,
      layout.center[1],
    ]);
    const rightEdge = projection.planeToScreen([
      layout.center[0] + layout.radius,
      layout.center[1],
    ]);
    const topEdge = projection.planeToScreen([
      layout.center[0],
      layout.center[1] - layout.radius,
    ]);
    const bottomEdge = projection.planeToScreen([
      layout.center[0],
      layout.center[1] + layout.radius,
    ]);
    if (
      finitePoint(center) &&
      finitePoint(leftEdge) &&
      finitePoint(rightEdge) &&
      finitePoint(topEdge) &&
      finitePoint(bottomEdge)
    ) {
      const width = Math.abs(rightEdge[0] - leftEdge[0]);
      const height = Math.abs(bottomEdge[1] - topEdge[1]);
      if (width > 0 && height > 0)
        return {
          ...base,
          left: `${center[0] - overlay.left}px`,
          top: `${center[1] - overlay.top}px`,
          width: `${width}px`,
          height: `${height}px`,
        };
    }
  }

  return {
    ...base,
    left: `${50 + (layout.center[0] / ROLL_GROUP_HELD_PLANE_WIDTH) * 100}%`,
    top: `${50 - (layout.center[1] / ROLL_GROUP_HELD_PLANE_HEIGHT) * 100}%`,
    width: `${(layout.radius * 2 * 100) / ROLL_GROUP_HELD_PLANE_WIDTH}%`,
    height: `${(layout.radius * 2 * 100) / ROLL_GROUP_HELD_PLANE_HEIGHT}%`,
  };
}
