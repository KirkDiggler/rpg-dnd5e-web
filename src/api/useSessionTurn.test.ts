import type { TurnResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  ClockKind,
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  turnFn: vi.fn<() => Promise<TurnResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    turn: hoisted.turnFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionTurn } from './useSessionTurn';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  hoisted.turnFn.mockReset();
});

describe('useSessionTurn', () => {
  it('does not call Turn on mount — the caller owns every fetch via refetch', () => {
    const { result } = renderHook(() => useSessionTurn('enc-1', 'char-1'));
    expect(hoisted.turnFn).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.clock).toBe(ClockKind.UNSPECIFIED);
    expect(result.current.active).toBe('');
    expect(result.current.round).toBe(0);
    expect(result.current.order).toEqual([]);
    expect(result.current.participants).toEqual([]);
  });

  it('refetch is a no-op while session or member is empty', async () => {
    const { result: noSession } = renderHook(() =>
      useSessionTurn('', 'char-1')
    );
    const { result: noMember } = renderHook(() => useSessionTurn('enc-1', ''));
    await act(async () => {
      await noSession.current.refetch();
      await noMember.current.refetch();
    });
    expect(hoisted.turnFn).not.toHaveBeenCalled();
    expect(noSession.current.loading).toBe(false);
    expect(noSession.current.clock).toBe(ClockKind.UNSPECIFIED);
  });

  it('refetch calls Turn for the given session/member and stores clock/active/round/order/participants', async () => {
    const participants = [
      {
        member: 'char-1',
        name: 'Aldric',
        kind: MemberKind.PLAYER,
        standing: Standing.UP,
        active: true,
      },
      {
        member: 'skeleton-1',
        name: 'skeleton-1',
        kind: MemberKind.MONSTER,
        standing: Standing.UP,
        active: false,
      },
    ] as unknown as TurnResponse['participants'];
    hoisted.turnFn.mockResolvedValue({
      clock: ClockKind.TURN,
      active: 'char-1',
      round: 1,
      order: ['char-1', 'skeleton-1'],
      participants,
    } as unknown as TurnResponse);

    const { result } = renderHook(() => useSessionTurn('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });

    expect(hoisted.turnFn).toHaveBeenCalledTimes(1);
    expect(hoisted.turnFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
    });
    expect(result.current.clock).toBe(ClockKind.TURN);
    expect(result.current.active).toBe('char-1');
    expect(result.current.round).toBe(1);
    expect(result.current.order).toEqual(['char-1', 'skeleton-1']);
    expect(result.current.participants).toEqual(participants);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('a world-clock response resolves to empty active/zero round/empty order, not an error', async () => {
    hoisted.turnFn.mockResolvedValue({
      clock: ClockKind.WORLD,
      active: '',
      round: 0,
      order: [],
    } as unknown as TurnResponse);

    const { result } = renderHook(() => useSessionTurn('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.clock).toBe(ClockKind.WORLD);
    expect(result.current.active).toBe('');
    expect(result.current.order).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sets error on RPC failure, loading=false, and clock/active/round/order stay at their unfetched defaults on the FIRST fetch', async () => {
    const rpcError = new Error('transport error');
    hoisted.turnFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionTurn('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBe(rpcError);
    expect(result.current.clock).toBe(ClockKind.UNSPECIFIED);
    expect(result.current.active).toBe('');
    expect(result.current.round).toBe(0);
    expect(result.current.order).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('KEEPS the last-good clock/active/round/order on a refetch error, same last-good discipline as useSessionAfford', async () => {
    hoisted.turnFn
      .mockResolvedValueOnce({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 2,
        order: ['char-1', 'skeleton-1'],
      } as unknown as TurnResponse)
      .mockRejectedValueOnce(new Error('transport error'));

    const { result } = renderHook(() => useSessionTurn('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.active).toBe('char-1');
    expect(result.current.round).toBe(2);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).not.toBeNull();
    // The LAST GOOD answer, not cleared.
    expect(result.current.clock).toBe(ClockKind.TURN);
    expect(result.current.active).toBe('char-1');
    expect(result.current.round).toBe(2);
    expect(result.current.order).toEqual(['char-1', 'skeleton-1']);
  });

  it('clears clock/active/round/order/error when session/member becomes empty', async () => {
    hoisted.turnFn.mockResolvedValue({
      clock: ClockKind.TURN,
      active: 'char-1',
      round: 1,
      order: ['char-1'],
    } as unknown as TurnResponse);
    const { result, rerender } = renderHook(
      ({ session, member }) => useSessionTurn(session, member),
      { initialProps: { session: 'enc-1', member: 'char-1' } }
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.clock).toBe(ClockKind.TURN);

    rerender({ session: 'enc-1', member: '' });
    expect(result.current.clock).toBe(ClockKind.UNSPECIFIED);
    expect(result.current.active).toBe('');
    expect(result.current.round).toBe(0);
    expect(result.current.order).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('publishes only the newest overlapping response for the current key', async () => {
    const older = deferred<TurnResponse>();
    const newer = deferred<TurnResponse>();
    hoisted.turnFn
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const { result } = renderHook(() => useSessionTurn('enc-1', 'char-1'));
    let olderRead!: Promise<void>;
    let newerRead!: Promise<void>;
    act(() => {
      olderRead = result.current.refetch();
      newerRead = result.current.refetch();
    });

    await act(async () => {
      newer.resolve({
        clock: ClockKind.WORLD,
        active: '',
        round: 0,
        order: [],
        participants: [],
      } as unknown as TurnResponse);
      await newerRead;
    });
    expect(result.current.clock).toBe(ClockKind.WORLD);

    await act(async () => {
      older.resolve({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 9,
        order: ['char-1'],
        participants: [],
      } as unknown as TurnResponse);
      await olderRead;
    });

    expect(result.current.clock).toBe(ClockKind.WORLD);
    expect(result.current.active).toBe('');
    expect(result.current.round).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('fences a late response from a previous nonempty session/member key', async () => {
    const oldKey = deferred<TurnResponse>();
    hoisted.turnFn.mockReturnValueOnce(oldKey.promise);
    const { result, rerender } = renderHook(
      ({ session, member }) => useSessionTurn(session, member),
      { initialProps: { session: 'enc-1', member: 'char-1' } }
    );

    let staleRead!: Promise<void>;
    act(() => {
      staleRead = result.current.refetch();
    });
    rerender({ session: 'enc-2', member: 'char-2' });

    await act(async () => {
      oldKey.resolve({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 4,
        order: ['char-1'],
        participants: [],
      } as unknown as TurnResponse);
      await staleRead;
    });

    expect(result.current.clock).toBe(ClockKind.UNSPECIFIED);
    expect(result.current.active).toBe('');
    expect(result.current.round).toBe(0);
    expect(result.current.order).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('refetch re-calls Turn and can recover from a previous error', async () => {
    hoisted.turnFn
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce({
        clock: ClockKind.WORLD,
        active: '',
        round: 0,
        order: [],
      } as unknown as TurnResponse);

    const { result } = renderHook(() => useSessionTurn('enc-1', 'char-1'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.refetch();
    });

    expect(hoisted.turnFn).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.clock).toBe(ClockKind.WORLD);
  });
});
