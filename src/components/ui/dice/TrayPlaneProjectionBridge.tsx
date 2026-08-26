import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import type { ClientBounds } from './rollGroupGestureController';
import {
  createTrayPlaneProjection,
  type TrayPlaneProjection,
} from './trayPlaneProjection';

export interface TrayPlaneProjectionBridgeProps {
  readonly origin: readonly [number, number, number];
  readonly xAxis: readonly [number, number, number];
  readonly yAxis: readonly [number, number, number];
  readonly width: number;
  readonly height: number;
  readonly projectionRef?: {
    current: TrayPlaneProjection | undefined;
  };
  readonly onProjection?: (projection: TrayPlaneProjection | undefined) => void;
}

function canvasViewport(domElement: HTMLElement): ClientBounds | undefined {
  try {
    const rect = domElement.getBoundingClientRect();
    const viewport = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    return Number.isFinite(viewport.left) &&
      Number.isFinite(viewport.top) &&
      Number.isFinite(viewport.width) &&
      Number.isFinite(viewport.height)
      ? viewport
      : undefined;
  } catch {
    return undefined;
  }
}

export function TrayPlaneProjectionBridge({
  origin,
  xAxis,
  yAxis,
  width,
  height,
  projectionRef,
  onProjection,
}: TrayPlaneProjectionBridgeProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);

  useLayoutEffect(() => {
    const viewport = canvasViewport(gl.domElement);
    const projection = viewport
      ? createTrayPlaneProjection({
          camera,
          viewport,
          origin,
          xAxis,
          yAxis,
          width,
          height,
        })
      : undefined;
    if (projectionRef) projectionRef.current = projection;
    onProjection?.(projection);
    return () => {
      if (projectionRef) projectionRef.current = undefined;
      onProjection?.(undefined);
    };
  }, [
    camera,
    gl,
    height,
    onProjection,
    origin,
    projectionRef,
    size.height,
    size.width,
    width,
    xAxis,
    yAxis,
  ]);

  return null;
}
