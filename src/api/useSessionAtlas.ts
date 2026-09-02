import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionAtlasResult {
  atlas: GetAtlasResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches a session's static world map (`SessionService.GetAtlas`).
 *
 * `GetAtlasResponse`'s own doc comment calls this CONSTRUCTION TRUTH —
 * "unchanged by movement, joins, exits or endings" — WITH ONE CARVE-OUT
 * (rpg-project#350/#351): concealed structure `member` has not had
 * revealed is withheld, so this member's own answer can GROW over an
 * encounter's life as doors and rooms are found. `member` is REQUIRED on
 * the wire (`GetAtlasRequest.member`, added rpg-api-protos#266) and bound
 * to the authenticated caller by the host, the same law `GetWhere` keeps
 * — an empty or wrong member is a caller defect, not "give me the whole
 * map."
 *
 * Still fetched once per distinct `session`/`member` pair and cached, not
 * polled — the caller re-fetches deliberately on a DOOR_REVEALED /
 * REGION_REVEALED beat (see `SessionEncounterView`'s `refreshKeysForEvent`),
 * the same load-once-refresh-from-the-stream shape `useSessionDoors`
 * already uses for live door state.
 *
 * `session`/`member` empty/falsy is the "not ready yet" state (mirrors
 * useListDungeons/useMyActiveLobby's own guarded-fetch convention): no
 * request goes out, and `loading`/`error` both clear rather than leaving a
 * stale error visible from a previous session/member pair (Copilot review,
 * PR #764).
 */
export function useSessionAtlas(
  session: string,
  member: string
): UseSessionAtlasResult {
  const [atlas, setAtlas] = useState<GetAtlasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAtlas = useCallback(async () => {
    if (!session || !member) {
      setAtlas(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.getAtlas({ session, member });
      setAtlas(response);
    } catch (err) {
      setAtlas(null);
      setError(err instanceof Error ? err : new Error('GetAtlas RPC failed'));
    } finally {
      setLoading(false);
    }
  }, [session, member]);

  useEffect(() => {
    void fetchAtlas();
  }, [fetchAtlas]);

  return { atlas, loading, error, refetch: fetchAtlas };
}
