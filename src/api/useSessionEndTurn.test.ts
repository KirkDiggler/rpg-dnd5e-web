import type { EndTurnResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  endTurnFn: vi.fn<() => Promise<EndTurnResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    endTurn: hoisted.endTurnFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionEndTurn } from './useSessionEndTurn';

beforeEach(() => {
  hoisted.endTurnFn.mockReset();
});

describe('useSessionEndTurn', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionEndTurn());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls sessionClient.endTurn with the request shape unchanged (session/member)', async () => {
    const fakeResponse = {
      next: 'skeleton-1',
      roundWrapped: false,
      seq: 2n,
    } as unknown as EndTurnResponse;
    hoisted.endTurnFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionEndTurn());

    let response: EndTurnResponse | undefined;
    await act(async () => {
      response = await result.current.endTurn({
        session: 'enc-1',
        member: 'char-1',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.endTurnFn).toHaveBeenCalledOnce();
    expect(hoisted.endTurnFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: EndTurnResponse) => void;
    const pendingRpc = new Promise<EndTurnResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.endTurnFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionEndTurn());

    act(() => {
      void result.current.endTurn({ session: 'enc-1', member: 'char-1' });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as EndTurnResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure (e.g. not your turn), loading=false, and the promise rejects', async () => {
    const rpcError = new Error(
      'member is not in a fight, or it is not their turn'
    );
    hoisted.endTurnFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionEndTurn());

    await act(async () => {
      await expect(
        result.current.endTurn({ session: 'enc-1', member: 'char-1' })
      ).rejects.toThrow('member is not in a fight, or it is not their turn');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.endTurnFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as EndTurnResponse);

    const { result } = renderHook(() => useSessionEndTurn());

    await act(async () => {
      await expect(
        result.current.endTurn({ session: 'enc-1', member: 'char-1' })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.endTurn({ session: 'enc-1', member: 'char-1' });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
