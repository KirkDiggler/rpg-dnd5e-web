import type { GetMyActiveLobbyResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { LobbyStatus } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/types_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMyActiveLobbyFn: vi.fn<() => Promise<GetMyActiveLobbyResponse>>(),
}));

vi.mock('./client', () => ({
  lobbyClient: {
    getMyActiveLobby: hoisted.getMyActiveLobbyFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useMyActiveLobby } from './useMyActiveLobby';

beforeEach(() => {
  hoisted.getMyActiveLobbyFn.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useMyActiveLobby', () => {
  it('does not call the RPC while playerId is null', () => {
    renderHook(() => useMyActiveLobby(null));
    expect(hoisted.getMyActiveLobbyFn).not.toHaveBeenCalled();
  });

  it('calls GetMyActiveLobby once playerId becomes available, with no request fields', async () => {
    hoisted.getMyActiveLobbyFn.mockResolvedValue({
      lobbyId: '',
      encounterId: '',
      lobbyStatus: LobbyStatus.UNSPECIFIED,
    } as GetMyActiveLobbyResponse);

    const { rerender } = renderHook(
      ({ playerId }: { playerId: string | null }) => useMyActiveLobby(playerId),
      { initialProps: { playerId: null as string | null } }
    );
    expect(hoisted.getMyActiveLobbyFn).not.toHaveBeenCalled();

    rerender({ playerId: 'alice' });

    await waitFor(() =>
      expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledOnce()
    );
    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledWith(
      expect.objectContaining({})
    );
  });

  it('does not refire on a rerender with the same playerId', async () => {
    hoisted.getMyActiveLobbyFn.mockResolvedValue({
      lobbyId: '',
      encounterId: '',
      lobbyStatus: LobbyStatus.UNSPECIFIED,
    } as GetMyActiveLobbyResponse);

    const { rerender } = renderHook(
      ({ playerId }: { playerId: string | null }) => useMyActiveLobby(playerId),
      { initialProps: { playerId: 'alice' } }
    );

    await waitFor(() =>
      expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledOnce()
    );

    rerender({ playerId: 'alice' });
    rerender({ playerId: 'alice' });

    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledOnce();
  });

  it('populates data with lobbyId/encounterId/lobbyStatus on success', async () => {
    hoisted.getMyActiveLobbyFn.mockResolvedValue({
      lobbyId: 'lobby-1',
      encounterId: 'enc-1',
      lobbyStatus: LobbyStatus.STARTED,
    } as GetMyActiveLobbyResponse);

    const { result } = renderHook(() => useMyActiveLobby('alice'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual({
      lobbyId: 'lobby-1',
      encounterId: 'enc-1',
      lobbyStatus: LobbyStatus.STARTED,
    });
    expect(result.current.error).toBeNull();
  });

  it('sets loading=true during the call and false after it resolves', async () => {
    let resolveRpc!: (v: GetMyActiveLobbyResponse) => void;
    const pending = new Promise<GetMyActiveLobbyResponse>((resolve) => {
      resolveRpc = resolve;
    });
    hoisted.getMyActiveLobbyFn.mockReturnValue(pending);

    const { result } = renderHook(() => useMyActiveLobby('alice'));

    await waitFor(() => expect(result.current.loading).toBe(true));

    resolveRpc({
      lobbyId: '',
      encounterId: '',
      lobbyStatus: LobbyStatus.UNSPECIFIED,
    } as GetMyActiveLobbyResponse);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, data stays null', async () => {
    const rpcError = new Error('transport error');
    hoisted.getMyActiveLobbyFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useMyActiveLobby('alice'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(rpcError);
    expect(result.current.data).toBeNull();
  });

  it('refetches and clears stale data when playerId changes to a different identity', async () => {
    hoisted.getMyActiveLobbyFn
      .mockResolvedValueOnce({
        lobbyId: 'lobby-alice',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse)
      .mockResolvedValueOnce({
        lobbyId: 'lobby-bob',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse);

    const { result, rerender } = renderHook(
      ({ playerId }: { playerId: string | null }) => useMyActiveLobby(playerId),
      { initialProps: { playerId: 'alice' as string | null } }
    );

    await waitFor(() =>
      expect(result.current.data?.lobbyId).toBe('lobby-alice')
    );

    rerender({ playerId: 'bob' });

    // A playerId change (dev override switch, or Discord auth arriving over
    // an initial fallback id) must not keep resolving/showing the PREVIOUS
    // identity's session while the new lookup is in flight.
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data?.lobbyId).toBe('lobby-bob'));
    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(2);
  });

  it('loading is true synchronously on the render where a known playerId first triggers the lookup, not just after an effect', () => {
    hoisted.getMyActiveLobbyFn.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useMyActiveLobby('alice'));

    // No waitFor: this must already be true on the very first render, so a
    // caller gating "hold render until this resolves" never sees a false
    // negative before the fetch effect even runs (App.tsx's Home hold-gate,
    // Copilot review on #461).
    expect(result.current.loading).toBe(true);
  });

  it('treats the same player in a different identity scope as a new lookup', async () => {
    hoisted.getMyActiveLobbyFn
      .mockResolvedValueOnce({
        lobbyId: 'lobby-world-a',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse)
      .mockResolvedValueOnce({
        lobbyId: 'lobby-world-b',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse);

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useMyActiveLobby('alice', scope),
      { initialProps: { scope: 'game:world-a' } }
    );

    await waitFor(() =>
      expect(result.current.data?.lobbyId).toBe('lobby-world-a')
    );

    rerender({ scope: 'game:world-b' });

    // The same player in another world must not keep showing the previous
    // world's resume target while the new lookup is in flight.
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitFor(() =>
      expect(result.current.data?.lobbyId).toBe('lobby-world-b')
    );
    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(2);
  });

  it('releases a late answer from the previous identity scope instead of publishing it', async () => {
    let resolveWorldA!: (value: GetMyActiveLobbyResponse) => void;
    const pendingWorldA = new Promise<GetMyActiveLobbyResponse>((resolve) => {
      resolveWorldA = resolve;
    });
    hoisted.getMyActiveLobbyFn
      .mockReturnValueOnce(pendingWorldA)
      .mockResolvedValueOnce({
        lobbyId: 'lobby-world-b',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse);

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useMyActiveLobby('alice', scope),
      { initialProps: { scope: 'game:world-a' } }
    );
    await waitFor(() => expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalled());

    rerender({ scope: 'game:world-b' });
    await waitFor(() =>
      expect(result.current.data?.lobbyId).toBe('lobby-world-b')
    );

    // World A's response arrives after the identity moved on: it must be
    // dropped, not written into B's state (no A state on the next render).
    await act(async () => {
      resolveWorldA({
        lobbyId: 'lobby-world-a',
        encounterId: 'enc-a',
        lobbyStatus: LobbyStatus.STARTED,
      } as GetMyActiveLobbyResponse);
      await pendingWorldA;
    });

    expect(result.current.data?.lobbyId).toBe('lobby-world-b');
    expect(result.current.data?.encounterId).toBe('');
    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(2);
  });

  it('re-fires when a scope is revisited after another scope (A→B→A) instead of deadlocking', async () => {
    hoisted.getMyActiveLobbyFn
      .mockResolvedValueOnce({
        lobbyId: 'lobby-a1',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse)
      .mockResolvedValueOnce({
        lobbyId: 'lobby-b',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse)
      .mockResolvedValueOnce({
        lobbyId: 'lobby-a2',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse);

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useMyActiveLobby('alice', scope),
      { initialProps: { scope: 'game:world-a' } }
    );
    await waitFor(() => expect(result.current.data?.lobbyId).toBe('lobby-a1'));

    rerender({ scope: 'game:world-b' });
    await waitFor(() => expect(result.current.data?.lobbyId).toBe('lobby-b'));

    rerender({ scope: 'game:world-a' });
    // The dedupe mark holds the LAST fired key (B), so returning to A is a new
    // lookup — not a skipped effect with `loading` stuck true forever.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data?.lobbyId).toBe('lobby-a2'));
    expect(result.current.loading).toBe(false);
    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(3);
  });

  it('keeps the same-scope answer (and a settled loading) across a null readiness gap', async () => {
    hoisted.getMyActiveLobbyFn.mockResolvedValue({
      lobbyId: 'lobby-a1',
      encounterId: '',
      lobbyStatus: LobbyStatus.WAITING,
    } as GetMyActiveLobbyResponse);

    const { result, rerender } = renderHook(
      ({ playerId }: { playerId: string | null }) =>
        useMyActiveLobby(playerId, 'game:world-a'),
      { initialProps: { playerId: 'alice' as string | null } }
    );
    await waitFor(() => expect(result.current.data?.lobbyId).toBe('lobby-a1'));

    rerender({ playerId: null });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);

    // Same player, same scope: the lookup is deliberately not re-fired (the
    // documented once-per-identity behavior), and it is already settled, so
    // there is no stuck load.
    rerender({ playerId: 'alice' });
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.lobbyId).toBe('lobby-a1');
    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(1);
  });

  it('drops a superseded same-scope answer instead of letting it overwrite the live one', async () => {
    const heldFirstWorldA = deferred<GetMyActiveLobbyResponse>();
    hoisted.getMyActiveLobbyFn
      .mockReturnValueOnce(heldFirstWorldA.promise)
      .mockResolvedValueOnce({
        lobbyId: 'lobby-b',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse)
      .mockResolvedValueOnce({
        lobbyId: 'lobby-a2-live',
        encounterId: '',
        lobbyStatus: LobbyStatus.WAITING,
      } as GetMyActiveLobbyResponse);

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useMyActiveLobby('alice', scope),
      { initialProps: { scope: 'game:world-a' } }
    );
    await waitFor(() =>
      expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(1)
    );

    rerender({ scope: 'game:world-b' });
    await waitFor(() => expect(result.current.data?.lobbyId).toBe('lobby-b'));

    // Back to A: this fires a NEW lookup for the same key, so the first A
    // request is superseded even though it shares the key.
    rerender({ scope: 'game:world-a' });
    await waitFor(() =>
      expect(result.current.data?.lobbyId).toBe('lobby-a2-live')
    );

    await act(async () => {
      heldFirstWorldA.resolve({
        lobbyId: 'lobby-a1-stale',
        encounterId: 'enc-a1-stale',
        lobbyStatus: LobbyStatus.STARTED,
      } as GetMyActiveLobbyResponse);
      await heldFirstWorldA.promise;
    });

    // The older same-key answer must not overwrite the live one, and it must
    // not mark the live lookup resolved while it is still in flight.
    expect(result.current.data?.lobbyId).toBe('lobby-a2-live');
    expect(result.current.loading).toBe(false);
    expect(hoisted.getMyActiveLobbyFn).toHaveBeenCalledTimes(3);
  });
});
