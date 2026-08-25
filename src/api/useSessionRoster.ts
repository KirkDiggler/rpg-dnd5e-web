import type { PublicMemberInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionRosterResult {
  /** The roster keyed by member id (`PublicMemberInfo.id` — the same id
   * `Sighting.subject` speaks), for O(1) lookup at render. */
  roster: ReadonlyMap<string, PublicMemberInfo>;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const EMPTY_ROSTER: ReadonlyMap<string, PublicMemberInfo> = new Map();

/**
 * Fetches the session's roster (`SessionService.GetRoster`) — the PUBLIC
 * half of every member (rpg-project#264, ideas/characters/presentation):
 * name, kind, and the body's refs. Never positions and never the sheet —
 * `PublicMemberInfo`'s own wire doc carries the law.
 *
 * LOAD ONCE, REFERENCE AT RENDER: identity is stable per session (it
 * changes at join time and in an editor, not per turn), so unlike
 * `useSessionView` this hook DOES fetch on mount, and the only other
 * fetch a caller should ever fire is `refetch` on a `joined` event —
 * pull-on-join is the ruled shape (design.md "Decisions"). Nothing here
 * refetches per perception refresh, which is the whole point of the
 * roster/sighting split.
 *
 * `session` empty/falsy is the "not ready yet" state; `loading`/`error`
 * clear rather than leaving a stale error visible from a previous session
 * (the same clearing rule as `useSessionView`/`useSessionWhere`).
 */
export function useSessionRoster(session: string): UseSessionRosterResult {
  const [roster, setRoster] =
    useState<ReadonlyMap<string, PublicMemberInfo>>(EMPTY_ROSTER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRoster = useCallback(async () => {
    if (!session) {
      setRoster(EMPTY_ROSTER);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.getRoster({ session });
      setRoster(new Map(response.members.map((m) => [m.id, m])));
    } catch (err) {
      // A failed roster read degrades rendering to the pre-roster
      // placeholders, never blocks it — keep whatever was last known
      // rather than blanking members mid-session.
      setError(err instanceof Error ? err : new Error('GetRoster RPC failed'));
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Load once per session — identity is stable, so mount (or the session id
  // arriving) is the one automatic fetch.
  useEffect(() => {
    if (!session) {
      setRoster(EMPTY_ROSTER);
      setError(null);
      setLoading(false);
      return;
    }
    void fetchRoster();
  }, [session, fetchRoster]);

  return { roster, loading, error, refetch: fetchRoster };
}
