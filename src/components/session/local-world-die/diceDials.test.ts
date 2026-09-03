import { describe, expect, it } from 'vitest';
import {
  BASE_DIE_HOLD_HEIGHT_DEFAULT,
  BASE_DIE_HOLD_HEIGHT_MAX,
  BASE_DIE_HOLD_HEIGHT_MIN,
  BASE_DIE_HULL_RADIUS,
  BASE_DIE_REST_HEIGHT_ABOVE_SURFACE,
  DEFAULT_DIE_SCALE,
  localWorldDieDimensions,
  parseDiceDials,
} from './diceDials';

describe('parseDiceDials', () => {
  it("defaults dieScale to 1 — today's shipped die, unchanged", () => {
    expect(parseDiceDials('').dieScale).toBe(DEFAULT_DIE_SCALE);
    expect(DEFAULT_DIE_SCALE).toBe(1);
  });

  it('carries an explicit dieScale override', () => {
    expect(parseDiceDials('?dieScale=2').dieScale).toBe(2);
    expect(parseDiceDials('?dieScale=0.5').dieScale).toBe(0.5);
  });

  it('floors a zero, negative, or non-numeric scale back to the default rather than collapsing the die', () => {
    expect(parseDiceDials('?dieScale=0').dieScale).toBe(DEFAULT_DIE_SCALE);
    expect(parseDiceDials('?dieScale=-3').dieScale).toBe(DEFAULT_DIE_SCALE);
    expect(parseDiceDials('?dieScale=abc').dieScale).toBe(DEFAULT_DIE_SCALE);
    expect(parseDiceDials('?dieScale=').dieScale).toBe(DEFAULT_DIE_SCALE);
  });

  it('defaults rollFlash to off', () => {
    expect(parseDiceDials('').rollFlash).toBe('off');
  });

  it('accepts each of the four rollFlash values', () => {
    expect(parseDiceDials('?rollFlash=die').rollFlash).toBe('die');
    expect(parseDiceDials('?rollFlash=toast').rollFlash).toBe('toast');
    expect(parseDiceDials('?rollFlash=both').rollFlash).toBe('both');
    expect(parseDiceDials('?rollFlash=off').rollFlash).toBe('off');
  });

  it('falls back to off for an unrecognized rollFlash value', () => {
    expect(parseDiceDials('?rollFlash=bogus').rollFlash).toBe('off');
  });
});

describe('localWorldDieDimensions', () => {
  it("reproduces today's shipped dimensions at dieScale=1", () => {
    const dims = localWorldDieDimensions(1);
    expect(dims.hullRadius).toBe(BASE_DIE_HULL_RADIUS);
    expect(dims.restHeightAboveSurface).toBe(
      BASE_DIE_REST_HEIGHT_ABOVE_SURFACE
    );
    expect(dims.holdHeightDefault).toBe(BASE_DIE_HOLD_HEIGHT_DEFAULT);
    expect(dims.holdHeightMin).toBe(BASE_DIE_HOLD_HEIGHT_MIN);
    expect(dims.holdHeightMax).toBe(BASE_DIE_HOLD_HEIGHT_MAX);
  });

  it('scales every dimension by the SAME multiplier, so relative proportions never drift', () => {
    const dims = localWorldDieDimensions(2.5);
    expect(dims.hullRadius).toBeCloseTo(BASE_DIE_HULL_RADIUS * 2.5);
    expect(dims.restHeightAboveSurface).toBeCloseTo(
      BASE_DIE_REST_HEIGHT_ABOVE_SURFACE * 2.5
    );
    expect(dims.holdHeightDefault).toBeCloseTo(
      BASE_DIE_HOLD_HEIGHT_DEFAULT * 2.5
    );
    expect(dims.holdHeightMin).toBeCloseTo(BASE_DIE_HOLD_HEIGHT_MIN * 2.5);
    expect(dims.holdHeightMax).toBeCloseTo(BASE_DIE_HOLD_HEIGHT_MAX * 2.5);

    // Kirk's own real-table reference point: 0.55 world units on a 1.73-unit
    // hex is ~32%; dieScale=2.5 lands near his ~80%-of-a-cell comparison.
    const visualFraction = (0.55 * 2.5) / 1.73;
    expect(visualFraction).toBeGreaterThan(0.75);
    expect(visualFraction).toBeLessThan(0.85);
  });

  it('holds min < default < max at every scale, so the drag gesture never inverts', () => {
    for (const scale of [0.2, 1, 2.5, 5]) {
      const dims = localWorldDieDimensions(scale);
      expect(dims.holdHeightMin).toBeLessThan(dims.holdHeightDefault);
      expect(dims.holdHeightDefault).toBeLessThan(dims.holdHeightMax);
    }
  });
});
