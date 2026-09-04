import type { HoldResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
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
  hold: (params: HoldParams) => Promise<HoldResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Hold` — `useSessionSearch`'s shape.
 *
 * THE VERB IS HOLD, NOT TAKE (design R10). It writes a run-scoped `holds:`
 * fact and nothing lands in a character's inventory; *take* is reserved
 * for the act that does, and the wire keeps that name free for the
 * merchant lane.
 *
 * THE RESPONSE CARRIES NO WORLD CHANGE (`HoldResponse`'s own doc comment):
 * the prop leaving the map and the holder holding it arrive as the HELD
 * beat, which reaches the caller too. Nothing here reads the answer.
 */
export function useSessionHold(): UseSessionHoldResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const hold = useCallback(
    async (params: HoldParams): Promise<HoldResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.hold(params);
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
