import type { Camera, PerspectiveCamera } from 'three';
import type { AttackDieVisualConfig } from './attackDieVisualConfig';
export function applyAttackDieCamera(
  camera: Camera,
  view: 'top' | 'three-quarter',
  visual: AttackDieVisualConfig
) {
  const selected =
    view === 'top' ? visual.topCamera : visual.threeQuarterCamera;
  const perspective = camera as PerspectiveCamera;
  if (!perspective.isPerspectiveCamera)
    throw Error('attack die camera must be perspective');
  perspective.fov = selected.fov;
  perspective.near = selected.near;
  perspective.far = selected.far;
  perspective.position.set(
    selected.position[0],
    selected.position[1],
    selected.position[2]
  );
  perspective.up.set(selected.up[0], selected.up[1], selected.up[2]);
  perspective.lookAt(
    selected.target[0],
    selected.target[1],
    selected.target[2]
  );
  perspective.updateProjectionMatrix();
}
