import { create } from '@bufbuild/protobuf';
import type { StartEncounterResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { StartEncounterRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { lobbyClient } from './client';

export interface UseStartLobbyEncounterInput {
  lobbyId: string;
  /**
   * Selects which authored dungeon to build the encounter from (rpg-project#131,
   * fed by the lobby's DungeonPicker / useListDungeons). Omitted or empty
   * defers to the server's existing caller -> env -> default precedence
   * (`StartEncounterInput.DungeonKey`) — unchanged behavior for every
   * caller that doesn't pass one.
   */
  dungeonKey?: string;
}

export interface UseStartLobbyEncounterResult {
  /**
   * Calls StartEncounter. Host-only and all-ready gated server-side —
   * returns PermissionDenied / FailedPrecondition if the caller isn't the
   * host or a member isn't ready yet. Returns the new encounterId; the
   * server also broadcasts encounter_started on StreamLobby so every
   * member (not just the caller) switches to StreamEncounter.
   */
  startEncounter: (
    input: UseStartLobbyEncounterInput
  ) => Promise<StartEncounterResponse>;
  loading: boolean;
  error: Error | null;
}

/** Thin wrapper around the LobbyService StartEncounter unary RPC. */
export function useStartLobbyEncounter(): UseStartLobbyEncounterResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startEncounter = useCallback(
    async (
      input: UseStartLobbyEncounterInput
    ): Promise<StartEncounterResponse> => {
      setLoading(true);
      setError(null);

      const request = create(StartEncounterRequestSchema, {
        lobbyId: input.lobbyId,
        dungeonKey: input.dungeonKey || '',
      });

      try {
        const response = await lobbyClient.startEncounter(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('StartEncounter RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { startEncounter, loading, error };
}
