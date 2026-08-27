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

function sameViewport(first: ClientBounds, second: ClientBounds): boolean {
  return (
    first.left === second.left &&
    first.top === second.top &&
    first.width === second.width &&
    first.height === second.height
  );
}

function createLiveProjection(input: {
  readonly camera: Parameters<typeof createTrayPlaneProjection>[0]['camera'];
  readonly domElement: HTMLElement;
  readonly origin: TrayPlaneProjectionBridgeProps['origin'];
  readonly xAxis: TrayPlaneProjectionBridgeProps['xAxis'];
  readonly yAxis: TrayPlaneProjectionBridgeProps['yAxis'];
  readonly width: number;
  readonly height: number;
}): TrayPlaneProjection | undefined {
  const build = (viewport: ClientBounds) =>
    createTrayPlaneProjection({
      camera: input.camera,
      viewport,
      origin: input.origin,
      xAxis: input.xAxis,
      yAxis: input.yAxis,
      width: input.width,
      height: input.height,
    });
  let currentViewport = canvasViewport(input.domElement);
  let currentProjection = currentViewport ? build(currentViewport) : undefined;
  if (!currentViewport || !currentProjection) return undefined;

  const refresh = (): TrayPlaneProjection | undefined => {
    const nextViewport = canvasViewport(input.domElement);
    if (!nextViewport) {
      currentViewport = undefined;
      currentProjection = undefined;
      return undefined;
    }
    if (!currentViewport || !sameViewport(currentViewport, nextViewport)) {
      currentViewport = nextViewport;
      currentProjection = build(nextViewport);
    }
    return currentProjection;
  };

  return Object.freeze({
    screenToPlane: (clientX: number, clientY: number) =>
      refresh()?.screenToPlane(clientX, clientY),
    planeToScreen: (
      point: Parameters<TrayPlaneProjection['planeToScreen']>[0]
    ) => refresh()?.planeToScreen(point),
    planeToNormalized: (
      point: Parameters<TrayPlaneProjection['planeToNormalized']>[0]
    ) => refresh()?.planeToNormalized(point),
  });
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
    const projection = createLiveProjection({
      camera,
      domElement: gl.domElement,
      origin,
      xAxis,
      yAxis,
      width,
      height,
    });
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
