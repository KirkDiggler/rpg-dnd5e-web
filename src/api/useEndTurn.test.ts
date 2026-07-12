import type { EndTurnResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated
const hoisted = vi.hoisted(() => ({
  endTurnFn: vi.fn<() => Promise<EndTurnResponse>>(),
}));

vi.mock('./client', () => ({
  encounterClient: {
    endTurn: hoisted.endTurnFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useEndTurn } from './useEndTurn';

beforeEach(() => {
  hoisted.endTurnFn.mockReset();
});

describe('useEndTurn', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useEndTurn());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls encounterClient.endTurn with correct request shape', async () => {
    const fakeResponse = {} as EndTurnResponse;
    hoisted.endTurnFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useEndTurn());

    let response: EndTurnResponse | undefined;
    await act(async () => {
      response = await result.current.endTurn('enc-1', 'char-alice');
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.endTurnFn).toHaveBeenCalledOnce();

    expect(hoisted.endTurnFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        entityId: 'char-alice',
      })
    );
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: EndTurnResponse) => void;
    const pendingRpc = new Promise<EndTurnResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.endTurnFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useEndTurn());

    // Kick off the endTurn without awaiting
    act(() => {
      void result.current.endTurn('enc-1', 'char-alice');
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    // Resolve the RPC
    act(() => resolveRpc({} as EndTurnResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('not your turn');
    hoisted.endTurnFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useEndTurn());

    await act(async () => {
      await expect(
        result.current.endTurn('enc-1', 'char-alice')
      ).rejects.toThrow('not your turn');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.endTurnFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as EndTurnResponse);

    const { result } = renderHook(() => useEndTurn());

    // First call fails
    await act(async () => {
      await expect(
        result.current.endTurn('enc-1', 'char-alice')
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    // Second call succeeds
    await act(async () => {
      await result.current.endTurn('enc-1', 'char-alice');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
