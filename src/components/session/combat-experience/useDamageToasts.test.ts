import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAMAGE_TOAST_TTL_MS } from './damageToasts';
import type { CombatExperienceAttackOutcome } from './types';
import { useDamageToasts } from './useDamageToasts';

function outcome(
  attackId: string,
  overrides: Partial<CombatExperienceAttackOutcome> = {}
): CombatExperienceAttackOutcome {
  return {
    attackId,
    actor: 'Aldric',
    target: 'Skeleton Guard',
    action: 'Longsword',
    d20: 12,
    total: 17,
    against: 13,
    hit: true,
    critical: false,
    damage: 8,
    damageType: 'slashing',
    targetIsViewer: false,
    ...overrides,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDamageToasts', () => {
  it('raises a toast when a hit is revealed, and drops it when it expires', () => {
    const { result, rerender } = renderHook(
      ({ hit }: { hit?: CombatExperienceAttackOutcome }) =>
        useDamageToasts(hit),
      {
        initialProps: {
          hit: undefined as CombatExperienceAttackOutcome | undefined,
        },
      }
    );

    expect(result.current).toEqual([]);

    rerender({ hit: outcome('a') });
    expect(result.current).toHaveLength(1);

    act(() => void vi.advanceTimersByTime(DAMAGE_TOAST_TTL_MS + 1));
    expect(result.current).toEqual([]);
  });

  it('never announces the same attack twice, however often it re-renders', () => {
    const first = outcome('a');
    const { result, rerender } = renderHook(
      ({ hit }: { hit?: CombatExperienceAttackOutcome }) =>
        useDamageToasts(hit),
      { initialProps: { hit: first } }
    );
    expect(result.current).toHaveLength(1);

    // Same attack, a fresh object identity — a refetch or catch-up replay.
    rerender({ hit: { ...first } });
    rerender({ hit: { ...first } });
    expect(result.current).toHaveLength(1);
  });

  it('expires the FIRST toast even when a second lands on top of it', () => {
    // The regression this hook is shaped around: owning expiry timers in the
    // effect's cleanup would clear the pending timer every time a new result
    // arrived, and the earlier toast would hang on screen forever.
    const { result, rerender } = renderHook(
      ({ hit }: { hit?: CombatExperienceAttackOutcome }) =>
        useDamageToasts(hit),
      {
        initialProps: {
          hit: outcome('a') as CombatExperienceAttackOutcome | undefined,
        },
      }
    );

    act(() => void vi.advanceTimersByTime(DAMAGE_TOAST_TTL_MS / 2));
    rerender({ hit: outcome('b') });
    expect(result.current.map((toast) => toast.id)).toEqual(['a', 'b']);

    // Enough for 'a' to age out, but not 'b'.
    act(() => void vi.advanceTimersByTime(DAMAGE_TOAST_TTL_MS / 2 + 1));
    expect(result.current.map((toast) => toast.id)).toEqual(['b']);

    act(() => void vi.advanceTimersByTime(DAMAGE_TOAST_TTL_MS));
    expect(result.current).toEqual([]);
  });

  it('caps the stack so a flurry cannot wall off the map', () => {
    const { result, rerender } = renderHook(
      ({ hit }: { hit?: CombatExperienceAttackOutcome }) =>
        useDamageToasts(hit),
      {
        initialProps: {
          hit: outcome('a') as CombatExperienceAttackOutcome | undefined,
        },
      }
    );
    for (const id of ['b', 'c', 'd', 'e', 'f']) rerender({ hit: outcome(id) });
    expect(result.current).toHaveLength(4);
    expect(result.current.map((toast) => toast.id)).toEqual([
      'c',
      'd',
      'e',
      'f',
    ]);
  });

  it('stays quiet for a miss', () => {
    const { result } = renderHook(() =>
      useDamageToasts(outcome('a', { hit: false, damage: undefined }))
    );
    expect(result.current).toEqual([]);
  });

  it('keeps only PENDING timers, so a long fight does not accumulate handles', () => {
    // The array is internal, so observe it through what unmount has left to
    // clean up: once every toast has expired there should be nothing pending.
    // Before the fix, spent handles were never removed and unmount cleared all
    // of them — holding each fired closure alive for the whole fight.
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { rerender, unmount } = renderHook(
      ({ hit }: { hit?: CombatExperienceAttackOutcome }) =>
        useDamageToasts(hit),
      {
        initialProps: {
          hit: outcome('a') as CombatExperienceAttackOutcome | undefined,
        },
      }
    );
    for (const id of ['b', 'c', 'd']) rerender({ hit: outcome(id) });

    act(() => void vi.advanceTimersByTime(DAMAGE_TOAST_TTL_MS + 1));
    clearSpy.mockClear();
    unmount();

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('still clears a timer that has NOT fired when the surface unmounts', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderHook(() => useDamageToasts(outcome('a')));

    clearSpy.mockClear();
    unmount();

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});
