/**
 * playCameraRig — the pure, testable half of `PlayCamera.tsx` (the
 * author-walkthrough's tactical camera mode, rpg-project#169 follow-up
 * unit: Kirk played the literal Walk mode live and asked for the real
 * game's own camera instead — "walk is pretty literal. that is not the
 * view we have when playing... really cool though"). No Three.js/R3F
 * import — plain numbers in, plain numbers out — so the spherical
 * offset/angle math and the follow/zoom derivations can be unit-tested
 * directly, the same "pure derivation, component just applies it" split
 * this concept's other 3D modules already use.
 *
 * **Every constant and formula below is lifted from the real game's own
 * camera code, cited, not re-derived** — see `PlayCamera.tsx`'s own
 * header doc comment for the full citation writeup (which file/line each
 * value came from and why). This module only re-states them as pure,
 * named functions so they're independently checkable.
 */

/** `HexGrid.tsx`'s own call-site value — "slightly lower tactical angle"
 * than `useCameraControls.ts`'s own `PI/4` default. */
export const POLAR_ANGLE = Math.PI / 3.5;
/** `useCameraControls.ts`'s own internal starting values — `HexGrid.tsx`
 * never overrides either (the hook doesn't even accept a `distance`
 * prop). */
export const INITIAL_AZIMUTH = Math.PI / 4;
export const INITIAL_DISTANCE = 20;
/** `HexGrid.tsx`'s own call-site values, passed to `useCameraControls`. */
export const ROTATE_SPEED = 0.02;
export const MIN_ZOOM = 30;
export const MAX_ZOOM = 150;
/** `HexGrid.tsx`'s own `<Canvas orthographic camera={{...}}>` values —
 * "Lower isometric angle similar to Stolen Realm" per that file's own
 * comment. */
export const ORTHO_ZOOM = 80;
export const ORTHO_NEAR = 0.1;
export const ORTHO_FAR = 1000;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The camera's world position for a given orbit target/angle/azimuth/
 * distance — `useCameraControls.ts`'s own `updateCamera` formula,
 * verbatim: `x = target.x + distance·sin(polarAngle)·cos(azimuth)`,
 * `y = target.y + distance·cos(polarAngle)`, `z = target.z +
 * distance·sin(polarAngle)·sin(azimuth)`. The caller still owns
 * `camera.lookAt(target)` — a pure function has no camera to call it on.
 */
export function sphericalCameraPosition(
  target: Vec3,
  polarAngle: number,
  azimuth: number,
  distance: number
): Vec3 {
  return {
    x: target.x + distance * Math.sin(polarAngle) * Math.cos(azimuth),
    y: target.y + distance * Math.cos(polarAngle),
    z: target.z + distance * Math.sin(polarAngle) * Math.sin(azimuth),
  };
}

/**
 * One frame's exponential-smoothing step of `current` toward `goal` —
 * `useCameraControls.ts`'s own `focusTarget` follow-lerp:
 * `factor = 1 - Math.pow(0.001, delta)`, `target.lerp(goal, factor)`.
 * Framerate-independent by construction (a `THREE.Vector3.lerp`-style
 * factor derived from `delta`, not a fixed per-frame constant) — a
 * dropped frame (`delta` doubles) still converges at the same real-time
 * rate, just via one bigger step instead of two smaller ones.
 */
export function followLerp(
  current: { x: number; z: number },
  goal: { x: number; z: number },
  delta: number
): { x: number; z: number } {
  const factor = 1 - Math.pow(0.001, delta);
  return {
    x: current.x + (goal.x - current.x) * factor,
    z: current.z + (goal.z - current.z) * factor,
  };
}

/**
 * Camera-relative forward/right unit-ish vectors for a given azimuth —
 * "forward" is the direction FROM the camera TOWARD its orbit target
 * (derived by negating `sphericalCameraPosition`'s own XZ offset
 * direction, since the camera always looks straight at that target);
 * "right" is that vector rotated -90° in the XZ plane, the same
 * `(-fz, fx)` cross-product convention `WalkCamera.tsx` already uses for
 * its own (first-person) forward/right pair — one shared convention for
 * both walking camera modes, not two independently-invented ones.
 */
export function azimuthForwardRight(azimuth: number): {
  forward: { x: number; z: number };
  right: { x: number; z: number };
} {
  const forward = { x: -Math.cos(azimuth), z: -Math.sin(azimuth) };
  return { forward, right: { x: -forward.z, z: forward.x } };
}

/**
 * Scroll-wheel zoom step for an ORTHOGRAPHIC camera —
 * `useCameraControls.ts`'s own wheel handler, orthographic branch:
 * `zoom = clamp(zoom - deltaY * 0.1, minZoom, maxZoom)`. The perspective
 * branch (adjusting `distance` instead) does not apply here — this rig
 * IS orthographic (see `ORTHO_ZOOM` above), matching the real game.
 */
export function clampZoomStep(
  currentZoom: number,
  wheelDeltaY: number,
  minZoom: number = MIN_ZOOM,
  maxZoom: number = MAX_ZOOM
): number {
  return Math.max(minZoom, Math.min(maxZoom, currentZoom - wheelDeltaY * 0.1));
}

/**
 * Right-click-drag rotate step — `useCameraControls.ts`'s own
 * `handleMouseMove` while `isRightDown`: `azimuth -= deltaX * 0.01`.
 */
export function dragRotateStep(
  currentAzimuth: number,
  clientXDelta: number
): number {
  return currentAzimuth - clientXDelta * 0.01;
}
