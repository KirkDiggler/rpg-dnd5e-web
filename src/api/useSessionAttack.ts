import type { AttackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface AttackParams {
  session: string;
  /** Who swings — the local player's own member id. */
  attacker: string;
  /** Who they swing at — the panel's currently selected target. */
  target: string;
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
 * NO REACH/ADJACENCY CHECK HAPPENS HERE, on purpose. `AttackRequest`'s own
 * doc comment: the engine does not enforce reach/adjacency today
 * (toolkit#1010, deferred to the movement wave) — attacking from across
 * the room is exactly what the server currently allows, so this hook (and
 * `useCombatPanel`, which decides when the button is enabled) never
 * re-derives a range rule the client has no business inventing. The
 * client renders what the API allows; it does not calculate rules.
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
