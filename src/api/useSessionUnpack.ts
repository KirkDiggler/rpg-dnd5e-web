import type { UnpackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface UnpackParams {
  session: string;
  /** The owner unpacking their own pack — the local player's own member id. */
  actor: string;
  /** The pack's catalog identifier. Must name a Pack the actor already owns. */
  itemId: string;
  /** How many pack instances to unpack at once, contents scaled
   * accordingly. Must be strictly positive. */
  quantity: number;
}

export interface UseUnpackResult {
  unpack: (params: UnpackParams) => Promise<UnpackResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Unpack` (v1alpha1) — mirrors
 * `useSessionInteract`/`useSessionTrade`: one file per verb, `loading`
 * true while in flight, `error` cleared at the start of every call and
 * set again on failure, the returned promise rejects so the caller
 * decides what to show.
 *
 * NO COUNTERPARTY, NO REACH, NO STORY BEAT (rpg-toolkit#1546). Unlike
 * Trade/Interact, the target is something the actor already owns — no
 * range, no visibility check. `UnpackResponse` carries only
 * `saved`/`delivery`, no descriptor and no `seq`: the caller re-fetches
 * `CharacterData.inventory` afterward to see the unpacked contents, the
 * same pattern every other verb's response follows when it has nothing
 * to apply directly.
 */
export function useSessionUnpack(): UseUnpackResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const unpack = useCallback(
    async (params: UnpackParams): Promise<UnpackResponse> => {
      setLoading(true);
      setError(null);
      try {
        const response = await sessionClient.unpack({
          session: params.session,
          actor: params.actor,
          itemId: params.itemId,
          quantity: params.quantity,
        });
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Unpack RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { unpack, loading, error };
}
