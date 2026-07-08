import { create } from '@bufbuild/protobuf';
import type { JoinLobbyResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { JoinLobbyRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { lobbyClient } from './client';

export interface UseJoinLobbyInput {
  /** Opaque ref minted at CreateLobby — the dev carrier is a URL param or entered short code. */
  joinRef: string;
  characterId: string;
}

export interface UseJoinLobbyResult {
  /**
   * Calls JoinLobby. Idempotent and rebinding — a player already in the
   * lobby who calls again (reconnect, second tab, re-pick character) has
   * characterId rebound rather than erroring. Returns FailedPrecondition
   * if the lobby already STARTED or the party is at cap.
   */
  joinLobby: (input: UseJoinLobbyInput) => Promise<JoinLobbyResponse>;
  loading: boolean;
  error: Error | null;
}

/** Thin wrapper around the LobbyService JoinLobby unary RPC. */
export function useJoinLobby(): UseJoinLobbyResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const joinLobby = useCallback(
    async (input: UseJoinLobbyInput): Promise<JoinLobbyResponse> => {
      setLoading(true);
      setError(null);

      const request = create(JoinLobbyRequestSchema, {
        joinRef: input.joinRef,
        characterId: input.characterId,
      });

      try {
        const response = await lobbyClient.joinLobby(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('JoinLobby RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { joinLobby, loading, error };
}
