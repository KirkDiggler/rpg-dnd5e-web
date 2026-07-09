import { create } from '@bufbuild/protobuf';
import type { CreateLobbyResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { CreateLobbyRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { lobbyClient } from './client';

export interface UseCreateLobbyInput {
  campaignId: string;
  characterId: string;
}

export interface UseCreateLobbyResult {
  /**
   * Calls CreateLobby. The caller becomes host and binds characterId as
   * their seat. Returns {lobbyId, joinRef, hostPlayerId} — joinRef is the
   * opaque dev-carrier value other players supply to JoinLobby (URL param
   * or displayed short code).
   */
  createLobby: (input: UseCreateLobbyInput) => Promise<CreateLobbyResponse>;
  loading: boolean;
  error: Error | null;
}

/** Thin wrapper around the LobbyService CreateLobby unary RPC. */
export function useCreateLobby(): UseCreateLobbyResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createLobby = useCallback(
    async (input: UseCreateLobbyInput): Promise<CreateLobbyResponse> => {
      setLoading(true);
      setError(null);

      const request = create(CreateLobbyRequestSchema, {
        campaignId: input.campaignId,
        characterId: input.characterId,
      });

      try {
        const response = await lobbyClient.createLobby(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('CreateLobby RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { createLobby, loading, error };
}
