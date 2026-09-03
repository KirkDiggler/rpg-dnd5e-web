import { describe, expect, it } from 'vitest';
import {
  azimuthForwardRight,
  clampZoomStep,
  dragRotateStep,
  followLerp,
  INITIAL_AZIMUTH,
  INITIAL_DISTANCE,
  MAX_ZOOM,
  MIN_ZOOM,
  ORTHO_FAR,
  ORTHO_NEAR,
  ORTHO_ZOOM,
  POLAR_ANGLE,
  ROTATE_SPEED,
  sphericalCameraPosition,
} from './playCameraRig';

// Every constant is a direct citation of the real game's own camera code
// (HexGrid.tsx / useCameraControls.ts) — these tests pin the LITERAL
// values so a future edit to either file surfaces as a failing test
// here too, not just a silent drift.
describe('camera-rig constants match the real game (HexGrid.tsx / useCameraControls.ts)', () => {
  it("polarAngle: PI/3.5 — HexGrid.tsx's own call-site tactical angle", () => {
    expect(POLAR_ANGLE).toBeCloseTo(Math.PI / 3.5);
  });
  it("azimuth/distance start at useCameraControls.ts's own internal defaults", () => {
    expect(INITIAL_AZIMUTH).toBeCloseTo(Math.PI / 4);
    expect(INITIAL_DISTANCE).toBe(20);
  });
  it('rotateSpeed is a preserved pre-#906 per-frame snapshot; minZoom/maxZoom match cameraDials.ts', () => {
    // ROTATE_SPEED: HexGrid.tsx's own literal call-site value before #906
    // replaced it with a shared, time-based `rotateSpeed` dial — kept as-is
    // here since PlayCamera.tsx's per-frame usage would need to change WITH
    // it (see playCameraRig.ts's own doc comment on ROTATE_SPEED).
    expect(ROTATE_SPEED).toBe(0.02);
    // MIN_ZOOM/MAX_ZOOM: cameraDials.ts's own DEFAULT_ZOOM_MIN/MAX, not a
    // HexGrid.tsx call-site literal any more — #906 corrected these from a
    // stale 30/150.
    expect(MIN_ZOOM).toBe(35);
    expect(MAX_ZOOM).toBe(140);
  });
  it("orthographic projection matches HexGrid.tsx's own <Canvas> props", () => {
    expect(ORTHO_ZOOM).toBe(80);
    expect(ORTHO_NEAR).toBe(0.1);
    expect(ORTHO_FAR).toBe(1000);
  });
});

describe('sphericalCameraPosition', () => {
  it('at azimuth 0, polarAngle PI/2 (level with target): camera sits directly on +X, same Y as target', () => {
    const pos = sphericalCameraPosition(
      { x: 5, y: 1, z: 5 },
      Math.PI / 2,
      0,
      10
    );
    expect(pos.x).toBeCloseTo(15);
    expect(pos.y).toBeCloseTo(1); // cos(PI/2) ~ 0
    expect(pos.z).toBeCloseTo(5);
  });

  it('at polarAngle 0 (looking straight down): camera sits directly above the target, XZ unchanged', () => {
    const pos = sphericalCameraPosition({ x: 2, y: 0, z: 3 }, 0, 1.234, 7);
    expect(pos.x).toBeCloseTo(2);
    expect(pos.z).toBeCloseTo(3);
    expect(pos.y).toBeCloseTo(7); // cos(0) = 1
  });

  it('distance 0 collapses the camera onto the target regardless of angle', () => {
    const pos = sphericalCameraPosition(
      { x: 4, y: 2, z: -1 },
      POLAR_ANGLE,
      1.9,
      0
    );
    expect(pos).toEqual({ x: 4, y: 2, z: -1 });
  });

  it("at the real rig's own POLAR_ANGLE/INITIAL_AZIMUTH/INITIAL_DISTANCE, the offset from target has the expected magnitude", () => {
    const target = { x: 0, y: 0, z: 0 };
    const pos = sphericalCameraPosition(
      target,
      POLAR_ANGLE,
      INITIAL_AZIMUTH,
      INITIAL_DISTANCE
    );
    // The full 3D distance from target to camera must equal INITIAL_DISTANCE
    // exactly (spherical coordinates preserve radius by construction).
    const dist = Math.hypot(pos.x, pos.y, pos.z);
    expect(dist).toBeCloseTo(INITIAL_DISTANCE);
    // A "lower tactical angle" (PI/3.5 ~ 51.4 degrees from vertical) means
    // more Y than a 45-degree angle would give, but less than a fully
    // overhead one — sanity-check it sits strictly between level (Y=0)
    // and directly-overhead (Y=distance).
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.y).toBeLessThan(INITIAL_DISTANCE);
  });
});

