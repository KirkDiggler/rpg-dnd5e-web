import type { AttackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface AttackParams {
  session: string;
  /** Who swings — the local player's own member id. */
  attacker: string;
  /** Who they swing at — one of `combatPanel.ts`'s own `attackTargets`
   * (a subject the player clicked directly on the floor). */
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
 * NO REACH CHECK HAPPENS HERE, on purpose — reach is the server's own
 * gate now (rpg-toolkit#1010, rpg-project#249 §3): `Afford` prices one
 * `Declaration` per candidate target actually in reach, and
 * `combatPanel.ts`'s `attackTargets` is exactly that list. This hook (and
 * `useCombatPanel.attackTarget`, which calls it directly off a floor
 * click) never re-derives a range rule of its own — the client renders
 * what the API allows; it does not calculate rules.
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
