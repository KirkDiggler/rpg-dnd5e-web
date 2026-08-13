import { describe, expect, it } from 'vitest';
import { angularDistanceDegrees, stepAttackDieMotion } from './attackDieMotion';
const target = [0, 0, 0, 1] as const;
describe('attack die motion', () => {
  it('treats q and -q equivalently and takes shortest arc', () => {
    expect(angularDistanceDegrees(target, [0, 0, 0, -1])).toBeCloseTo(0);
    expect(
      stepAttackDieMotion({
        elapsedMs: 1500,
        reducedMotion: false,
        current: [0, 0, 0, -1],
        target,
      }).quaternion[3]
    ).toBeLessThan(0);
  });
  it('observes at <= .25 degrees then copies and repeatedly holds exact target', () => {
    const current = [
      0,
      0,
      Math.sin((0.1 * Math.PI) / 360),
      Math.cos((0.1 * Math.PI) / 360),
    ] as const;
    const a = stepAttackDieMotion({
      elapsedMs: 1900,
      reducedMotion: false,
      current,
      target,
    });
    expect(a.observeNow).toBe(true);
    expect(a.quaternion).toEqual(target);
    expect(
      stepAttackDieMotion({
        elapsedMs: 2000,
        reducedMotion: false,
        current: a.quaternion,
        target,
      }).quaternion
    ).toEqual(target);
  });
  it('produces deterministic decorative tumble before final convergence', () => {
    const start = stepAttackDieMotion({
      elapsedMs: 100,
      reducedMotion: false,
      current: [0, 0, 0, 1],
      target,
    });
    const later = stepAttackDieMotion({
      elapsedMs: 700,
      reducedMotion: false,
      current: start.quaternion,
      target,
    });
    expect(later.quaternion).not.toEqual(start.quaternion);
    expect(later.observeNow).toBe(false);
  });
  it('fails rather than observing when schedule expires off target', () =>
    expect(
      stepAttackDieMotion({
        elapsedMs: 2000,
        reducedMotion: false,
        current: [1, 0, 0, 0],
        target,
      }).failed
    ).toBe(true));
  it('reduced motion applies target before paint and observes next RAF', () => {
    expect(
      stepAttackDieMotion({
        elapsedMs: 0,
        reducedMotion: true,
        current: [1, 0, 0, 0],
        target,
      }).quaternion
    ).toEqual(target);
    expect(
      stepAttackDieMotion({
        elapsedMs: 16,
        reducedMotion: true,
        current: target,
        target,
      }).observeNow
    ).toBe(true);
  });
});

describe('decorative replay seed', () => {
  it('changes only the pre-convergence path and holds the same exact target', () => {
    const base = {
      elapsedMs: 500,
      reducedMotion: false,
      current: [0, 0, 0, 1] as const,
      target: [0, 0, 0, 1] as const,
    };
    expect(
      stepAttackDieMotion({ ...base, decorativeSeed: 1 }).quaternion
    ).not.toEqual(
      stepAttackDieMotion({ ...base, decorativeSeed: 2 }).quaternion
    );
    expect(
      stepAttackDieMotion({ ...base, elapsedMs: 1900, decorativeSeed: 1 })
        .quaternion
    ).toEqual(base.target);
    expect(
      stepAttackDieMotion({ ...base, elapsedMs: 1900, decorativeSeed: 2 })
        .quaternion
    ).toEqual(base.target);
  });
});
