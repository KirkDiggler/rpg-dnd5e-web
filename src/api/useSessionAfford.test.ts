import type { AffordResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { ClockKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  affordFn: vi.fn<() => Promise<AffordResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    afford: hoisted.affordFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionAfford } from './useSessionAfford';

beforeEach(() => {
  hoisted.affordFn.mockReset();
});

describe('useSessionAfford', () => {
  it('does not call Afford on mount — the caller owns every fetch via refetch', () => {
    const { result } = renderHook(() => useSessionAfford('enc-1', 'char-1'));
    expect(hoisted.affordFn).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.clock).toBe(ClockKind.UNSPECIFIED);
    expect(result.current.declarations).toEqual([]);
  });

  it('refetch is a no-op while session or member is empty', async () => {
    const { result: noSession } = renderHook(() =>
      useSessionAfford('', 'char-1')
    );
    const { result: noMember } = renderHook(() =>
      useSessionAfford('enc-1', '')
    );
    await act(async () => {
      await noSession.current.refetch();
      await noMember.current.refetch();
    });
    expect(hoisted.affordFn).not.toHaveBeenCalled();
    expect(noSession.current.loading).toBe(false);
    expect(noSession.current.clock).toBe(ClockKind.UNSPECIFIED);
  });

  it('refetch calls Afford for the given session/member and stores clock/declarations', async () => {
    hoisted.affordFn.mockResolvedValue({
      clock: ClockKind.WORLD,
      declarations: [],
    } as unknown as AffordResponse);

    const { result } = renderHook(() => useSessionAfford('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });

    expect(hoisted.affordFn).toHaveBeenCalledTimes(1);
    expect(hoisted.affordFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
    });
    expect(result.current.clock).toBe(ClockKind.WORLD);
    expect(result.current.declarations).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('stores generated nested declarations directly without expanding candidate rows', async () => {
    const declarations = [
      {
        verb: 1,
        slot: 2,
        available: false,
        candidates: [],
        why: { text: 'action: 1 needed, 0 left' },
      },
      {
        verb: 2,
        slot: 1,
        available: true,
        candidates: [
          { member: 'gob-1', available: true },
          {
            member: 'gob-2',
            available: false,
            why: { text: 'out of reach' },
          },
        ],
      },
    ];
    hoisted.affordFn.mockResolvedValue({
      clock: ClockKind.TURN,
      declarations,
    } as unknown as AffordResponse);

    const { result } = renderHook(() => useSessionAfford('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.clock).toBe(ClockKind.TURN);
    expect(result.current.declarations).toBe(declarations);
  });

  it('sets error on RPC failure, loading=false, and clock/declarations stay at their unfetched defaults on the FIRST fetch', async () => {
    const rpcError = new Error('transport error');
    hoisted.affordFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionAfford('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBe(rpcError);
    expect(result.current.clock).toBe(ClockKind.UNSPECIFIED);
    expect(result.current.declarations).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('KEEPS the last-good clock/declarations on a refetch error, unlike useSessionWhere/useSessionView (the slice-4 last-good lesson)', async () => {
    const declarations = [
      { verb: 1, slot: 2, available: true, candidates: [] },
    ];
    hoisted.affordFn
      .mockResolvedValueOnce({
        clock: ClockKind.TURN,
        declarations,
      } as unknown as AffordResponse)
      .mockRejectedValueOnce(new Error('transport error'));

    const { result } = renderHook(() => useSessionAfford('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.clock).toBe(ClockKind.TURN);
    expect(result.current.declarations).toBe(declarations);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).not.toBeNull();
    // The LAST GOOD answer, not cleared — this is the divergence from
    // useSessionWhere/useSessionView, documented on the hook itself.
    expect(result.current.clock).toBe(ClockKind.TURN);
    expect(result.current.declarations).toBe(declarations);
  });

  it('clears clock/declarations/error when session/member becomes empty', async () => {
    hoisted.affordFn.mockResolvedValue({
      clock: ClockKind.TURN,
      declarations: [{ verb: 1, slot: 2, affordable: true, shortfall: '' }],
    } as unknown as AffordResponse);
    const { result, rerender } = renderHook(
      ({ session, member }) => useSessionAfford(session, member),
      { initialProps: { session: 'enc-1', member: 'char-1' } }
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.clock).toBe(ClockKind.TURN);

    rerender({ session: 'enc-1', member: '' });
    expect(result.current.clock).toBe(ClockKind.UNSPECIFIED);
    expect(result.current.declarations).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('refetch re-calls Afford and can recover from a previous error', async () => {
    hoisted.affordFn
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce({
        clock: ClockKind.WORLD,
        declarations: [],
      } as unknown as AffordResponse);

    const { result } = renderHook(() => useSessionAfford('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.refetch();
    });

    expect(hoisted.affordFn).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.clock).toBe(ClockKind.WORLD);
  });
});
