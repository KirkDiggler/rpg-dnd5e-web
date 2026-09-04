import type { InteractResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  interactFn: vi.fn<() => Promise<InteractResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    interact: hoisted.interactFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionInteract } from './useSessionInteract';

beforeEach(() => {
  hoisted.interactFn.mockReset();
});

describe('useSessionInteract', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionInteract());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('defaults range to 0 (adjacent) when omitted', async () => {
    const fakeResponse = {
      descriptor: { targetId: 'demo-merchant-1', displayName: 'Demo Merchant' },
      seq: 1n,
    } as unknown as InteractResponse;
    hoisted.interactFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionInteract());

    let response: InteractResponse | undefined;
    await act(async () => {
      response = await result.current.interact({
        session: 'session-1',
        actor: 'char-1',
        target: 'demo-merchant-1',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.interactFn).toHaveBeenCalledWith({
      session: 'session-1',
      actor: 'char-1',
      target: 'demo-merchant-1',
      range: 0,
    });
  });

  it('passes an explicit range through unchanged', async () => {
    hoisted.interactFn.mockResolvedValue({} as InteractResponse);
    const { result } = renderHook(() => useSessionInteract());

    await act(async () => {
      await result.current.interact({
        session: 'session-1',
        actor: 'char-1',
        target: 'demo-merchant-1',
        range: 3,
      });
    });

    expect(hoisted.interactFn).toHaveBeenCalledWith({
      session: 'session-1',
      actor: 'char-1',
      target: 'demo-merchant-1',
      range: 3,
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: InteractResponse) => void;
    const pendingRpc = new Promise<InteractResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.interactFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionInteract());

    act(() => {
      void result.current.interact({
        session: 'session-1',
        actor: 'char-1',
        target: 'demo-merchant-1',
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as InteractResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and the promise rejects', async () => {
    const rpcError = new Error('target out of range');
    hoisted.interactFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionInteract());

    await act(async () => {
      await expect(
        result.current.interact({
          session: 'session-1',
          actor: 'char-1',
          target: 'demo-merchant-1',
        })
      ).rejects.toThrow('target out of range');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.interactFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as InteractResponse);

    const { result } = renderHook(() => useSessionInteract());

    await act(async () => {
      await expect(
        result.current.interact({
          session: 'session-1',
          actor: 'char-1',
          target: 'demo-merchant-1',
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.interact({
        session: 'session-1',
        actor: 'char-1',
        target: 'demo-merchant-1',
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
