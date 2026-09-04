import type { InteractResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface InteractParams {
  session: string;
  /** The reaching player — the local player's own member id. */
  actor: string;
  /** The MEMBER_KIND_WORLD member being reached for. */
  target: string;
  /** Max distance in cells target may stand from actor. Omitted/0 means
   * adjacent, matching the proto's own default. */
  range?: number;
}

export interface UseInteractResult {
  interact: (params: InteractParams) => Promise<InteractResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Interact` (v1alpha1) — mirrors
 * `useSessionAttack`: one file per verb, `loading` true while in flight,
 * `error` cleared at the start of every call and set again on failure, the
 * returned promise rejects so the caller decides what to show.
 *
 * Not to be confused with `useInteract` (`src/api/useInteract.ts`), which
 * wraps the unrelated v1alpha2 `EncounterService.Interact` used for
 * door-opening during combat encounters — same verb name, different
 * service, different request shape.
 *
 * NO REACH LOGIC HAPPENS HERE. A click on a world NPC always calls this;
 * range/adjacency is the server's call to make, the same law every other
 * session verb keeps.
 */
export function useSessionInteract(): UseInteractResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const interact = useCallback(
    async (params: InteractParams): Promise<InteractResponse> => {
      setLoading(true);
      setError(null);
      try {
        const response = await sessionClient.interact({
          session: params.session,
          actor: params.actor,
          target: params.target,
          range: params.range ?? 0,
        });
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
