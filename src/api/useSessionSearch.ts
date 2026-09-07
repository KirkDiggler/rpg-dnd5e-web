import type { SearchResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface SearchParams {
  session: string;
  /** Who searches — the local player's own member id. */
  member: string;
  /**
   * The AtlasRegion id to sweep. Universally attemptable — no
   * prerequisites, no class gate, no turn requirement — but in v1 it MUST
   * be the region `member` currently stands in; presence is the host's
   * truth, and the server refuses any other region FAILED_PRECONDITION.
   * The caller resolves this from the searcher's own known position (see
   * `SessionEncounterView`'s region lookup); this hook never infers or
   * defaults a target itself.
   */
  region: string;
}

export interface UseSessionSearchResult {
  search: (params: SearchParams) => Promise<SearchResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Search` — mirrors `useSessionAttack`/
 * `useSessionActivate`: one file per verb, `loading` true while in flight,
 * `error` set on failure, the returned promise rejects so the caller
 * decides what to show.
 *
 * THE RESPONSE CARRIES NO OUTCOME, DELIBERATELY (`SearchResponse`'s own
 * doc comment): an empty room and a failed check answer with the same
 * bytes, so this hook has nothing to report beyond "the search happened"
 * — no found flag, no roll, nothing that varies with what the room held.
 * A find reaches the searcher later, as a DOOR_REVEALED beat on their own
 * stream, never as this call's return value. A caller that shows
 * something after this resolves MUST show the identical thing whether or
 * not anything was found — see `SessionEncounterView`'s search handler,
 * which pins that law.
 *
 * NO TARGET CHOICE HAPPENS HERE. `region` is supplied by the caller from
 * the searcher's own known position; this hook never computes, infers, or
 * defaults it.
 */
export function useSessionSearch(): UseSessionSearchResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(
    async (params: SearchParams): Promise<SearchResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.search(params);
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Search RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { search, loading, error };
}
