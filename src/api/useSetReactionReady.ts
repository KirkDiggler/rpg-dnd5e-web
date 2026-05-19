import { create } from '@bufbuild/protobuf';
import type { SetReactionReadyResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { SetReactionReadyRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { RefSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useState } from 'react';
import { encounterClientV2 } from './client';

/**
 * Input shape for the SetReactionReady RPC. Mirrors the proto request fields
 * with the reactionRef expressed as the canonical {module, type, id} triple
 * — same shape as the encounter snapshot's reaction-readiness map keys.
 */
export interface UseSetReactionReadyInput {
  encounterId: string;
  characterId: string;
  reactionRef: {
    module: string; // e.g. "dnd5e"
    type: string; // e.g. "spells", "conditions"
    id: string; // e.g. "shield", "opportunity_attack"
  };
  ready: boolean;
}

export interface UseSetReactionReadyResult {
  /**
   * Calls the v1alpha2 SetReactionReady unary RPC. Toggles per-character
   * per-reaction readiness on the server. The server is source of truth —
   * but the response is currently empty, and stream snapshots do not carry
   * the reaction-readiness map. Callers that need to reflect the new state
   * in the UI should optimistically mirror the toggle locally on RPC success
   * (see useEncounterState.setReactionReadyLocal). When server-side seeding
   * of stream snapshots lands in a future wave, this contract can be tightened
   * so callers consume readiness from the snapshot instead of mirroring.
   *
   * Returns FailedPrecondition if the character isn't in the encounter or
   * the reaction ref is unknown. Returns Unauthenticated/PermissionDenied
   * if the caller isn't the controlling player.
   *
   * `lastResponse` is populated on success so the harness can render a
   * transient confirmation (response itself is currently empty — server
   * acknowledges success via the empty response shape).
   */
  setReactionReady: (
    input: UseSetReactionReadyInput
  ) => Promise<SetReactionReadyResponse>;
  loading: boolean;
  error: Error | null;
  lastResponse: SetReactionReadyResponse | null;
}

/**
 * Thin wrapper around the v1alpha2 SetReactionReady unary RPC.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - lastResponse holds the most recent successful response for transient display
 * - The returned promise rejects on RPC error so callers can surface it
 *
 * Mirrors useSubmitCheckV2 — one file per v1alpha2 verb under src/api/.
 *
 * Wave 2.11d: opt-in player reaction readiness. Each character has zero or
 * more reactions Apply()'d to the encounter bus (OA default-on for melee
 * combatants; Shield default-off for spellcasters with 1st-level slots).
 * The player toggles per-reaction readiness via this RPC; the encounter
 * SDK's predicate check (gamectx.IsReactionReady) gates whether the
 * condition's trigger event fires when its predicate matches.
 */
export function useSetReactionReady(): UseSetReactionReadyResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastResponse, setLastResponse] =
    useState<SetReactionReadyResponse | null>(null);

  const setReactionReady = useCallback(
    async (
      input: UseSetReactionReadyInput
    ): Promise<SetReactionReadyResponse> => {
      setLoading(true);
      setError(null);

      const request = create(SetReactionReadyRequestSchema, {
        encounterId: input.encounterId,
        characterId: input.characterId,
        reactionRef: create(RefSchema, {
          module: input.reactionRef.module,
          type: input.reactionRef.type,
          id: input.reactionRef.id,
        }),
        ready: input.ready,
      });

      try {
        const response = await encounterClientV2.setReactionReady(request);
        setLastResponse(response);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('SetReactionReady RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { setReactionReady, loading, error, lastResponse };
}
