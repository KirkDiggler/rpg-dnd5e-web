import type { UnpackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  unpackFn: vi.fn<() => Promise<UnpackResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    unpack: hoisted.unpackFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionUnpack } from './useSessionUnpack';

beforeEach(() => {
  hoisted.unpackFn.mockReset();
});

describe('useSessionUnpack', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionUnpack());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sends session/actor/itemId/quantity through unchanged', async () => {
    const fakeResponse = {
      saved: { savedCharacter: true },
    } as unknown as UnpackResponse;
    hoisted.unpackFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionUnpack());

    let response: UnpackResponse | undefined;
    await act(async () => {
      response = await result.current.unpack({
        session: 'session-1',
        actor: 'char-1',
        itemId: 'explorers-pack',
        quantity: 1,
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.unpackFn).toHaveBeenCalledWith({
      session: 'session-1',
      actor: 'char-1',
      itemId: 'explorers-pack',
      quantity: 1,
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: UnpackResponse) => void;
    const pendingRpc = new Promise<UnpackResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.unpackFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionUnpack());

    act(() => {
      void result.current.unpack({
        session: 'session-1',
        actor: 'char-1',
        itemId: 'explorers-pack',
        quantity: 1,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as UnpackResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and the promise rejects', async () => {
    const rpcError = new Error(
      'actor does not own enough of this item to sell'
    );
    hoisted.unpackFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionUnpack());

    await act(async () => {
      await expect(
        result.current.unpack({
          session: 'session-1',
          actor: 'char-1',
          itemId: 'explorers-pack',
          quantity: 1,
        })
      ).rejects.toThrow('actor does not own enough of this item to sell');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.unpackFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as UnpackResponse);

    const { result } = renderHook(() => useSessionUnpack());

    await act(async () => {
      await expect(
        result.current.unpack({
          session: 'session-1',
          actor: 'char-1',
          itemId: 'explorers-pack',
          quantity: 1,
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.unpack({
        session: 'session-1',
        actor: 'char-1',
        itemId: 'explorers-pack',
        quantity: 1,
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
