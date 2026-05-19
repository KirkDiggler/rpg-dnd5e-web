import type { SetReactionReadyResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated. The
// concrete signature is intentionally permissive so the mock.calls tuple
// types preserve the request object index — Vitest's mock-calls tuple is
// derived from the fn's parameter list.
type SetReactionReadyFn = (req: unknown) => Promise<SetReactionReadyResponse>;
const hoisted = vi.hoisted(() => ({
  setReactionReadyFn: vi.fn<SetReactionReadyFn>(),
}));

vi.mock('./client', () => ({
  encounterClientV2: {
    setReactionReady: hoisted.setReactionReadyFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSetReactionReady } from './useSetReactionReady';

beforeEach(() => {
  hoisted.setReactionReadyFn.mockReset();
});

describe('useSetReactionReady', () => {
  it('starts with loading=false, no error, and null lastResponse', () => {
    const { result } = renderHook(() => useSetReactionReady());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastResponse).toBeNull();
  });

  it('builds a request with the canonical {module,type,id} ref triple', async () => {
    const fakeResponse: SetReactionReadyResponse =
      {} as SetReactionReadyResponse;
    hoisted.setReactionReadyFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSetReactionReady());

    await act(async () => {
      await result.current.setReactionReady({
        encounterId: 'enc-1',
        characterId: 'char-wendy',
        reactionRef: { module: 'dnd5e', type: 'spells', id: 'shield' },
        ready: true,
      });
    });

    expect(hoisted.setReactionReadyFn).toHaveBeenCalledOnce();
    const call = hoisted.setReactionReadyFn.mock.calls[0]?.[0] as {
      encounterId: string;
      characterId: string;
      reactionRef?: { module: string; type: string; id: string };
      ready: boolean;
    };
    expect(call.encounterId).toBe('enc-1');
    expect(call.characterId).toBe('char-wendy');
    expect(call.reactionRef?.module).toBe('dnd5e');
    expect(call.reactionRef?.type).toBe('spells');
    expect(call.reactionRef?.id).toBe('shield');
    expect(call.ready).toBe(true);
  });

  it('passes ready=false to unready a reaction', async () => {
    const fakeResponse: SetReactionReadyResponse =
      {} as SetReactionReadyResponse;
    hoisted.setReactionReadyFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSetReactionReady());

    await act(async () => {
      await result.current.setReactionReady({
        encounterId: 'enc-1',
        characterId: 'char-fighter',
        reactionRef: {
          module: 'dnd5e',
          type: 'conditions',
          id: 'opportunity_attack',
        },
        ready: false,
      });
    });

    const call = hoisted.setReactionReadyFn.mock.calls[0]?.[0] as {
      ready: boolean;
    };
    expect(call.ready).toBe(false);
  });

  it('sets lastResponse on success', async () => {
    const fakeResponse: SetReactionReadyResponse =
      {} as SetReactionReadyResponse;
    hoisted.setReactionReadyFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSetReactionReady());

    await act(async () => {
      await result.current.setReactionReady({
        encounterId: 'enc-1',
        characterId: 'char-wendy',
        reactionRef: { module: 'dnd5e', type: 'spells', id: 'shield' },
        ready: true,
      });
    });

    expect(result.current.lastResponse).toBe(fakeResponse);
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: SetReactionReadyResponse) => void;
    const pendingRpc = new Promise<SetReactionReadyResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.setReactionReadyFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSetReactionReady());

    act(() => {
      void result.current.setReactionReady({
        encounterId: 'enc-1',
        characterId: 'char-wendy',
        reactionRef: { module: 'dnd5e', type: 'spells', id: 'shield' },
        ready: true,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as SetReactionReadyResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('character not in encounter');
    hoisted.setReactionReadyFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSetReactionReady());

    await act(async () => {
      await expect(
        result.current.setReactionReady({
          encounterId: 'enc-1',
          characterId: 'char-wendy',
          reactionRef: { module: 'dnd5e', type: 'spells', id: 'shield' },
          ready: true,
        })
      ).rejects.toThrow('character not in encounter');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
    expect(result.current.lastResponse).toBeNull();
  });
});
