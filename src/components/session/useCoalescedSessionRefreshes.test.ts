import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type SessionRefreshCallbacks,
  useCoalescedSessionRefreshes,
} from './useCoalescedSessionRefreshes';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function callbacksWith(
  overrides: Partial<SessionRefreshCallbacks> = {}
): SessionRefreshCallbacks {
  const resolved = () => Promise.resolve();
  return {
    characterData: resolved,
    turn: resolved,
    afford: resolved,
    view: resolved,
    where: resolved,
    roster: resolved,
    doors: resolved,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCoalescedSessionRefreshes', () => {
  it('serializes refresh passes and immediately drains one coalesced trailing burst', async () => {
    const first = deferred();
    const turn = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const afford = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCoalescedSessionRefreshes(
        'enc-1\u0000char-1',
        callbacksWith({ turn, afford })
      )
    );

    act(() => result.current(['turn']));
    await act(async () => vi.runOnlyPendingTimers());
    expect(turn).toHaveBeenCalledTimes(1);

    // These invalidations arrive while the first server snapshot is pending.
    // They must not overlap it, and duplicates belong to one trailing pass.
    act(() => {
      result.current(['turn']);
      result.current(['turn', 'afford']);
    });
    await act(async () => vi.runOnlyPendingTimers());
    expect(turn).toHaveBeenCalledTimes(1);
    expect(afford).not.toHaveBeenCalled();

    await act(async () => {
      first.resolve();
      await first.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(turn).toHaveBeenCalledTimes(2);
    expect(afford).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('makes retained schedulers and queued timers inert after scope change or unmount', async () => {
    const turn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { result, rerender, unmount } = renderHook(
      ({ scope }) =>
        useCoalescedSessionRefreshes(scope, callbacksWith({ turn })),
      { initialProps: { scope: 'enc-1\u0000char-1' } }
    );
    const oldScopeSchedule = result.current;

    rerender({ scope: 'enc-2\u0000char-2' });
    act(() => oldScopeSchedule(['turn']));
    await act(async () => vi.runOnlyPendingTimers());
    expect(turn).not.toHaveBeenCalled();

    const unmountedSchedule = result.current;
    act(() => unmountedSchedule(['turn']));
    unmount();
    act(() => unmountedSchedule(['turn']));
    await act(async () => vi.runOnlyPendingTimers());
    expect(turn).not.toHaveBeenCalled();
  });
});