describe('followLerp', () => {
  it('a tiny delta barely moves current toward goal', () => {
    const result = followLerp({ x: 0, z: 0 }, { x: 10, z: 0 }, 0.001);
    expect(result.x).toBeGreaterThan(0);
    expect(result.x).toBeLessThan(1);
  });

  it('a large delta converges close to the goal (exponential smoothing, not overshoot)', () => {
    const result = followLerp({ x: 0, z: 0 }, { x: 10, z: 10 }, 2);
    expect(result.x).toBeCloseTo(10, 0);
    expect(result.z).toBeCloseTo(10, 0);
  });

  it('already at the goal stays there', () => {
    const result = followLerp({ x: 5, z: 5 }, { x: 5, z: 5 }, 0.5);
    expect(result).toEqual({ x: 5, z: 5 });
  });

  it('is framerate-independent: two half-steps converge to about the same place as one full step', () => {
    const goal = { x: 20, z: 0 };
    const twoHalfSteps = followLerp(
      followLerp({ x: 0, z: 0 }, goal, 0.05),
      goal,
      0.05
    );
    const oneFullStep = followLerp({ x: 0, z: 0 }, goal, 0.1);
    expect(twoHalfSteps.x).toBeCloseTo(oneFullStep.x, 2);
  });
});

describe('azimuthForwardRight', () => {
  it("azimuth 0: forward points toward -X, right toward -Z (matches the spherical formula's own convention)", () => {
    const { forward, right } = azimuthForwardRight(0);
    expect(forward.x).toBeCloseTo(-1);
    expect(forward.z).toBeCloseTo(0);
    expect(right.x).toBeCloseTo(0);
    expect(right.z).toBeCloseTo(-1);
  });

  it('forward and right are always unit-length and perpendicular', () => {
    for (const az of [0, 0.7, Math.PI / 3, Math.PI, -1.4]) {
      const { forward, right } = azimuthForwardRight(az);
      expect(Math.hypot(forward.x, forward.z)).toBeCloseTo(1);
      expect(Math.hypot(right.x, right.z)).toBeCloseTo(1);
      expect(forward.x * right.x + forward.z * right.z).toBeCloseTo(0);
    }
  });
});

describe('clampZoomStep', () => {
  it('positive deltaY (scroll down/away) zooms out (decreases zoom)', () => {
    expect(clampZoomStep(80, 50)).toBeLessThan(80);
  });
  it('negative deltaY (scroll up/toward) zooms in (increases zoom)', () => {
    expect(clampZoomStep(80, -50)).toBeGreaterThan(80);
  });
  it('clamps to minZoom/maxZoom — cameraDials.ts DEFAULT_ZOOM_MIN/MAX', () => {
    expect(clampZoomStep(MIN_ZOOM, 1000)).toBe(MIN_ZOOM);
    expect(clampZoomStep(MAX_ZOOM, -1000)).toBe(MAX_ZOOM);
  });
});

describe('dragRotateStep', () => {
  // STALE, preserved for PlayCamera.tsx's own preview walkthrough — this no
  // longer describes the real game's right-drag (which now pans, per
  // useCameraControls.ts's own header doc comment) or its middle-drag
  // rotate (#906, cameraDials.ts's own `dragRotate`, a different
  // sensitivity). See dragRotateStep's own doc comment in playCameraRig.ts.
  it('a positive clientX delta (dragging right) rotates azimuth negative', () => {
    expect(dragRotateStep(1, 50)).toBeLessThan(1);
  });
  it('a negative clientX delta (dragging left) rotates azimuth positive', () => {
    expect(dragRotateStep(1, -50)).toBeGreaterThan(1);
  });
  it('matches this preserved 0.01 sensitivity exactly', () => {
    expect(dragRotateStep(0, 100)).toBeCloseTo(-1);
  });
});
