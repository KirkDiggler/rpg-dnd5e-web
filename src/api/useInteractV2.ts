import { create } from '@bufbuild/protobuf';
import type { InteractResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { InteractRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { useCallback, useState } from 'react';
import { encounterClientV2 } from './client';

export interface UseInteractV2Result {
  /**
   * Calls the v1alpha2 Interact unary RPC. The world-changing effects of the
   * interaction (door opens, hexes revealed, etc.) flow back as separate
   * events on the StreamEncounter; the response itself only carries
   * caller-private follow-ups (skill check prompts, dialogue choices).
   */
  interact: (
    encounterId: string,
    targetEntityId: string,
    interactionKind?: string
  ) => Promise<InteractResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the v1alpha2 Interact unary RPC.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - The returned promise rejects on RPC error so callers can surface it
 *
 * Mirrors useMoveEntityV2 — one file per v1alpha2 verb under src/api/.
 */
export function useInteractV2(): UseInteractV2Result {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const interact = useCallback(
    async (
      encounterId: string,
      targetEntityId: string,
      interactionKind?: string
    ): Promise<InteractResponse> => {
      setLoading(true);
      setError(null);

      const request = create(InteractRequestSchema, {
        encounterId,
        targetEntityId,
        interactionKind,
      });

      try {
        const response = await encounterClientV2.interact(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Interact RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { interact, loading, error };
}
