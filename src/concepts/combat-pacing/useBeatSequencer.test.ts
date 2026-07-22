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
  it('a cinematic hit runs cue -> throw -> verdict -> impact -> release -> done over exactly 1450ms', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'))
    );
    expect(result.current.beat).toBe('cue');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.beat).toBe('armed'); // role: 'self' waits for a throw

    act(() => {
      result.current.throwDie();
    });
    expect(result.current.beat).toBe('throw');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.beat).toBe('verdict');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.beat).toBe('impact');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.beat).toBe('release');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.beat).toBe('done');
  });

  it('a cinematic miss skips impact entirely', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-miss'))
    );
    act(() => {
      vi.advanceTimersByTime(150);
      result.current.throwDie();
      vi.advanceTimersByTime(600);
    });
    expect(result.current.beat).toBe('verdict');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.beat).toBe('release'); // NOT 'impact'
  });

  it('a cinematic crit stretches verdict + impact to a total budget of exactly 2500ms (design.md §1)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-crit'))
    );
    act(() => {
      vi.advanceTimersByTime(150); // cue
      result.current.throwDie();
      vi.advanceTimersByTime(600); // throw
    });
    expect(result.current.beat).toBe('verdict');
    act(() => {
      vi.advanceTimersByTime(1199); // verdict is 200 + 1000 = 1200ms
    });
    expect(result.current.beat).toBe('verdict');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.beat).toBe('impact');
    act(() => {
      vi.advanceTimersByTime(349); // impact is 300 + 50 = 350ms
    });
    expect(result.current.beat).toBe('impact');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.beat).toBe('release');
    act(() => {
      vi.advanceTimersByTime(200); // release
    });
    expect(result.current.beat).toBe('done');
    // total: 150 + 600 + 1200 + 350 + 200 = 2500ms exactly.
  });

  it('spectating an NPC grunt auto-plays through Brisk timing with no armed wait', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('npc-grunt-swing'))
    );
    expect(result.current.beat).toBe('cue');
    act(() => {
      vi.advanceTimersByTime(75); // Brisk cue
    });
    expect(result.current.beat).toBe('throw'); // auto-played, no 'armed'
    act(() => {
      vi.advanceTimersByTime(300); // Brisk throw
    });
    expect(result.current.beat).toBe('verdict');
  });

  it('spectating an NPC boss crit still gets Cinematic timing (design.md §4)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('npc-boss-swing'))
    );
    act(() => {
      vi.advanceTimersByTime(150); // Cinematic cue
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.beat).toBe('verdict');
  });

  it('auto-throws after AUTO_THROW_TIMEOUT_MS if the player never calls throwDie (design.md §2)', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'))
    );
    act(() => {
      vi.advanceTimersByTime(150); // cue -> armed
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
      vi.advanceTimersByTime(75); // Brisk cue, NOT Cinematic's 150
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

  it('reduced motion collapses Throw to REDUCED_MOTION_THROW_MS instead of the full tumble', () => {
    const { result } = renderHook(() =>
      useBeatSequencer(scenario('player-hit'), { reducedMotion: true })
    );
    act(() => {
      vi.advanceTimersByTime(150);
      result.current.throwDie();
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(REDUCED_MOTION_THROW_MS);
    });
    expect(result.current.beat).toBe('verdict'); // not still 'throw' at the full 600ms mark
  });

  it('toggling reducedMotion mid-sequence restarts the current scenario at cue with the new timing semantics (no stale option closure)', () => {
    const { result, rerender } = renderHook(
      ({ reducedMotion }: { reducedMotion: boolean }) =>
        useBeatSequencer(scenario('player-hit'), { reducedMotion }),
      { initialProps: { reducedMotion: false } }
    );
    act(() => {
      vi.advanceTimersByTime(150); // cue -> armed
    });
    expect(result.current.beat).toBe('armed');
    act(() => {
      result.current.throwDie();
    });
    expect(result.current.beat).toBe('throw');
    act(() => {
      vi.advanceTimersByTime(300); // mid the full 600ms tumble, not yet resolved
    });
    expect(result.current.beat).toBe('throw');

    // Toggle reducedMotion without changing scenario identity — the
    // in-flight full-tumble throw must NOT resolve on its own stale
    // schedule; the whole scenario restarts from cue under the new
    // timing semantics instead.
    rerender({ reducedMotion: true });
    expect(result.current.beat).toBe('cue');

    act(() => {
      vi.advanceTimersByTime(150); // cue (unaffected by reducedMotion) -> armed
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
});
