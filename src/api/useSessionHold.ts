import type { TakeResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface HoldParams {
  session: string;
  /** Who picks it up — the local player's own member id. */
  member: string;
  /**
   * The PLACEMENT ID of the prop — the dungeon file's `place[].id`, the
   * same id `AtlasProp.id` carries. Not a ref: a dungeon may place two
   * reliquaries and a verb that named the ref could not say which one.
   */
  target: string;
  /** Cells; zero (omitted) means adjacent, as Loot's does. */
  range?: number;
}

export interface UseSessionHoldResult {
  hold: (params: HoldParams) => Promise<TakeResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the seam's pick-up verb — `useSessionSearch`'s shape.
 *
 * # Hold here, Take on the wire
 *
 * Design R10 named this verb **Hold**: it writes a run-scoped `holds:`
 * fact and nothing lands in a character's inventory, and *take* is the
 * word reserved for the act that does (buying from a merchant; carrying
 * the artifact home). The pinned protos (rpg-api-protos#289, generated
 * 46db48cd) still call the RPC `Take` — R10 landed after that merge and
 * the wire renames in a wave-0 follow-up — so this file is the one place
 * the two words meet, and the rename is one line here plus one in
 * `holdingBeat.ts`.
 *
 * THE RESPONSE CARRIES NO WORLD CHANGE (`TakeResponse`'s own doc comment):
 * the prop leaving the map and the holder holding it arrive as the beat,
 * which reaches the caller too. Nothing here reads the answer.
 */
export function useSessionHold(): UseSessionHoldResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const hold = useCallback(
    async (params: HoldParams): Promise<TakeResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.take(params);
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Hold RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { hold, loading, error };
}
