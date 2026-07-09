import { create } from '@bufbuild/protobuf';
import type { SetReadyResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { SetReadyRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { lobbyClient } from './client';

export interface UseSetLobbyReadyInput {
  lobbyId: string;
  ready: boolean;
}

export interface UseSetLobbyReadyResult {
  /**
   * Calls SetReady. Toggles the caller's ready flag; the server broadcasts
   * member_ready on StreamLobby — the response itself is a lean ack, so
   * callers read the new state back off the stream, not this return value.
   */
  setReady: (input: UseSetLobbyReadyInput) => Promise<SetReadyResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the LobbyService SetReady unary RPC. Named
 * useSetLobbyReady (not useSetReady) to stay distinguishable from the
 * v1alpha1 useSetReady in lobbyHooks.ts, which LobbyView still uses.
 */
export function useSetLobbyReady(): UseSetLobbyReadyResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const setReady = useCallback(
    async (input: UseSetLobbyReadyInput): Promise<SetReadyResponse> => {
      setLoading(true);
      setError(null);

      const request = create(SetReadyRequestSchema, {
        lobbyId: input.lobbyId,
        ready: input.ready,
      });

      try {
        const response = await lobbyClient.setReady(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('SetReady RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { setReady, loading, error };
}
