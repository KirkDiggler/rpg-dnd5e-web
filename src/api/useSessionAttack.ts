import type { AttackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface AttackParams {
  session: string;
  /** Who swings — the local player's own member id. */
  attacker: string;
  /** Who they swing at — an available candidate on the selected offer. */
  target: string;
  /** Opaque selector echoed exactly from the chosen Afford declaration. */
  declarationId: string;
}

export interface UseAttackResult {
  attack: (params: AttackParams) => Promise<AttackResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Attack` — mirrors `useEquipItem`/
 * `useSessionEndTurn`: one file per verb, `loading` true while in flight, `error`
 * set on failure (cleared on the next successful call), the returned
 * promise rejects so the caller decides what to show.
 *
 * NO REACH OR SELECTOR LOGIC HAPPENS HERE. The caller supplies an available
 * server declaration/candidate pair and this hook echoes its opaque `id`
 * unchanged as `declarationId`; it never constructs or parses a selector.
 */
export function useSessionAttack(): UseAttackResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const attack = useCallback(
    async (params: AttackParams): Promise<AttackResponse> => {
      setLoading(true);
      setError(null);
      try {
        const response = await sessionClient.attack(params);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Attack RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { attack, loading, error };
}
