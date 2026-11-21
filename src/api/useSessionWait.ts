import type { WaitResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface WaitParams {
  session: string;
  /** Who waits. The wait costs this character one round on the world clock. */
  member: string;
}

export interface UseWaitResult {
  wait: (params: WaitParams) => Promise<WaitResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Wait` — mirrors `useSessionEndTurn`:
 * `loading` true while in flight, `error` set on failure (cleared on the next
 * call), and the returned promise rejects so the caller decides what to show.
 */
export function useSessionWait(): UseWaitResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wait = useCallback(
    async (params: WaitParams): Promise<WaitResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.wait(params);
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Wait RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { wait, loading, error };
}
