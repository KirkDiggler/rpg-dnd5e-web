import type { InteractResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated
const hoisted = vi.hoisted(() => ({
  interactFn: vi.fn<() => Promise<InteractResponse>>(),
}));

vi.mock('./client', () => ({
  encounterClient: {
    interact: hoisted.interactFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useInteract } from './useInteract';

beforeEach(() => {
  hoisted.interactFn.mockReset();
});

describe('useInteract', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useInteract());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls encounterClient.interact with correct request shape', async () => {
    const fakeResponse = {} as InteractResponse;
    hoisted.interactFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useInteract());

    let response: InteractResponse | undefined;
    await act(async () => {
      response = await result.current.interact('enc-1', 'door-east', 'open');
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.interactFn).toHaveBeenCalledOnce();

    expect(hoisted.interactFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        targetEntityId: 'door-east',
        interactionKind: 'open',
      })
    );
  });

  it('omits interactionKind when not provided', async () => {
    hoisted.interactFn.mockResolvedValue({} as InteractResponse);

    const { result } = renderHook(() => useInteract());

    await act(async () => {
      await result.current.interact('enc-1', 'door-east');
    });

    expect(hoisted.interactFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        targetEntityId: 'door-east',
      })
    );
    // The proto Schema leaves optional fields undefined when not passed.
    // Pull the recorded request out via an unknown[] cast to dodge the
    // zero-arg vi.fn signature (kept in lockstep with useMoveEntity.test).
    const calls = hoisted.interactFn.mock.calls as unknown as Array<
      Array<{ interactionKind?: string }>
    >;
    expect(calls[0][0].interactionKind).toBeUndefined();
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: InteractResponse) => void;
    const pendingRpc = new Promise<InteractResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.interactFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useInteract());

    // Kick off the interact without awaiting
    act(() => {
      void result.current.interact('enc-1', 'door-east', 'open');
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    // Resolve the RPC
    act(() => resolveRpc({} as InteractResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('door is locked');
    hoisted.interactFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useInteract());

    await act(async () => {
      await expect(
        result.current.interact('enc-1', 'door-east', 'open')
      ).rejects.toThrow('door is locked');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.interactFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as InteractResponse);

    const { result } = renderHook(() => useInteract());

    // First call fails
    await act(async () => {
      await expect(
        result.current.interact('enc-1', 'door-east', 'open')
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    // Second call succeeds
    await act(async () => {
      await result.current.interact('enc-1', 'door-east', 'open');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
