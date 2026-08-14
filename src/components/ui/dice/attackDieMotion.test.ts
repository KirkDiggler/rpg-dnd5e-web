import { describe, expect, it } from 'vitest';
import {
  angularDistanceDegrees,
  attackDiePoseForPhase,
  attackDieRollTranslation,
  stepAttackDieMotion,
} from './attackDieMotion';
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

describe('right-to-left roll translation', () => {
  it('enters on the right, travels left, and settles on the left', () => {
    const start = attackDieRollTranslation(0, false);
    const middle = attackDieRollTranslation(850, false);
    const settled = attackDieRollTranslation(1900, false);
    expect(start[0]).toBeGreaterThan(0);
    expect(middle[0]).toBeLessThan(start[0]);
    expect(settled[0]).toBeLessThan(0);
    expect(settled).toEqual(attackDieRollTranslation(2400, false));
    expect(middle[2]).toBeLessThan(0);
  });

  it('places reduced motion directly at the left resting position', () => {
    expect(attackDieRollTranslation(0, true)).toEqual(
      attackDieRollTranslation(1900, false)
    );
  });
});

describe('phase-aware pose', () => {
  const current = [0.31, -0.47, 0.19, 0.805] as const;
  const alternateTarget = [1, 0, 0, 0] as const;

  it.each(['entering', 'ready'] as const)(
    'keeps %s neutral at center without revealing either target',
    (phase) => {
      const low = attackDiePoseForPhase({
        phase,
        elapsedMs: 12_000,
        reducedMotion: false,
        current,
        target,
      });
      const high = attackDiePoseForPhase({
        phase,
        elapsedMs: 12_000,
        reducedMotion: false,
        current,
        target: alternateTarget,
      });

      expect(low.quaternion).toEqual(high.quaternion);
      expect(low.translation).toEqual([0, 0, 0]);
      expect(low.observeNow).toBe(false);
      expect(low.exactTargetHeld).toBe(false);
    }
  );

  it('uses the existing rolling trajectory and decorative variation for zero gesture', () => {
    const release = { variation: 17, vector: [0, 0] as const, shake: 0 };
    const pose = attackDiePoseForPhase({
      phase: 'rolling',
      elapsedMs: 500,
      reducedMotion: false,
      current,
      target,
      release,
    });

    expect(pose).toEqual({
      ...stepAttackDieMotion({
        elapsedMs: 500,
        reducedMotion: false,
        current,
        target,
        decorativeSeed: 17,
      }),
      translation: attackDieRollTranslation(500, false),
    });
  });

  it('uses vector and shake only to vary bounded mid-roll decoration', () => {
    const base = {
      phase: 'rolling' as const,
      elapsedMs: 500,
      reducedMotion: false,
      current,
      target,
    };
    const first = attackDiePoseForPhase({
      ...base,
      release: { variation: 17, vector: [0.75, -0.5], shake: 0.8 },
    });
    const second = attackDiePoseForPhase({
      ...base,
      release: { variation: 17, vector: [-0.6, 0.9], shake: 0.25 },
    });

    expect(first.translation).not.toEqual(second.translation);
    expect(first.quaternion).not.toEqual(second.quaternion);
    for (const value of [...first.translation, ...second.translation]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(2);
    }
  });

  it('removes gesture decoration at completion and exact settled rest', () => {
    const releases = [
      { variation: 17, vector: [0.75, -0.5] as const, shake: 0.8 },
      { variation: 17, vector: [-0.6, 0.9] as const, shake: 0.25 },
    ];

    const completed = releases.map((release) =>
      attackDiePoseForPhase({
        phase: 'rolling',
        elapsedMs: 1900,
        reducedMotion: false,
        current: target,
        target,
        release,
      })
    );
    const settled = releases.map((release) =>
      attackDiePoseForPhase({
        phase: 'settled',
        elapsedMs: 500,
        reducedMotion: false,
        current,
        target,
        release,
      })
    );

    expect(completed[0].translation).toEqual(
      attackDieRollTranslation(1900, false)
    );
    expect(completed[1].translation).toEqual(completed[0].translation);
    expect(completed[0].quaternion).toBe(target);
    expect(completed[1].quaternion).toBe(target);
    expect(settled[0].translation).toEqual(completed[0].translation);
    expect(settled[1].translation).toEqual(completed[0].translation);
    expect(settled[0].quaternion).toBe(target);
    expect(settled[1].quaternion).toBe(target);
  });

  it('ignores gesture decoration for reduced motion and observes the exact target', () => {
    const releases = [
      { variation: 17, vector: [0.75, -0.5] as const, shake: 0.8 },
      { variation: 17, vector: [-0.6, 0.9] as const, shake: 0.25 },
    ];
    const poses = releases.map((release) =>
      attackDiePoseForPhase({
        phase: 'rolling',
        elapsedMs: 16,
        reducedMotion: true,
        current,
        target,
        release,
      })
    );

    expect(poses[0]).toEqual(poses[1]);
    expect(poses[0].quaternion).toBe(target);
    expect(poses[0].translation).toEqual(attackDieRollTranslation(1900, false));
    expect(poses[0].observeNow).toBe(true);
  });

  it.each(['settled', 'exiting'] as const)(
    'copies the exact target and left resting position immediately for %s',
    (phase) => {
      const pose = attackDiePoseForPhase({
        phase,
        elapsedMs: 0,
        reducedMotion: false,
        current,
        target,
      });

      expect(pose.quaternion).toBe(target);
      expect(pose.translation).toEqual(attackDieRollTranslation(1900, false));
      expect(pose.exactTargetHeld).toBe(true);
      expect(pose.observeNow).toBe(false);
      expect(pose.failed).toBe(false);
    }
  );

  it('keeps reduced motion neutral until release, then produces matching observation', () => {
    const ready = attackDiePoseForPhase({
      phase: 'ready',
      elapsedMs: 60_000,
      reducedMotion: true,
      current,
      target,
    });
    const released = attackDiePoseForPhase({
      phase: 'rolling',
      elapsedMs: 16,
      reducedMotion: true,
      current: ready.quaternion,
      target,
    });

    expect(ready.quaternion).not.toEqual(target);
    expect(ready.observeNow).toBe(false);
    expect(released.quaternion).toBe(target);
    expect(released.translation).toEqual(attackDieRollTranslation(1900, false));
    expect(released.observeNow).toBe(true);
    expect(released.exactTargetHeld).toBe(true);
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
