import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionWhereResult {
  position: Position | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches one member's own placement (`SessionService.GetWhere`) — a LIVE
 * read (`GetWhereResponse`'s own doc comment: "the position comes from the
 * composition's roster, which projects each member's cell when asked"),
 * unlike `useSessionAtlas`'s fetch-once construction truth. Slice 1 calls
 * this once on mount to place the local player at the session's start;
 * a later slice that needs it to track a live walk will re-fetch (or,
 * once StreamEvents is wired in, drive position off the stream instead of
 * polling this RPC).
 *
 * `session`/`member` empty/falsy is the "not ready yet" state, same
 * convention as `useSessionAtlas` — `loading`/`error` both clear rather
 * than leaving a stale error visible from a previous session/member pair
 * (Copilot review, PR #764).
 */
export function useSessionWhere(
  session: string,
  member: string
): UseSessionWhereResult {
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWhere = useCallback(async () => {
    if (!session || !member) {
      setPosition(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.getWhere({ session, member });
      setPosition(response.position ?? null);
    } catch (err) {
      setPosition(null);
      setError(err instanceof Error ? err : new Error('GetWhere RPC failed'));
    } finally {
      setLoading(false);
    }
  }, [session, member]);

  useEffect(() => {
    void fetchWhere();
  }, [fetchWhere]);

  return { position, loading, error, refetch: fetchWhere };
}
