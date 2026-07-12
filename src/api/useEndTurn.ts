import { create } from '@bufbuild/protobuf';
import type { EndTurnResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { EndTurnRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { useCallback, useState } from 'react';
import { encounterClient } from './client';

export interface UseEndTurnResult {
  /**
   * Calls the v1alpha2 EndTurn unary RPC. The next actor's turn (and any NPC
   * turns the orchestrator dispatches before returning to a player) flow back
   * as TurnEnded / TurnStarted / EntityDamaged events on the StreamEncounter.
   */
  endTurn: (encounterId: string, entityId: string) => Promise<EndTurnResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the v1alpha2 EndTurn unary RPC.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - The returned promise rejects on RPC error so callers can surface it
 *
 * Mirrors useMoveEntity / useInteract — one file per v1alpha2 verb under
 * src/api/.
 */
export function useEndTurn(): UseEndTurnResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const endTurn = useCallback(
    async (encounterId: string, entityId: string): Promise<EndTurnResponse> => {
      setLoading(true);
      setError(null);

      const request = create(EndTurnRequestSchema, {
        encounterId,
        entityId,
      });

      try {
        const response = await encounterClient.endTurn(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('EndTurn RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { endTurn, loading, error };
}
