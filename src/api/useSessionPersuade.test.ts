import type { PersuadeResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  persuadeFn: vi.fn<() => Promise<PersuadeResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    persuade: hoisted.persuadeFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionPersuade } from './useSessionPersuade';

beforeEach(() => {
  hoisted.persuadeFn.mockReset();
});

describe('useSessionPersuade', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionPersuade());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('echoes session/member/target exactly, and sends no selector — the request has no field for one', async () => {
    const fakeResponse = {} as unknown as PersuadeResponse;
    hoisted.persuadeFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionPersuade());

    let response: PersuadeResponse | undefined;
    await act(async () => {
      response = await result.current.persuade({
        session: 'enc-1',
        member: 'char-1',
        target: 'front-goblin',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.persuadeFn).toHaveBeenCalledOnce();
    expect(hoisted.persuadeFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      target: 'front-goblin',
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: PersuadeResponse) => void;
    const pendingRpc = new Promise<PersuadeResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.persuadeFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionPersuade());

    act(() => {
      void result.current.persuade({
        session: 'enc-1',
        member: 'char-1',
        target: 'front-goblin',
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as PersuadeResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and the promise rejects', async () => {
    // The refusal a player meets most: the creature cannot see the actor, so
    // there is nobody to talk to. An outcome the SERVER decides — this hook
    // computes no reach and no sightline of its own.
    const rpcError = new Error('target cannot see the actor');
    hoisted.persuadeFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionPersuade());

    await act(async () => {
      await expect(
        result.current.persuade({
          session: 'enc-1',
          member: 'char-1',
          target: 'front-goblin',
        })
      ).rejects.toThrow('target cannot see the actor');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.persuadeFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as PersuadeResponse);

    const { result } = renderHook(() => useSessionPersuade());

    await act(async () => {
      await expect(
        result.current.persuade({
          session: 'enc-1',
          member: 'char-1',
          target: 'front-goblin',
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.persuade({
        session: 'enc-1',
        member: 'char-1',
        target: 'front-goblin',
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
    // threat, the OUTCOME is not in here — it arrives on the `persuaded`
    // beat, which the actor reads like everybody else.
    const settled = {
      paused: false,
      saved: { ok: true },
      delivery: { ok: true },
    } as unknown as PersuadeResponse;
    const paused = {
      paused: true,
      roll: 11,
    } as unknown as PersuadeResponse;

    const { result: settledResult } = renderHook(() => useSessionPersuade());
    let settledResponse: PersuadeResponse | undefined;
    await act(async () => {
      hoisted.persuadeFn.mockResolvedValueOnce(settled);
      settledResponse = await settledResult.current.persuade({
        session: 'enc-1',
        member: 'char-1',
        target: 'front-goblin',
      });
    });

    const { result: pausedResult } = renderHook(() => useSessionPersuade());
    let pausedResponse: PersuadeResponse | undefined;
    await act(async () => {
      hoisted.persuadeFn.mockResolvedValueOnce(paused);
      pausedResponse = await pausedResult.current.persuade({
        session: 'enc-1',
        member: 'char-1',
        target: 'front-goblin',
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
