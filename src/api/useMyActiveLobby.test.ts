import type { GetMyActiveLobbyResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { LobbyStatus } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/types_pb';
import { renderHook, waitFor } from '@testing-library/react';
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
});
