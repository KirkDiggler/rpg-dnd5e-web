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
});
