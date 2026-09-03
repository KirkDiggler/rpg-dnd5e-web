/**
 * Orbit pivot — where the camera's Q/E and middle-drag azimuth rotation
 * actually pivots (`?orbitPivot=`, cameraDials.ts). Kirk, 2026-09-03:
 * "Rotation pivots on the player's own mini, so the mini holds its screen
 * position and the board turns around it." Pure, testable module — no
 * Three.js/R3F import, same "pure derivation, component just applies it"
 * split `playCameraRig.ts` already uses — so the geometry can be checked
 * against the real camera math in a projection test without a WebGL
 * context.
 *
 * # The math
 *
 * `useCameraControls.ts`'s `updateCamera()` places the camera at a fixed
 * spherical offset from `target` (distance/polar fixed, only azimuth
 * varies) and always looks AT `target`. Rotating azimuth alone therefore
 * always pivots on `target` itself — the default `orbitPivot=view`
 * behavior, unchanged, since `target` is the camera's own look-at point and
 * trivially never leaves screen center.
 *
 * To pivot on a DIFFERENT fixed world point `pivot` instead (the mini's
 * position), `target` itself has to be carried through the SAME rotation as
 * azimuth: `target' = pivot + RotateY(target - pivot, deltaTheta)`. That
 * rigidly rotates the whole camera rig — both the eye position (a fixed
 * spherical offset from `target`) and the look-at point — around the
 * vertical axis through `pivot`. A point ON that rotation axis (`pivot`
 * itself, since it does not move) keeps an unchanged position relative to
 * the whole rig, so its screen projection is invariant. See
 * `orbitPivot.test.ts`'s own projection test, which checks this against
 * `playCameraRig.ts`'s real, cited `sphericalCameraPosition`.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Rotate `target` around the vertical (Y) axis passing through `pivot`, by
 * `deltaTheta` radians — the SAME signed convention `useCameraControls.ts`
 * uses for azimuth (`azimuth += step` on Q, `azimuth -= step` on E: this
 * function rotates `target` toward `azimuth + deltaTheta`'s own direction),
 * so a caller applies this and the matching azimuth delta with the
 * identical signed value. `y` passes through unchanged — the pivot is
 * vertical, and both `target` and the mini's world position are
 * flattened to y=0 by their own callers (HexGrid.tsx/SessionCanvas.tsx).
 */
export function rotateAboutPivot(
  target: Vec3Like,
  pivot: Vec3Like,
  deltaTheta: number
): Vec3Like {
  const dx = target.x - pivot.x;
  const dz = target.z - pivot.z;
  const cos = Math.cos(deltaTheta);
  const sin = Math.sin(deltaTheta);
  return {
    x: pivot.x + dx * cos - dz * sin,
    y: target.y,
    z: pivot.z + dx * sin + dz * cos,
  };
}
