import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCENARIOS } from './fixtures';
import {
  AUTO_THROW_TIMEOUT_MS,
  REDUCED_MOTION_THROW_MS,
  useBeatSequencer,
} from './useBeatSequencer';

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBeatSequencer', () => {
  it('a cinematic hit runs cue -> throw -> verdict -> impact -> release -> done over exactly 5100ms (Kirk iteration 1: ≈5s suspenseful hit)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'))
    );
    expect(result.current.beat).toBe('cue');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.beat).toBe('armed'); // role: 'self' waits for a throw

    act(() => {
      result.current.throwDie();
    });
    expect(result.current.beat).toBe('throw');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.beat).toBe('verdict');

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(result.current.beat).toBe('impact');

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current.beat).toBe('release');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.beat).toBe('done');
    // total: 300 + 2000 + 1600 + 900 + 300 = 5100ms exactly.
  });

  it('a cinematic miss skips impact entirely and completes over exactly 4200ms (Kirk iteration 1: ≈4s miss)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-miss'))
    );
    act(() => {
      vi.advanceTimersByTime(300);
      result.current.throwDie();
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.beat).toBe('verdict');
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(result.current.beat).toBe('release'); // NOT 'impact'
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.beat).toBe('done');
    // total: 300 + 2000 + 1600 + 300 = 4200ms exactly.
  });

  it('a cinematic crit stretches verdict + impact to a total budget of exactly 6600ms (Kirk iteration 1: ≈6-7s crit)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-crit'))
    );
    act(() => {
      vi.advanceTimersByTime(300); // cue
      result.current.throwDie();
      vi.advanceTimersByTime(2000); // throw
    });
    expect(result.current.beat).toBe('verdict');
    act(() => {
      vi.advanceTimersByTime(2599); // verdict is 1600 + 1000 = 2600ms
    });
    expect(result.current.beat).toBe('verdict');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.beat).toBe('impact');
    act(() => {
      vi.advanceTimersByTime(1399); // impact is 900 + 500 = 1400ms
    });
    expect(result.current.beat).toBe('impact');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.beat).toBe('release');
    act(() => {
      vi.advanceTimersByTime(300); // release
    });
    expect(result.current.beat).toBe('done');
    // total: 300 + 2000 + 2600 + 1400 + 300 = 6600ms exactly.
  });

  it('spectating an NPC grunt auto-plays through Brisk timing with no armed wait', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('npc-grunt-swing'))
    );
    expect(result.current.beat).toBe('cue');
    act(() => {
      vi.advanceTimersByTime(150); // Brisk cue
    });
    expect(result.current.beat).toBe('throw'); // auto-played, no 'armed'
    act(() => {
      vi.advanceTimersByTime(1000); // Brisk throw
    });
    expect(result.current.beat).toBe('verdict');
  });

  it('spectating an NPC boss crit still gets Cinematic timing (design.md §4)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('npc-boss-swing'))
    );
    act(() => {
      vi.advanceTimersByTime(300); // Cinematic cue
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.beat).toBe('verdict');
  });

  it('auto-throws after AUTO_THROW_TIMEOUT_MS if the player never calls throwDie (design.md §2, unchanged this iteration — timeout is the agency pause, not the Cue->Release duration target)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'))
    );
    act(() => {
      vi.advanceTimersByTime(300); // cue -> armed
    });
    expect(result.current.beat).toBe('armed');
    act(() => {
      vi.advanceTimersByTime(AUTO_THROW_TIMEOUT_MS);
    });
    expect(result.current.beat).toBe('throw');
  });

  it('the second correlation group of repeated-attacks compresses to Brisk and auto-plays with no armed wait, even though the scenario role is self', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('repeated-attacks'))
    );
    // Finish group 0 via two SYNCHRONOUS skip() calls in the same tick —
    // this is the exact case that requires skip()/throwDie() to read a
    // ref rather than the closured `beat` state variable (see
    // useBeatSequencer.ts's file header); both calls happen inside one
    // act(), with no render between them.
    act(() => {
      result.current.skip(); // cue/armed/throw -> verdict
      result.current.skip(); // verdict/impact/release -> finishes the group
    });
    expect(result.current.groupIndex).toBe(1);
    expect(result.current.beat).toBe('cue');
    act(() => {
      vi.advanceTimersByTime(150); // Brisk cue, NOT Cinematic's 300
    });
    expect(result.current.beat).toBe('throw'); // auto-played, group index > 0
  });

  it('skip() from cue/armed/throw jumps straight to verdict (design.md §1: "jumps to the verdict")', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'))
    );
    expect(result.current.beat).toBe('cue');
    act(() => {
      result.current.skip();
    });
    expect(result.current.beat).toBe('verdict');
  });

  it('two synchronous skip() calls in one tick finish the current group (verdict -> done)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'))
    );
    act(() => {
      result.current.skip(); // -> verdict
      result.current.skip(); // -> done (only one group)
    });
    expect(result.current.beat).toBe('done');
  });

  it('instant pace goes straight to done with no intermediate beats (design.md §4 escape hatch)', () => {
    const instantScenario = {
      ...scenario('player-hit'),
      pace: 'instant' as const,
    };
    const { result } = renderHook(() => useBeatSequencer(instantScenario));
    expect(result.current.beat).toBe('done');
    expect(result.current.group?.attack?.hit).toBe(true);
  });

  it('rerendering with a DIFFERENT scenario that also lands on the SAME beat/groupIndex values ("done"/0, both Instant) still returns the NEW group — not a stale prior one', () => {
    // Regression coverage for a real bug: `startGroup()`'s
    // `pace === 'instant'` branch calls `setBeat('done')`, and the
    // scenario-changed effect calls `setGroupIndex(0)` — both same-value
    // updates when the PREVIOUS render was already 'done'/0. If `group`
    // were derived from a bare ref mutation instead of real state (see
    // this file's header), React would bail both same-value updates and
    // never re-render, so `result.current.group` would keep returning
    // the FIRST scenario's data forever despite the ref having been
    // correctly mutated to the second scenario's groups.
    const hitInstant = {
      ...scenario('player-hit'),
      pace: 'instant' as const,
    };
    const critInstant = {
      ...scenario('player-crit'),
      pace: 'instant' as const,
    };
    const { result, rerender } = renderHook(
      ({ s }: { s: typeof hitInstant }) => useBeatSequencer(s),
      { initialProps: { s: hitInstant } }
    );
    expect(result.current.beat).toBe('done');
    expect(result.current.groupIndex).toBe(0);
    expect(result.current.group?.attack?.critical).toBe(false);
    expect(result.current.group?.attack?.attackRoll).toBe(14);

    rerender({ s: critInstant });

    // beat/groupIndex are UNCHANGED values ('done'/0 both times) — the
    // bug this test guards against is exactly that this render would be
    // skipped entirely without a genuinely-changing piece of state to
    // force it.
    expect(result.current.beat).toBe('done');
    expect(result.current.groupIndex).toBe(0);
    expect(result.current.group?.attack?.critical).toBe(true);
    expect(result.current.group?.attack?.attackRoll).toBe(20);
  });

  it('reduced motion collapses Throw to REDUCED_MOTION_THROW_MS instead of the full tumble', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'), { reducedMotion: true })
    );
    act(() => {
      vi.advanceTimersByTime(300);
      result.current.throwDie();
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(REDUCED_MOTION_THROW_MS);
    });
    expect(result.current.beat).toBe('verdict'); // not still 'throw' at the full 2000ms mark
  });

  it('toggling reducedMotion mid group-0 restarts the CURRENT group at cue with the new timing semantics (no stale option closure)', () => {
    const { result, rerender } = renderHook(
      ({ reducedMotion }: { reducedMotion: boolean }) =>
        useBeatSequencer(scenario('player-hit'), { reducedMotion }),
      { initialProps: { reducedMotion: false } }
    );
    act(() => {
      vi.advanceTimersByTime(300); // cue -> armed
    });
    expect(result.current.beat).toBe('armed');
    act(() => {
      result.current.throwDie();
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(1000); // mid the full 2000ms tumble, not yet resolved
    });
    expect(result.current.beat).toBe('throw');

    // Toggle reducedMotion without changing scenario identity — the
    // in-flight full-tumble throw must NOT resolve on its own stale
    // schedule; the CURRENT group (group 0, the only group here)
    // restarts from cue under the new timing semantics instead.
    rerender({ reducedMotion: true });
    expect(result.current.beat).toBe('cue');

    act(() => {
      vi.advanceTimersByTime(300); // cue (unaffected by reducedMotion) -> armed
    });
    expect(result.current.beat).toBe('armed');
    act(() => {
      result.current.throwDie();
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(REDUCED_MOTION_THROW_MS);
    });
    expect(result.current.beat).toBe('verdict'); // new reducedMotion timing took effect
  });

  it('throwDie() is a no-op outside the armed beat', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'))
    );
    expect(result.current.beat).toBe('cue');
    act(() => {
      result.current.throwDie();
    });
    expect(result.current.beat).toBe('cue'); // unchanged
  });

  it('toggling reducedMotion after advancing past group 0 restarts only the CURRENT group at cue — it must never replay an already-completed earlier correlation group', () => {
    const { result, rerender } = renderHook(
      ({ reducedMotion }: { reducedMotion: boolean }) =>
        useBeatSequencer(scenario('repeated-attacks'), { reducedMotion }),
      { initialProps: { reducedMotion: false } }
    );
    // Finish group 0 via two synchronous skip() calls, same as the
    // repeat-roll compression test above — lands on group 1, which
    // auto-plays (no armed wait) at Brisk because index > 0.
    act(() => {
      result.current.skip(); // group 0: cue/armed/throw -> verdict
      result.current.skip(); // group 0: verdict/impact/release -> finishes group 0
    });
    expect(result.current.groupIndex).toBe(1);
    expect(result.current.beat).toBe('cue');

    act(() => {
      vi.advanceTimersByTime(150); // group 1's Brisk cue -> auto-plays to throw
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(500); // mid group 1's Brisk 1000ms throw, unresolved
    });
    expect(result.current.beat).toBe('throw');

    // Toggle reducedMotion with the SAME scenario identity — must clear
    // the pending timer and restart the CURRENT group (index 1) at cue,
    // NOT rebuild/replay group 0.
    rerender({ reducedMotion: true });
    expect(result.current.groupIndex).toBe(1); // still group 1, never rewound
    expect(result.current.beat).toBe('cue');

    act(() => {
      vi.advanceTimersByTime(150); // group 1's Brisk cue again (unaffected) -> auto-plays
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(REDUCED_MOTION_THROW_MS);
    });
    expect(result.current.beat).toBe('verdict'); // restarted throw used the new reduced-motion timing
  });

  it('a brisk-pace hit completes over exactly 2550ms (Kirk iteration 1: exact half of the new Cinematic budget)', () => {
    const briskScenario = { ...scenario('player-hit'), pace: 'brisk' as const };
    const { result } = renderHook(() => useBeatSequencer(briskScenario));
    act(() => {
      vi.advanceTimersByTime(150); // Brisk cue -> armed (role: self, group 0)
    });
    expect(result.current.beat).toBe('armed');
    act(() => {
      result.current.throwDie();
    });
    act(() => {
      vi.advanceTimersByTime(1000); // Brisk throw
    });
    expect(result.current.beat).toBe('verdict');
    act(() => {
      vi.advanceTimersByTime(800); // Brisk verdict
    });
    expect(result.current.beat).toBe('impact');
    act(() => {
      vi.advanceTimersByTime(450); // Brisk impact
    });
    expect(result.current.beat).toBe('release');
    act(() => {
      vi.advanceTimersByTime(150); // Brisk release
    });
    expect(result.current.beat).toBe('done');
    // total: 150 + 1000 + 800 + 450 + 150 = 2550ms exactly.
  });

  it('a brisk-pace miss skips impact and completes over exactly 2100ms (Kirk iteration 1)', () => {
    const briskMiss = { ...scenario('player-miss'), pace: 'brisk' as const };
    const { result } = renderHook(() => useBeatSequencer(briskMiss));
    act(() => {
      vi.advanceTimersByTime(150); // Brisk cue -> armed
      result.current.throwDie();
      vi.advanceTimersByTime(1000); // Brisk throw
    });
    expect(result.current.beat).toBe('verdict');
    act(() => {
      vi.advanceTimersByTime(800); // Brisk verdict
    });
    expect(result.current.beat).toBe('release'); // NOT 'impact'
    act(() => {
      vi.advanceTimersByTime(150); // Brisk release
    });
    expect(result.current.beat).toBe('done');
    // total: 150 + 1000 + 800 + 150 = 2100ms exactly.
  });
});
