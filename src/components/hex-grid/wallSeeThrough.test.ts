import { describe, expect, it } from 'vitest';
import {
  approachOpacity,
  DEFAULT_WALL_SEE_EYE_HEIGHT,
  DEFAULT_WALL_SEE_MODE,
  DEFAULT_WALL_SEE_OPACITY,
  DEFAULT_WALL_SEE_RATE,
  isInFrontOfTarget,
  parseWallSeeThrough,
} from './wallSeeThrough';

describe('parseWallSeeThrough', () => {
  it('is off with no query params, so the default route renders unchanged', () => {
    expect(parseWallSeeThrough('').enabled).toBe(false);
  });

  it('defaults to the always-on near-wall mode, not the surgical one', () => {
    // 'block' only fades a wall when a mini is ACTUALLY behind it, which
    // almost never happens with everyone stood mid-room — Kirk's report
    // driving this default was "I cannot see through the walls". A feature
    // that is correct but invisible reads as broken.
    expect(DEFAULT_WALL_SEE_MODE).toBe('near');
    expect(parseWallSeeThrough('?wallSee=1').mode).toBe('near');
  });

  it('?wallSee=1 alone composes into a visible effect', () => {
    // The ?wallCutaway=1 papercut, again: a flag whose defaults added up to
    // something barely distinguishable from off.
    const dials = parseWallSeeThrough('?wallSee=1');
    expect(dials.enabled).toBe(true);
    expect(dials.minOpacity).toBeLessThan(0.4);
  });

  it('keeps a faded wall readable as architecture rather than a ghost', () => {
    // Fading rather than deleting is the whole point; an opacity near zero
    // would just be ?wallCutaway=1 with extra steps.
    expect(DEFAULT_WALL_SEE_OPACITY).toBeGreaterThan(0.1);
  });

  it('carries every tuning override', () => {
    const dials = parseWallSeeThrough(
      '?wallSeeMode=block&wallSeeOpacity=0.4&wallSeeRate=3&wallSeeEye=2'
    );
    expect(dials.mode).toBe('block');
    expect(dials.minOpacity).toBe(0.4);
    expect(dials.rate).toBe(3);
    expect(dials.eyeHeight).toBe(2);
  });

  it('an explicit tuning param implies enabled without also needing ?wallSee=1', () => {
    expect(parseWallSeeThrough('?wallSeeMode=block').enabled).toBe(true);
    expect(parseWallSeeThrough('?wallSeeOpacity=0.5').enabled).toBe(true);
    expect(parseWallSeeThrough('?wallSeeRate=5').enabled).toBe(true);
    expect(parseWallSeeThrough('?wallSeeEye=1.5').enabled).toBe(true);
  });

  it('ignores an unknown mode rather than rendering with a garbage strategy', () => {
    const dials = parseWallSeeThrough('?wallSee=1&wallSeeMode=sideways');
    expect(dials.mode).toBe(DEFAULT_WALL_SEE_MODE);
    // An unrecognised mode must not be what SWITCHES the feature on, either.
    expect(parseWallSeeThrough('?wallSeeMode=sideways').enabled).toBe(false);
  });

  it('ignores non-numeric and empty values instead of poisoning a material with NaN', () => {
    const dials = parseWallSeeThrough(
      '?wallSee=1&wallSeeOpacity=abc&wallSeeRate=&wallSeeEye=x'
    );
    expect(dials.minOpacity).toBe(DEFAULT_WALL_SEE_OPACITY);
    expect(dials.rate).toBe(DEFAULT_WALL_SEE_RATE);
    expect(dials.eyeHeight).toBe(DEFAULT_WALL_SEE_EYE_HEIGHT);
  });

  it("aims the block-mode ray at a mini's body, not its feet", () => {
    // A ray at y=0 grazes the ground plane, so a wall would only register as
    // blocking once it already covered the character's feet. Characters
    // stand ~1.5 units tall at SYNTY_SCALE.
    expect(DEFAULT_WALL_SEE_EYE_HEIGHT).toBeGreaterThan(0.5);
    expect(DEFAULT_WALL_SEE_EYE_HEIGHT).toBeLessThan(1.5);
  });
});

describe('isInFrontOfTarget', () => {
  it('fades a wall nearer the camera than what the camera is looking at', () => {
    expect(isInFrontOfTarget(2, 10, 0)).toBe(true);
  });

  it('leaves the far wall solid, so the room keeps a back to read against', () => {
    expect(isInFrontOfTarget(18, 10, 0)).toBe(false);
  });

  it('holds a wall the player is stood against on the faded side', () => {
    // Without the margin, a wall at essentially the target's own depth sits
    // exactly on the cut and would flicker between faded and solid as the
    // mini shifts within a single hex.
    expect(isInFrontOfTarget(10.4, 10, 1.5)).toBe(true);
    expect(isInFrontOfTarget(10.4, 10, 0)).toBe(false);
  });

  it('still resolves the far wall once it is clear of the margin', () => {
    expect(isInFrontOfTarget(12, 10, 1.5)).toBe(false);
  });

  it('works with depths behind the camera, which are negative', () => {
    expect(isInFrontOfTarget(-5, 10, 0)).toBe(true);
  });
});

describe('approachOpacity', () => {
  it('moves toward the target without overshooting it', () => {
    const next = approachOpacity(1, 0.25, 12, 1 / 60);
    expect(next).toBeLessThan(1);
    expect(next).toBeGreaterThan(0.25);
  });

  it('converges from either direction', () => {
    expect(approachOpacity(0.25, 1, 12, 1 / 60)).toBeGreaterThan(0.25);
    expect(approachOpacity(0.25, 1, 12, 1 / 60)).toBeLessThan(1);
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
    expect(approachOpacity(1, 0.25, 0, 1 / 60)).toBe(0.25);
    expect(approachOpacity(1, 0.25, -5, 1 / 60)).toBe(0.25);
  });

  it('does not move on a zero or negative delta', () => {
    expect(approachOpacity(0.5, 1, 12, 0)).toBe(0.5);
    expect(approachOpacity(0.5, 1, 12, -1)).toBe(0.5);
  });
});
