import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeFloorPoolColor,
  CRYPT_DARK_FLOOR_TINT,
  cryptFloorBaseColor,
  MAX_FLOOR_POOL_BLEND,
  type FloorPoolLight,
} from './syntyHexFloorHelpers';

const BASE = new THREE.Color(0.35, 0.38, 0.46);

describe('cryptFloorBaseColor', () => {
  it('lerps from the dark regional floor to the current crypt tint', () => {
    expect(cryptFloorBaseColor(0).getHexString()).toBe('101318');
    expect(isCloseTo(cryptFloorBaseColor(1), BASE)).toBe(true);
    const half = cryptFloorBaseColor(0.5);
    expect(half.r).toBeGreaterThan(CRYPT_DARK_FLOOR_TINT.r);
    expect(half.r).toBeLessThan(BASE.r);
  });

  it('clamps exposure without mutating the shared dark tint', () => {
    expect(cryptFloorBaseColor(-1).getHexString()).toBe('101318');
    expect(isCloseTo(cryptFloorBaseColor(2), BASE)).toBe(true);
  });
});

function isCloseTo(a: THREE.Color, b: THREE.Color, eps = 1e-6): boolean {
  return (
    Math.abs(a.r - b.r) < eps &&
    Math.abs(a.g - b.g) < eps &&
    Math.abs(a.b - b.b) < eps
  );
}

describe('computeFloorPoolColor', () => {
  it('returns base unchanged when no lights are given', () => {
    const result = computeFloorPoolColor(BASE, 0, 0, []);
    expect(isCloseTo(result, BASE)).toBe(true);
  });

  it('returns base unchanged when every light is out of range', () => {
    const lights: FloorPoolLight[] = [
      { position: [100, 1.2, 100], color: '#ff9d52', distance: 5.5 },
    ];
    const result = computeFloorPoolColor(BASE, 0, 0, lights);
    expect(isCloseTo(result, BASE)).toBe(true);
  });

  it('ignores a light with a non-positive distance instead of dividing by zero', () => {
    const lights: FloorPoolLight[] = [
      { position: [0, 1.2, 0], color: '#ff9d52', distance: 0 },
    ];
    const result = computeFloorPoolColor(BASE, 0, 0, lights);
    expect(isCloseTo(result, BASE)).toBe(true);
  });

  it('blends toward the light color at full weight when the tile sits exactly under the light, capped at MAX_FLOOR_POOL_BLEND', () => {
    const lights: FloorPoolLight[] = [
      { position: [0, 1.2, 0], color: '#ff9d52', distance: 5.5 },
    ];
    const result = computeFloorPoolColor(BASE, 0, 0, lights);
    const expected = BASE.clone().lerp(
      new THREE.Color('#ff9d52'),
      MAX_FLOOR_POOL_BLEND
    );
    expect(isCloseTo(result, expected)).toBe(true);
  });

  it("falls off with distance and reaches zero at the light's own distance", () => {
    const lights: FloorPoolLight[] = [
      { position: [0, 1.2, 0], color: '#ff9d52', distance: 4 },
    ];
    const near = computeFloorPoolColor(BASE, 1, 0, lights);
    const far = computeFloorPoolColor(BASE, 3, 0, lights);
    const atEdge = computeFloorPoolColor(BASE, 4, 0, lights);

    // Nearer tile should blend more strongly toward the light color than
    // a farther one (quadratic falloff, monotonic in distance).
    const dist = (c: THREE.Color) =>
      Math.abs(c.r - BASE.r) + Math.abs(c.g - BASE.g) + Math.abs(c.b - BASE.b);
    expect(dist(near)).toBeGreaterThan(dist(far));
    // At exactly the light's own `distance`, the tile is outside range
    // (strict `<` in the implementation) — no blend at all.
    expect(isCloseTo(atEdge, BASE)).toBe(true);
  });

  it('weights a nearer/stronger light more than a farther overlapping one of a different color', () => {
    const lights: FloorPoolLight[] = [
      { position: [0, 1.2, 0], color: '#ff9d52', distance: 5.5 }, // brazier, close
      { position: [3, 1.2, 0], color: '#3ddc84', distance: 4.5 }, // candle, farther
    ];
    const result = computeFloorPoolColor(BASE, 0, 0, lights);
    const warm = new THREE.Color('#ff9d52');
    const green = new THREE.Color('#3ddc84');
    const distTo = (c: THREE.Color, t: THREE.Color) =>
      Math.abs(c.r - t.r) + Math.abs(c.g - t.g) + Math.abs(c.b - t.b);
    expect(distTo(result, warm)).toBeLessThan(distTo(result, green));
  });

  it('applies floorPoolStrength to the quadratic weight', () => {
    const fullStrength: FloorPoolLight[] = [
      {
        position: [0, 1.2, 0],
        color: '#ff9d52',
        distance: 5.5,
        floorPoolStrength: 1,
      },
    ];
    const halfStrength: FloorPoolLight[] = [
      { ...fullStrength[0], floorPoolStrength: 0.5 },
    ];
    const movement = (color: THREE.Color) =>
      Math.abs(color.r - BASE.r) +
      Math.abs(color.g - BASE.g) +
      Math.abs(color.b - BASE.b);

    expect(
      movement(computeFloorPoolColor(BASE, 0, 0, halfStrength))
    ).toBeLessThan(movement(computeFloorPoolColor(BASE, 0, 0, fullStrength)));
  });

  it('ignores non-positive floorPoolStrength', () => {
    const lights: FloorPoolLight[] = [
      {
        position: [0, 1.2, 0],
        color: '#ff9d52',
        distance: 5.5,
        floorPoolStrength: 0,
      },
      {
        position: [0, 1.2, 0],
        color: '#3ddc84',
        distance: 5.5,
        floorPoolStrength: -1,
      },
    ];
    expect(isCloseTo(computeFloorPoolColor(BASE, 0, 0, lights), BASE)).toBe(
      true
    );
  });

  it('never mutates the base color instance', () => {
    const lights: FloorPoolLight[] = [
      { position: [0, 1.2, 0], color: '#ff9d52', distance: 5.5 },
    ];
    const baseCopy = BASE.clone();
    computeFloorPoolColor(BASE, 0, 0, lights);
    expect(isCloseTo(BASE, baseCopy)).toBe(true);
  });
});
