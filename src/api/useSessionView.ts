import type { Sighting } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionViewResult {
  sightings: Sighting[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches one member's own perception (`SessionService.GetView`) — a LIVE
 * read reporting "what do I hold of everyone else" (`GetViewResponse`'s own
 * doc comment), the counterpart of `useSessionWhere`'s "where am I". Skips
 * the observer's own self server-side, so this never reports the local
 * player back to themselves.
 *
 * `session`/`member` empty/falsy is the "not ready yet" state, same
 * convention as `useSessionWhere`/`useSessionAtlas` — `loading`/`error`
 * both clear rather than leaving a stale error visible from a previous
 * session/member pair (the Copilot review pattern from PR #764, carried
 * forward here for the same reason).
 *
 * Unlike `useSessionWhere`/`useSessionAtlas`, this hook does NOT fetch on
 * mount. A view is a perception snapshot that only means something relative
 * to a known position, so the caller owns every fetch via `refetch` —
 * SessionEncounterView fires it each time `GetWhere` lands (initial load,
 * after the local walk, on MOVED events). One owner, one GetView per
 * position change, no redundant mount fetch (Copilot review, PR #767).
 */
export function useSessionView(
  session: string,
  member: string
): UseSessionViewResult {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchView = useCallback(async () => {
    if (!session || !member) {
      setSightings([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.getView({ session, member });
      setSightings(response.sightings);
    } catch (err) {
      setSightings([]);
      setError(err instanceof Error ? err : new Error('GetView RPC failed'));
    } finally {
      setLoading(false);
    }
  }, [session, member]);

  // The only automatic behaviour: a session/member pair going away resets
  // the view, so a stale error or stale sightings from a previous pair can
  // never outlive it (same clearing rule as the sibling hooks).
  useEffect(() => {
    if (!session || !member) {
      setSightings([]);
      setError(null);
      setLoading(false);
    }
  }, [session, member]);

  return { sightings, loading, error, refetch: fetchView };
}
