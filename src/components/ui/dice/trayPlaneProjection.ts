import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import type { ClientBounds } from './rollGroupGestureController';

export type TrayPlanePoint = readonly [number, number];

export interface TrayPlaneProjection {
  readonly screenToPlane: (
    clientX: number,
    clientY: number
  ) => TrayPlanePoint | undefined;
  readonly planeToScreen: (
    point: TrayPlanePoint
  ) => readonly [number, number] | undefined;
  readonly planeToNormalized: (
    point: TrayPlanePoint
  ) => readonly [number, number] | undefined;
}

const AXIS_TOLERANCE = 0.000001;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function finiteTuple3(
  tuple: readonly number[]
): tuple is readonly [number, number, number] {
  return (
    tuple.length === 3 &&
    Number.isFinite(tuple[0]) &&
    Number.isFinite(tuple[1]) &&
    Number.isFinite(tuple[2])
  );
}

function finiteTuple2(tuple: readonly number[]): tuple is TrayPlanePoint {
  return (
    tuple.length === 2 && Number.isFinite(tuple[0]) && Number.isFinite(tuple[1])
  );
}

function finiteBounds(bounds: ClientBounds): boolean {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function finiteVector(vector: Vector3): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

function frozenPoint(first: number, second: number): TrayPlanePoint {
  return Object.freeze([first, second] as [number, number]);
}

export function createTrayPlaneProjection(input: {
  readonly camera: Camera;
  readonly viewport: ClientBounds;
  readonly origin: readonly [number, number, number];
  readonly xAxis: readonly [number, number, number];
  readonly yAxis: readonly [number, number, number];
  readonly width: number;
  readonly height: number;
}): TrayPlaneProjection | undefined {
  if (
    !finiteBounds(input.viewport) ||
    !finiteTuple3(input.origin) ||
    !finiteTuple3(input.xAxis) ||
    !finiteTuple3(input.yAxis) ||
    !Number.isFinite(input.width) ||
    !Number.isFinite(input.height) ||
    input.width <= 0 ||
    input.height <= 0
  ) {
    return undefined;
  }

  const origin = new Vector3(...input.origin);
  const xAxis = new Vector3(...input.xAxis);
  const yAxis = new Vector3(...input.yAxis);
  const xLength = xAxis.length();
  const yLength = yAxis.length();
  const dot = xAxis.dot(yAxis);
  if (
    Math.abs(xLength - 1) > AXIS_TOLERANCE ||
    Math.abs(yLength - 1) > AXIS_TOLERANCE ||
    Math.abs(dot) > AXIS_TOLERANCE
  ) {
    return undefined;
  }

  const normal = new Vector3().crossVectors(xAxis, yAxis);
  if (!finiteVector(normal) || Math.abs(normal.length() - 1) > AXIS_TOLERANCE) {
    return undefined;
  }

  const plane = new Plane(normal, -normal.dot(origin));
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const worldPoint = new Vector3();
  const viewPoint = new Vector3();
  const projectedPoint = new Vector3();
  const viewportSnapshot = {
    left: input.viewport.left,
    top: input.viewport.top,
    width: input.viewport.width,
    height: input.viewport.height,
  };
  const updateCameraMatrices = () => {
    try {
      input.camera.updateMatrixWorld(true);
      return true;
    } catch {
      return false;
    }
  };

  const projection: TrayPlaneProjection = {
    screenToPlane(clientX, clientY) {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY))
        return undefined;
      try {
        if (!updateCameraMatrices()) return undefined;
        ndc.set(
          ((clientX - viewportSnapshot.left) / viewportSnapshot.width) * 2 - 1,
          1 - ((clientY - viewportSnapshot.top) / viewportSnapshot.height) * 2
        );
        raycaster.setFromCamera(ndc, input.camera);
        const intersection = raycaster.ray.intersectPlane(plane, worldPoint);
        if (!intersection || !finiteVector(intersection)) return undefined;
        const delta = intersection.clone().sub(origin);
        const first = delta.dot(xAxis);
        const second = delta.dot(yAxis);
        return Number.isFinite(first) && Number.isFinite(second)
          ? frozenPoint(first, second)
          : undefined;
      } catch {
        return undefined;
      }
    },

    planeToScreen(point) {
      if (!finiteTuple2(point)) return undefined;
      try {
        if (!updateCameraMatrices()) return undefined;
        worldPoint
          .copy(origin)
          .addScaledVector(xAxis, point[0])
          .addScaledVector(yAxis, point[1]);
        if (!finiteVector(worldPoint)) return undefined;
        viewPoint
          .copy(worldPoint)
          .applyMatrix4(input.camera.matrixWorldInverse);
        if (!finiteVector(viewPoint) || viewPoint.z >= 0) return undefined;
        projectedPoint.copy(worldPoint).project(input.camera);
        if (!finiteVector(projectedPoint)) return undefined;
        const clientX =
          viewportSnapshot.left +
          ((projectedPoint.x + 1) / 2) * viewportSnapshot.width;
        const clientY =
          viewportSnapshot.top +
          ((1 - projectedPoint.y) / 2) * viewportSnapshot.height;
        return Number.isFinite(clientX) && Number.isFinite(clientY)
          ? Object.freeze([clientX, clientY] as [number, number])
          : undefined;
      } catch {
        return undefined;
      }
    },

    planeToNormalized(point) {
      if (!finiteTuple2(point)) return undefined;
      const normalizedX = clamp(0.5 + point[0] / input.width, 0, 1);
      const normalizedY = clamp(0.5 + point[1] / input.height, 0, 1);
      return Number.isFinite(normalizedX) && Number.isFinite(normalizedY)
        ? Object.freeze([normalizedX, normalizedY] as [number, number])
        : undefined;
    },
  };
  return Object.freeze(projection);
}
