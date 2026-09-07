import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLL_FLASH_TTL_MS } from './rollFlash';
import type { CombatExperienceAttackOutcome } from './types';
import { useRollFlash } from './useRollFlash';

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

describe('useRollFlash', () => {
  it('raises a flash when active and a result lands, and drops it when it expires', () => {
    const { result, rerender } = renderHook(
      ({ hit }: { hit?: CombatExperienceAttackOutcome }) =>
        useRollFlash(hit, true),
      {
        initialProps: {
          hit: undefined as CombatExperienceAttackOutcome | undefined,
        },
      }
    );

    expect(result.current).toEqual([]);

    rerender({ hit: outcome('a') });
    expect(result.current).toHaveLength(1);

    act(() => void vi.advanceTimersByTime(ROLL_FLASH_TTL_MS + 1));
    expect(result.current).toEqual([]);
  });

  it('fires on a MISS too, unlike the damage toast', () => {
    const { result } = renderHook(() =>
      useRollFlash(outcome('a', { hit: false }), true)
    );
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.hit).toBe(false);
  });

  it('stays quiet while inactive (`?rollFlash=off`, or the other render target)', () => {
    const { result, rerender } = renderHook(
      ({
        hit,
        active,
      }: {
        hit?: CombatExperienceAttackOutcome;
        active: boolean;
      }) => useRollFlash(hit, active),
      { initialProps: { hit: outcome('a'), active: false } }
    );
    expect(result.current).toEqual([]);

    rerender({ hit: outcome('a'), active: false });
    expect(result.current).toEqual([]);
  });

  it('never announces the same attack twice, however often it re-renders', () => {
    const first = outcome('a');
    const { result, rerender } = renderHook(
      ({ hit }: { hit?: CombatExperienceAttackOutcome }) =>
        useRollFlash(hit, true),
      { initialProps: { hit: first } }
    );
    expect(result.current).toHaveLength(1);

    rerender({ hit: { ...first } });
    rerender({ hit: { ...first } });
    expect(result.current).toHaveLength(1);
  });

  it('caps the stack so a flurry cannot wall off the map', () => {
    const { result, rerender } = renderHook(
      ({ hit }: { hit?: CombatExperienceAttackOutcome }) =>
        useRollFlash(hit, true),
      {
        initialProps: {
          hit: outcome('a') as CombatExperienceAttackOutcome | undefined,
        },
      }
    );
    for (const id of ['b', 'c', 'd', 'e', 'f']) rerender({ hit: outcome(id) });
    expect(result.current).toHaveLength(4);
    expect(result.current.map((flash) => flash.id)).toEqual([
      'c',
      'd',
      'e',
      'f',
    ]);
  });
});
