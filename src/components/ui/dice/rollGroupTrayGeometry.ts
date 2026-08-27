import type { Camera, PerspectiveCamera } from 'three';

export const ROLL_GROUP_HELD_PLANE_WIDTH = 0.72;
export const ROLL_GROUP_HELD_PLANE_HEIGHT = 0.52;

export const ROLL_GROUP_TRAY_CAMERA = Object.freeze({
  fov: 35,
  near: 0.1,
  far: 100,
  position: Object.freeze([0, 3, 0] as const),
  up: Object.freeze([0, 0, -1] as const),
  target: Object.freeze([0, 0, 0] as const),
});

export function configureRollGroupTrayCamera(camera: Camera): void {
  const perspective = camera as PerspectiveCamera;
  if (!perspective.isPerspectiveCamera)
    throw Error('roll group tray camera must be perspective');
  perspective.fov = ROLL_GROUP_TRAY_CAMERA.fov;
  perspective.near = ROLL_GROUP_TRAY_CAMERA.near;
  perspective.far = ROLL_GROUP_TRAY_CAMERA.far;
  perspective.position.set(...ROLL_GROUP_TRAY_CAMERA.position);
  perspective.up.set(...ROLL_GROUP_TRAY_CAMERA.up);
  perspective.lookAt(...ROLL_GROUP_TRAY_CAMERA.target);
  perspective.updateProjectionMatrix();
  perspective.updateMatrixWorld(true);
}
