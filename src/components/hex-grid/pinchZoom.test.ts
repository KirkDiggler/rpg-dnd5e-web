import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { zoomAboutGroundPoint } from './pinchZoom';

const viewport = { left: 120, top: 80, width: 800, height: 600 };
function setup() {
  const camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
  camera.zoom = 80;
  camera.position.set(12, 16, 18);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return {
    camera,
    target: new THREE.Vector3(),
    minZoom: 35,
    maxZoom: 140,
    viewport,
  };
}
function pixel(camera: THREE.Camera, point: THREE.Vector3) {
  const ndc = point.clone().project(camera);
  return {
    x: viewport.left + ((ndc.x + 1) * viewport.width) / 2,
    y: viewport.top + ((1 - ndc.y) * viewport.height) / 2,
  };
}

describe('pinch zoom ground anchoring', () => {
  it('keeps the midpoint anchored when the caller changes the camera angle during zoom', () => {
    const input = setup();
    const anchor = new THREE.Vector3(3, 0, -1);
    const from = pixel(input.camera, anchor);
    const to = { x: from.x + 20, y: from.y - 10 };
    const updateView = () => {
      input.camera.position.set(16, 8, 24);
      input.camera.lookAt(input.target);
    };
    expect(
      zoomAboutGroundPoint({ ...input, scale: 1.3, from, to, updateView })
    ).toBe(true);
    expect(input.camera.position.y).toBe(8);
    expect(pixel(input.camera, anchor).x).toBeCloseTo(to.x, 8);
    expect(pixel(input.camera, anchor).y).toBeCloseTo(to.y, 8);
  });

  it('restores the original pose if the requested angle has no ground intersection', () => {
    const input = setup();
    const before = input.camera.position.clone();
    const rotation = input.camera.quaternion.clone();
    const at = pixel(input.camera, new THREE.Vector3());
    expect(
      zoomAboutGroundPoint({
        ...input,
        scale: 1.3,
        from: at,
        to: at,
        updateView: () => {
          input.camera.position.set(0, 2, 10);
          input.camera.lookAt(0, 2, 0);
        },
      })
    ).toBe(false);
    expect(input.camera.zoom).toBe(80);
    expect(input.camera.position.equals(before)).toBe(true);
    expect(input.camera.quaternion.equals(rotation)).toBe(true);
    expect(input.target.length()).toBe(0);
  });
  it('zooms continuously with unchanged tilt and follows a moving midpoint', () => {
    const input = setup();
    const anchor = new THREE.Vector3(3, 0, -1);
    const from = pixel(input.camera, anchor);
    const to = { x: from.x + 30, y: from.y - 20 };
    const rotation = input.camera.quaternion.clone();
    expect(zoomAboutGroundPoint({ ...input, scale: 1.3, from, to })).toBe(true);
    expect(input.camera.zoom).toBeCloseTo(104);
    expect(input.camera.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    expect(pixel(input.camera, anchor).x).toBeCloseTo(to.x, 8);
    expect(pixel(input.camera, anchor).y).toBeCloseTo(to.y, 8);
    expect(input.target.y).toBe(0);
  });

  it('clamps both limits without losing the midpoint anchor', () => {
    const input = setup();
    const anchor = new THREE.Vector3(-2, 0, 1);
    const from = pixel(input.camera, anchor);
    for (const [scale, zoom] of [
      [100, 140],
      [0.0001, 35],
    ]) {
      expect(
        zoomAboutGroundPoint({ ...input, scale: scale!, from, to: from })
      ).toBe(true);
      expect(input.camera.zoom).toBe(zoom);
      expect(pixel(input.camera, anchor).x).toBeCloseTo(from.x, 8);
      expect(pixel(input.camera, anchor).y).toBeCloseTo(from.y, 8);
    }
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses invalid scale %s without changing the camera',
    (scale) => {
      const input = setup();
      const before = input.camera.position.clone();
      expect(
        zoomAboutGroundPoint({
          ...input,
          scale,
          from: { x: 400, y: 300 },
          to: { x: 400, y: 300 },
        })
      ).toBe(false);
      expect(input.camera.zoom).toBe(80);
      expect(input.camera.position.equals(before)).toBe(true);
      expect(input.target.length()).toBe(0);
    }
  );
});
