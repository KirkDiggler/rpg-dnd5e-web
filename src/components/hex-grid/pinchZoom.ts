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
  /** Recompute camera pose (not target) for the new zoom, before anchoring it. */
  updateView?: () => void;
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
 * Continuous orthographic zoom. An optional caller-owned pose update can blend
 * pitch/focus lead; anchoring spans both zoom AND that pose change. Translate
 * camera and target together so the ground remains beneath the fingers.
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
  updateView,
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
  const oldPosition = camera.position.clone();
  const oldRotation = camera.quaternion.clone();
  camera.zoom = THREE.MathUtils.clamp(oldZoom * scale, minZoom, maxZoom);
  camera.updateProjectionMatrix();
  updateView?.();
  const after = groundPoint(camera, viewport, to, target.y);
  if (!after) {
    camera.zoom = oldZoom;
    camera.position.copy(oldPosition);
    camera.quaternion.copy(oldRotation);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return false;
  }
  const offset = before.sub(after);
  offset.y = 0;
  target.add(offset);
  camera.position.add(offset);
  camera.updateMatrixWorld();
  return true;
}
