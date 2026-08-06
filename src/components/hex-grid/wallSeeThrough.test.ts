import { describe, expect, it } from 'vitest';
import {
  approachOpacity,
  DEFAULT_WALL_SEE_EYE_HEIGHT,
  DEFAULT_WALL_SEE_OPACITY,
  DEFAULT_WALL_SEE_RADIUS,
  DEFAULT_WALL_SEE_RATE,
  fadeOpacityForDistance,
  parseWallSeeThrough,
} from './wallSeeThrough';

describe('parseWallSeeThrough', () => {
  it('is off with no query params, so the default route renders unchanged', () => {
    expect(parseWallSeeThrough('').enabled).toBe(false);
  });

  it('?wallSee=1 alone composes into a visible effect', () => {
    // The ?wallCutaway=1 papercut, again: a flag whose defaults added up to
    // something barely distinguishable from off. A wall you can still barely
    // see through is worse than no feature, because it reads as a bug.
    const dials = parseWallSeeThrough('?wallSee=1');
    expect(dials.enabled).toBe(true);
    expect(dials.minOpacity).toBeLessThan(0.35);
    expect(dials.radius).toBeGreaterThan(Math.sqrt(3));
  });

  it('carries every tuning override', () => {
    const dials = parseWallSeeThrough(
      '?wallSeeOpacity=0.4&wallSeeRadius=6&wallSeeRate=3&wallSeeEye=2'
    );
    expect(dials.minOpacity).toBe(0.4);
    expect(dials.radius).toBe(6);
    expect(dials.rate).toBe(3);
    expect(dials.eyeHeight).toBe(2);
  });

  it('an explicit tuning param implies enabled without also needing ?wallSee=1', () => {
    expect(parseWallSeeThrough('?wallSeeOpacity=0.5').enabled).toBe(true);
    expect(parseWallSeeThrough('?wallSeeRadius=2').enabled).toBe(true);
    expect(parseWallSeeThrough('?wallSeeRate=5').enabled).toBe(true);
    expect(parseWallSeeThrough('?wallSeeEye=1.5').enabled).toBe(true);
  });

  it('ignores non-numeric and empty values instead of poisoning a material with NaN', () => {
    const dials = parseWallSeeThrough(
      '?wallSee=1&wallSeeOpacity=abc&wallSeeRadius=&wallSeeRate=&wallSeeEye=x'
    );
    expect(dials.minOpacity).toBe(DEFAULT_WALL_SEE_OPACITY);
    expect(dials.radius).toBe(DEFAULT_WALL_SEE_RADIUS);
    expect(dials.rate).toBe(DEFAULT_WALL_SEE_RATE);
    expect(dials.eyeHeight).toBe(DEFAULT_WALL_SEE_EYE_HEIGHT);
  });

  it("aims the occlusion ray at a mini's body, not its feet", () => {
    // A ray at y=0 grazes the ground plane, so a wall would only register as
    // blocking once it already covered the character's feet. Characters
    // stand ~1.5 units tall at SYNTY_SCALE.
    expect(DEFAULT_WALL_SEE_EYE_HEIGHT).toBeGreaterThan(0.5);
    expect(DEFAULT_WALL_SEE_EYE_HEIGHT).toBeLessThan(1.5);
  });
});

describe('fadeOpacityForDistance', () => {
  it('is most transparent exactly where the mini is blocked', () => {
    expect(fadeOpacityForDistance(0, 4, 0.2)).toBeCloseTo(0.2);
  });

  it('is fully solid at and beyond the falloff radius', () => {
    expect(fadeOpacityForDistance(4, 4, 0.2)).toBe(1);
    expect(fadeOpacityForDistance(40, 4, 0.2)).toBe(1);
  });

  it('rises monotonically across the falloff, so the hole has no banding', () => {
    let previous = -Infinity;
    for (let d = 0; d <= 4; d += 0.25) {
      const opacity = fadeOpacityForDistance(d, 4, 0.2);
      expect(opacity).toBeGreaterThanOrEqual(previous);
      previous = opacity;
    }
  });

  it('flattens at both ends — a linear ramp would crease at the radius', () => {
    // Smoothstep's derivative is 0 at t=0 and t=1. Near the rim, the step
    // between samples must be SMALLER than in the middle of the ramp; a
    // linear ramp would make every step identical and leave a visible circle
    // on a large flat brick surface.
    const at = (d: number) => fadeOpacityForDistance(d, 4, 0.2);
    const rimStep = at(4) - at(3.75);
    const midStep = at(2.125) - at(1.875);
    expect(rimStep).toBeLessThan(midStep);
  });

  it('never returns a degenerate opacity for a degenerate radius', () => {
    expect(fadeOpacityForDistance(0, 0, 0.2)).toBe(0.2);
    expect(fadeOpacityForDistance(1, 0, 0.2)).toBe(1);
    expect(fadeOpacityForDistance(1, -3, 0.2)).toBe(1);
  });
});

describe('approachOpacity', () => {
  it('moves toward the target without overshooting it', () => {
    const next = approachOpacity(1, 0.2, 12, 1 / 60);
    expect(next).toBeLessThan(1);
    expect(next).toBeGreaterThan(0.2);
  });

  it('converges from either direction', () => {
    expect(approachOpacity(0.2, 1, 12, 1 / 60)).toBeGreaterThan(0.2);
    expect(approachOpacity(0.2, 1, 12, 1 / 60)).toBeLessThan(1);
  });

  it('is framerate-independent: one long step matches two short ones', () => {
    // frameloop="demand" delivers frames in irregular bursts, so a per-frame
    // constant would make the same fade visibly faster during a drag than
    // after it. Exponential approach composes exactly.
    const once = approachOpacity(1, 0, 12, 0.2);
    const twice = approachOpacity(approachOpacity(1, 0, 12, 0.1), 0, 12, 0.1);
    expect(once).toBeCloseTo(twice, 10);
  });

  it('snaps to the target for a non-positive rate rather than stalling', () => {
    expect(approachOpacity(1, 0.2, 0, 1 / 60)).toBe(0.2);
    expect(approachOpacity(1, 0.2, -5, 1 / 60)).toBe(0.2);
  });

  it('does not move on a zero or negative delta', () => {
    expect(approachOpacity(0.5, 1, 12, 0)).toBe(0.5);
    expect(approachOpacity(0.5, 1, 12, -1)).toBe(0.5);
  });
});
