import { PartySharing } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionStatusResult {
  /**
   * The run's sharing dial (rpg-project#935), as the server reports it.
   * UNSPECIFIED when the server does not report it, while the read is in
   * flight, or when it failed: the client then shows nothing, never a guess.
   */
  partySharing: PartySharing;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches the run's status (`SessionService.GetStatus`) for its run-level
 * facts. LOAD ONCE PER SESSION: the sharing dial describes the run, every
 * seat reads the same value, and it cannot change mid-run today, so nothing
 * on the act stream refetches it. A failed read keeps UNSPECIFIED and never
 * throws into the view.
 */
export function useSessionStatus(session: string): UseSessionStatusResult {
  const [partySharing, setPartySharing] = useState(PartySharing.UNSPECIFIED);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!session) {
      setPartySharing(PartySharing.UNSPECIFIED);
      setError(null);
      return;
    }
    try {
      const response = await sessionClient.getStatus({ session });
      setPartySharing(response.partySharing);
      setError(null);
    } catch (err) {
      setPartySharing(PartySharing.UNSPECIFIED);
      setError(err instanceof Error ? err : new Error('GetStatus RPC failed'));
    }
  }, [session]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return { partySharing, error, refetch: fetchStatus };
}
