import type { SearchResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  searchFn: vi.fn<() => Promise<SearchResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    search: hoisted.searchFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionSearch } from './useSessionSearch';

beforeEach(() => {
  hoisted.searchFn.mockReset();
});

describe('useSessionSearch', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionSearch());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('echoes session/member/region exactly, with no selector and no target of its own', async () => {
    const fakeResponse = {} as unknown as SearchResponse;
    hoisted.searchFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionSearch());

    let response: SearchResponse | undefined;
    await act(async () => {
      response = await result.current.search({
        session: 'enc-1',
        member: 'char-1',
        region: 'entrance-hall',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.searchFn).toHaveBeenCalledOnce();
    expect(hoisted.searchFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      region: 'entrance-hall',
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: SearchResponse) => void;
    const pendingRpc = new Promise<SearchResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.searchFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionSearch());

    act(() => {
      void result.current.search({
        session: 'enc-1',
        member: 'char-1',
        region: 'entrance-hall',
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as SearchResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and the promise rejects', async () => {
    const rpcError = new Error('not standing in that region');
    hoisted.searchFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionSearch());

    await act(async () => {
      await expect(
        result.current.search({
          session: 'enc-1',
          member: 'char-1',
          region: 'tomb',
        })
      ).rejects.toThrow('not standing in that region');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.searchFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as SearchResponse);

    const { result } = renderHook(() => useSessionSearch());

    await act(async () => {
      await expect(
        result.current.search({
          session: 'enc-1',
          member: 'char-1',
          region: 'entrance-hall',
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.search({
        session: 'enc-1',
        member: 'char-1',
        region: 'entrance-hall',
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('the resolved value is returned whole, never interpreted — the hook draws no outcome from it (the secrecy law starts here: SearchResponse carries none)', async () => {
    // Two structurally different (but equally valid) resolved values must
    // be handled identically by this hook: it has no branch that could
    // read one differently from the other. Any UI copy shown after a
    // search belongs to the CALLER, which must show it the same way
    // regardless of what came back — see SessionEncounterView's handler.
    const a = { saved: undefined, delivery: undefined } as SearchResponse;
    const b = {
      saved: { ok: true },
      delivery: { ok: true },
    } as unknown as SearchResponse;

    const { result: resultA } = renderHook(() => useSessionSearch());
    let responseA: SearchResponse | undefined;
    await act(async () => {
      hoisted.searchFn.mockResolvedValueOnce(a);
      responseA = await resultA.current.search({
        session: 'enc-1',
        member: 'char-1',
        region: 'entrance-hall',
      });
    });

    const { result: resultB } = renderHook(() => useSessionSearch());
    let responseB: SearchResponse | undefined;
    await act(async () => {
      hoisted.searchFn.mockResolvedValueOnce(b);
      responseB = await resultB.current.search({
        session: 'enc-1',
        member: 'char-1',
        region: 'entrance-hall',
      });
    });

    // Both calls settle the same way: resolved, loading cleared, no error
    // — whatever the payload held.
    expect(responseA).toBe(a);
    expect(responseB).toBe(b);
    expect(resultA.current.loading).toBe(false);
    expect(resultB.current.loading).toBe(false);
    expect(resultA.current.error).toBeNull();
    expect(resultB.current.error).toBeNull();
  });
});
