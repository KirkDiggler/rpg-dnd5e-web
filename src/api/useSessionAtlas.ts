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
 * "unchanged by movement, joins, exits or endings. Fetch it once per
 * encounter and cache it; never per frame" — so this fires once per
 * distinct `session` id, not on every render, and never polls.
 *
 * `session` empty/falsy is the "not ready yet" state (mirrors
 * useListDungeons/useMyActiveLobby's own guarded-fetch convention): no
 * request goes out, and `loading` clears rather than spinning forever.
 */
export function useSessionAtlas(session: string): UseSessionAtlasResult {
  const [atlas, setAtlas] = useState<GetAtlasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAtlas = useCallback(async () => {
    if (!session) {
      setAtlas(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.getAtlas({ session });
      setAtlas(response);
    } catch (err) {
      setAtlas(null);
      setError(err instanceof Error ? err : new Error('GetAtlas RPC failed'));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void fetchAtlas();
  }, [fetchAtlas]);

  return { atlas, loading, error, refetch: fetchAtlas };
}
