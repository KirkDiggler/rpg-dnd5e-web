import { sphericalCameraPosition } from '@/author/preview3d/playCameraRig';
import { describe, expect, it } from 'vitest';
import { rotateAboutPivot, type Vec3Like } from './orbitPivot';

function sub(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a: Vec3Like, b: Vec3Like): Vec3Like {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function normalize(v: Vec3Like): Vec3Like {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Camera-space (right, up, -forward) coordinates of `point`, for a camera
 * at `cameraPosition` doing `camera.lookAt(lookAtTarget)` with world-up
 * (0,1,0) — the exact basis Three.js's own `lookAt` builds. Camera-space
 * coordinates determine screen projection for BOTH perspective and
 * orthographic cameras, so agreement here across a rotation is a faithful
 * proxy for "the point never left its screen pixel".
 */
function cameraSpace(
  point: Vec3Like,
  cameraPosition: Vec3Like,
  lookAtTarget: Vec3Like
): Vec3Like {
  const forward = normalize(sub(lookAtTarget, cameraPosition));
  const worldUp = { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, worldUp));
  const up = cross(right, forward);
  const relative = sub(point, cameraPosition);
  return {
    x: dot(relative, right),
    y: dot(relative, up),
    z: dot(relative, forward),
  };
}

describe('rotateAboutPivot', () => {
  it('is a no-op at deltaTheta = 0', () => {
    const target = { x: 5, y: 0, z: -3 };
    const pivot = { x: 1, y: 0, z: 1 };
    expect(rotateAboutPivot(target, pivot, 0)).toEqual(target);
  });

  it('leaves the pivot itself unchanged when it IS the target', () => {
    const pivot = { x: 4, y: 0, z: 2 };
    expect(rotateAboutPivot(pivot, pivot, 0.7)).toEqual(pivot);
  });

  it('rotates target around pivot by exactly deltaTheta, preserving distance', () => {
    const target = { x: 10, y: 0, z: 0 };
    const pivot = { x: 0, y: 0, z: 0 };
    const rotated = rotateAboutPivot(target, pivot, Math.PI / 2);
    expect(Math.hypot(rotated.x - pivot.x, rotated.z - pivot.z)).toBeCloseTo(
      10
    );
    // Matches useCameraControls.ts's own azimuth offset convention — see
    // this module's doc comment.
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.z).toBeCloseTo(10);
  });

  it("keeps the pivot's screen projection fixed under the real camera math, across many rotation steps", () => {
    const pivot = { x: 3, y: 0, z: -2 }; // the mini's raw world position
    let target = { x: 8, y: 0, z: 5 }; // orbit target, panned away from the mini
    let azimuth = Math.PI / 4;
    const polar = Math.PI / 3.5; // HexGrid.tsx's own tactical polar angle
    const distance = 20; // useCameraControls.ts's own starting distance

    const initialCamera = sphericalCameraPosition(
      target,
      polar,
      azimuth,
      distance
    );
    const initialProjection = cameraSpace(pivot, initialCamera, target);

    for (const deltaTheta of [0.3, -0.5, 1.1, 0.02, -2.4, 3.0]) {
      target = rotateAboutPivot(target, pivot, deltaTheta);
      azimuth += deltaTheta;
      const camera = sphericalCameraPosition(target, polar, azimuth, distance);
      const projection = cameraSpace(pivot, camera, target);
      expect(projection.x).toBeCloseTo(initialProjection.x, 6);
      expect(projection.y).toBeCloseTo(initialProjection.y, 6);
      expect(projection.z).toBeCloseTo(initialProjection.z, 6);
    }
  });

  it('orbitPivot=view is exactly today: rotating with pivot=target moves nothing', () => {
    // The default/off case — this is what call sites do when orbitPivot is
    // 'view' (they simply do not call rotateAboutPivot at all), spelled out
    // here as the degenerate case of the same function for documentation.
    const target = { x: 6, y: 0, z: -9 };
    expect(rotateAboutPivot(target, target, 1.4)).toEqual(target);
  });
});
