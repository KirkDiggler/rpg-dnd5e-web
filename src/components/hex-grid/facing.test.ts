import { describe, expect, it } from 'vitest';
import {
  easeHeading,
  headingFromDelta,
  shortestTurn,
  TURN_RATE_RAD_PER_SEC,
} from './facing';
import { cubeToWorld, HEX_DIRECTIONS } from './hexMath';

const deg = (r: number) => ((((r * 180) / Math.PI) % 360) + 360) % 360;
const rad = (d: number) => (d * Math.PI) / 180;

describe('headingFromDelta', () => {
  // The six hex neighbours land exactly 60 degrees apart under this
  // cubeToWorld. This is the test that pins the atan2(dx, dz) convention — a
  // Three.js object at rotation.y = t maps its local +Z to (sin t, 0, cos t),
  // so atan2(dx, dz) is that function's exact inverse.
  const EXPECTED_DEG = [90, 150, 210, 270, 330, 30];

  it.each(HEX_DIRECTIONS.map((d, i) => [i, d, EXPECTED_DEG[i]] as const))(
    'hex direction %i has heading %s deg',
    (_i, dir, expected) => {
      const w = cubeToWorld(dir, 1);
      expect(deg(headingFromDelta(w.x, w.z)!)).toBeCloseTo(expected, 6);
    }
  );

  it('returns undefined for a zero-length delta', () => {
    // The rpg-api#656 degenerate same-hex "move" produces exactly this.
    // atan2(0, 0) would return a misleading 0 (due north); undefined lets
    // the caller hold its current heading instead of snapping.
    expect(headingFromDelta(0, 0)).toBeUndefined();
  });
});

describe('shortestTurn', () => {
  it('takes the short way across the wrap boundary', () => {
    expect(deg(shortestTurn(rad(350), rad(10)))).toBeCloseTo(20, 6);
  });

  it('turns negative when the short way is clockwise', () => {
    expect((shortestTurn(rad(10), rad(350)) * 180) / Math.PI).toBeCloseTo(
      -20,
      6
    );
  });

  it('is zero when already facing the target', () => {
    expect(shortestTurn(rad(42), rad(42))).toBe(0);
  });

  it('pins the exact-180 tie-break to +PI regardless of input sign', () => {
    // A full reversal (walk east, then west) is a common real path and sits
    // exactly on the boundary where +PI and -PI are equally short. Either is
    // visually fine, but an unpinned tie-break is a coin flip that makes turn
    // direction non-deterministic across runs.
    expect(shortestTurn(0, Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(shortestTurn(Math.PI, 0)).toBeCloseTo(Math.PI, 12);
  });
});

describe('easeHeading', () => {
  it('steps toward the target at no more than turnRate * delta', () => {
    expect(easeHeading(0, Math.PI, 0.1, 8)).toBeCloseTo(0.8, 6);
  });

  it('lands exactly on the target rather than overshooting', () => {
    // Must be === target, not approximately: useEntityFacing stops its
    // invalidate loop on an exact current === target comparison.
    expect(easeHeading(0, 0.5, 1, 8)).toBe(0.5);
  });

  it('is a no-op when already at the target', () => {
    expect(easeHeading(1.25, 1.25, 0.016, 8)).toBe(1.25);
  });

  it('eases the short way across the wrap boundary', () => {
    const next = easeHeading(rad(350), rad(10), 0.01, 8);
    expect(deg(next)).toBeCloseTo(354.58, 1);
  });

  it('resolves a 180 degree reversal inside one hex step', () => {
    // SECONDS_PER_HEX_STEP is 0.45; PI / 8 = 0.393s.
    expect(Math.PI / TURN_RATE_RAD_PER_SEC).toBeLessThan(0.45);
  });
});
