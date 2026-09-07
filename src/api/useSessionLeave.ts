import type { ExitResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface LeaveParams {
  session: string;
  /** Who leaves — the local player's own member id. */
  member: string;
}

export interface UseSessionLeaveResult {
  leave: (params: LeaveParams) => Promise<ExitResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Exit` — `useSessionSearch`'s shape.
 *
 * # The client just says leave
 *
 * The request has not grown a field and will not (design R6/R7, and the
 * Exit RPC's own doc comment): a member standing on a scenario's bound
 * exit while holding its artifact ends the run by declaring this verb,
 * explicitly, never by arriving on the cell. WHAT A DEPARTURE MEANT is the
 * server's answer — it arrives on the EXITED beat, which carries the exit
 * id and what was carried out, and in `ExitResponse.closed` and the ENDED
 * beat when the run ended. This hook computes nothing and reads nothing:
 * leaving from an ordinary cell while carrying the artifact drops it where
 * the member stood (R9), and that too is the server's call, not a branch
 * anybody takes here.
 */
export function useSessionLeave(): UseSessionLeaveResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const leave = useCallback(
    async (params: LeaveParams): Promise<ExitResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.exit(params);
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Exit RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { leave, loading, error };
}
