import type { IntimidateResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  intimidateFn: vi.fn<() => Promise<IntimidateResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    intimidate: hoisted.intimidateFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionIntimidate } from './useSessionIntimidate';

beforeEach(() => {
  hoisted.intimidateFn.mockReset();
});

describe('useSessionIntimidate', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionIntimidate());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('echoes session/member/target exactly, and sends no selector — the request has no field for one', async () => {
    const fakeResponse = {} as unknown as IntimidateResponse;
    hoisted.intimidateFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionIntimidate());

    let response: IntimidateResponse | undefined;
    await act(async () => {
      response = await result.current.intimidate({
        session: 'enc-1',
        member: 'char-1',
        target: 'goblin-2',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.intimidateFn).toHaveBeenCalledOnce();
    expect(hoisted.intimidateFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      target: 'goblin-2',
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: IntimidateResponse) => void;
    const pendingRpc = new Promise<IntimidateResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.intimidateFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionIntimidate());

    act(() => {
      void result.current.intimidate({
        session: 'enc-1',
        member: 'char-1',
        target: 'goblin-2',
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as IntimidateResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and the promise rejects', async () => {
    // The refusal a player meets most: the target cannot see the actor, so
    // there is nobody to threaten. An outcome the SERVER decides — this hook
    // computes no reach and no sightline of its own.
    const rpcError = new Error('target cannot see the actor');
    hoisted.intimidateFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionIntimidate());

    await act(async () => {
      await expect(
        result.current.intimidate({
          session: 'enc-1',
          member: 'char-1',
          target: 'goblin-2',
        })
      ).rejects.toThrow('target cannot see the actor');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.intimidateFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as IntimidateResponse);

    const { result } = renderHook(() => useSessionIntimidate());

    await act(async () => {
      await expect(
        result.current.intimidate({
          session: 'enc-1',
          member: 'char-1',
          target: 'goblin-2',
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.intimidate({
        session: 'enc-1',
        member: 'char-1',
        target: 'goblin-2',
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('a settled attempt and a paused one settle identically here — the hook reads no verdict off either', async () => {
    // The ruling, at the seam that would be tempted to break it: a threat
    // that landed and one that stopped to ask about a held Guidance are
    // structurally different responses, and this hook handles them with the
    // same code path and returns both whole. Whatever a caller shows after a
    // threat, the OUTCOME is not in here — it arrives on the `intimidated`
    // beat, which the actor reads like everybody else.
    const settled = {
      paused: false,
      saved: { ok: true },
      delivery: { ok: true },
    } as unknown as IntimidateResponse;
    const paused = {
      paused: true,
      roll: 11,
    } as unknown as IntimidateResponse;

    const { result: settledResult } = renderHook(() => useSessionIntimidate());
    let settledResponse: IntimidateResponse | undefined;
    await act(async () => {
      hoisted.intimidateFn.mockResolvedValueOnce(settled);
      settledResponse = await settledResult.current.intimidate({
        session: 'enc-1',
        member: 'char-1',
        target: 'goblin-2',
      });
    });

    const { result: pausedResult } = renderHook(() => useSessionIntimidate());
    let pausedResponse: IntimidateResponse | undefined;
    await act(async () => {
      hoisted.intimidateFn.mockResolvedValueOnce(paused);
      pausedResponse = await pausedResult.current.intimidate({
        session: 'enc-1',
        member: 'char-1',
        target: 'goblin-2',
      });
    });

    expect(settledResponse).toBe(settled);
    expect(pausedResponse).toBe(paused);
    expect(settledResult.current.loading).toBe(false);
    expect(pausedResult.current.loading).toBe(false);
    expect(settledResult.current.error).toBeNull();
    expect(pausedResult.current.error).toBeNull();
  });
});
