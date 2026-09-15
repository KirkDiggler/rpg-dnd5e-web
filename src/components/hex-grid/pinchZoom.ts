import * as THREE from 'three';
import type { ScreenPinchDelta, ScreenPoint } from './touchPan';

interface Viewport {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface GroundPinchInput extends ScreenPinchDelta {
  camera: THREE.OrthographicCamera;
  target: THREE.Vector3;
  viewport: Viewport;
  minZoom: number;
  maxZoom: number;
}

function groundPoint(
  camera: THREE.OrthographicCamera,
  viewport: Viewport,
  point: ScreenPoint,
  height: number
): THREE.Vector3 | null {
  const ray = new THREE.Raycaster();
  camera.updateMatrixWorld();
  ray.setFromCamera(
    new THREE.Vector2(
      ((point.x - viewport.left) / viewport.width) * 2 - 1,
      1 - ((point.y - viewport.top) / viewport.height) * 2
    ),
    camera
  );
  if (Math.abs(ray.ray.direction.y) < 1e-6) return null;
  return ray.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -height),
    new THREE.Vector3()
  );
}

/**
 * Continuous orthographic zoom, with no pitch/heading changes. Translate camera
 * and orbit target together so the ground under the previous midpoint remains
 * under the new midpoint, including when zoom hits a limit. No board/rules data.
 */
export function zoomAboutGroundPoint({
  camera,
  target,
  viewport,
  scale,
  from,
  to,
  minZoom,
  maxZoom,
}: GroundPinchInput): boolean {
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    !Number.isFinite(minZoom) ||
    !Number.isFinite(maxZoom) ||
    minZoom <= 0 ||
    maxZoom < minZoom ||
    ![from.x, from.y, to.x, to.y].every(Number.isFinite)
  )
    return false;
  const before = groundPoint(camera, viewport, from, target.y);
  if (!before) return false;
  const oldZoom = camera.zoom;
  camera.zoom = THREE.MathUtils.clamp(oldZoom * scale, minZoom, maxZoom);
  camera.updateProjectionMatrix();
  const after = groundPoint(camera, viewport, to, target.y);
  if (!after) {
    camera.zoom = oldZoom;
    camera.updateProjectionMatrix();
    return false;
  }
  const offset = before.sub(after);
  offset.y = 0;
  target.add(offset);
  camera.position.add(offset);
  camera.updateMatrixWorld();
  return true;
}
