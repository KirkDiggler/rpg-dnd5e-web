import {
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Group,
  type Object3D,
} from 'three';
import type { ClientBounds } from './rollGroupGestureController';

export interface RuntimeDiceSurfaceGrab {
  readonly object: Object3D;
  readonly localPoint: readonly [number, number, number];
  readonly runtimeCloneId?: number;
}

export interface RuntimeDiceSurfaceHandle {
  readonly captureSurface: (input: {
    readonly clientX: number;
    readonly clientY: number;
    readonly camera: Camera;
    readonly viewport: ClientBounds;
  }) => RuntimeDiceSurfaceGrab | undefined;
  readonly projectSurface: (input: {
    readonly grab: RuntimeDiceSurfaceGrab;
    readonly camera: Camera;
    readonly viewport: ClientBounds;
  }) => readonly [number, number] | undefined;
}

function finiteBounds(bounds: ClientBounds) {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function finiteVector(point: Vector3) {
  return [point.x, point.y, point.z].every(Number.isFinite);
}

export function createRuntimeDiceSurfaceHandle(
  root: Group,
  runtimeCloneId?: number
): RuntimeDiceSurfaceHandle {
  const handle: RuntimeDiceSurfaceHandle = {
    captureSurface({ clientX, clientY, camera, viewport }) {
      if (
        !Number.isFinite(clientX) ||
        !Number.isFinite(clientY) ||
        !finiteBounds(viewport)
      )
        return undefined;
      try {
        root.updateWorldMatrix(true, true);
        camera.updateMatrixWorld(true);
        const pointer = new Vector2(
          ((clientX - viewport.left) / viewport.width) * 2 - 1,
          1 - ((clientY - viewport.top) / viewport.height) * 2
        );
        const raycaster = new Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const intersection = raycaster.intersectObject(root, true)[0];
        if (!intersection || !finiteVector(intersection.point))
          return undefined;
        const localPoint = intersection.object.worldToLocal(
          intersection.point.clone()
        );
        if (!finiteVector(localPoint)) return undefined;
        return Object.freeze({
          object: intersection.object,
          localPoint: Object.freeze(
            localPoint.toArray() as [number, number, number]
          ),
          runtimeCloneId,
        });
      } catch {
        return undefined;
      }
    },
    projectSurface({ grab, camera, viewport }) {
      if (!finiteBounds(viewport)) return undefined;
      try {
        grab.object.updateWorldMatrix(true, false);
        camera.updateMatrixWorld(true);
        const worldPoint = grab.object.localToWorld(
          new Vector3(...grab.localPoint)
        );
        if (!finiteVector(worldPoint)) return undefined;
        const viewPoint = worldPoint
          .clone()
          .applyMatrix4(camera.matrixWorldInverse);
        if (!finiteVector(viewPoint) || viewPoint.z >= 0) return undefined;
        const projected = worldPoint.project(camera);
        if (!finiteVector(projected)) return undefined;
        const clientX =
          viewport.left + ((projected.x + 1) / 2) * viewport.width;
        const clientY =
          viewport.top + ((1 - projected.y) / 2) * viewport.height;
        return Number.isFinite(clientX) && Number.isFinite(clientY)
          ? Object.freeze([clientX, clientY] as const)
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
  return Object.freeze(handle);
}
