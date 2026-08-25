import type { EndTurnResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface EndTurnParams {
  session: string;
  /** Whose turn is ending — must be their turn, server-enforced
   * (`FAILED_PRECONDITION` otherwise; `TurnRequest`'s own doc comment). */
  member: string;
  /** Opaque selector echoed exactly from the chosen Afford declaration. */
  declarationId: string;
}

export interface UseEndTurnResult {
  endTurn: (params: EndTurnParams) => Promise<EndTurnResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.EndTurn` — mirrors `useEquipItem`/
 * `useTakeAction`: one file per verb, `loading` true while in flight,
 * `error` set on failure (cleared on the next successful call), and the
 * returned promise rejects so the caller (`useCombatPanel`) can decide
 * what to show without this hook guessing.
 */
export function useSessionEndTurn(): UseEndTurnResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const endTurn = useCallback(
    async (params: EndTurnParams): Promise<EndTurnResponse> => {
      setLoading(true);
      setError(null);
      try {
        const response = await sessionClient.endTurn(params);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('EndTurn RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { endTurn, loading, error };
}
