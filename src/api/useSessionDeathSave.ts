import type { DeathSaveResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface DeathSaveParams {
  session: string;
  /** The authenticated player's exact session member id. */
  member: string;
  /** Opaque selector echoed unchanged from the current Afford declaration. */
  declarationId: string;
}

export interface UseSessionDeathSaveResult {
  deathSave: (params: DeathSaveParams) => Promise<DeathSaveResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin, single-attempt wrapper around the dedicated SessionService.DeathSave
 * mutation. Eligibility, result, progress, and continuation remain provider
 * facts. In particular, callers reconcile after an ambiguous rejection rather
 * than retrying a mutation whose result may already have persisted.
 */
export function useSessionDeathSave(): UseSessionDeathSaveResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deathSave = useCallback(
    async (params: DeathSaveParams): Promise<DeathSaveResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.deathSave(params);
      } catch (cause) {
        const wrapped =
          cause instanceof Error ? cause : new Error('Death Save RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { deathSave, loading, error };
}
