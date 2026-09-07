import type { LootResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface LootParams {
  session: string;
  /** Who loots — the local player's own member id. */
  member: string;
  /**
   * The downed member whose body is looted. OFFERED ON EVERY DOWNED BODY
   * (design rpg-project#368 P3): an affordance that appeared only on
   * bodies worth looting would say which monster carries intel, which is
   * the one secret this slice keeps. The caller resolves this from what
   * the member can already see; this hook never picks a target.
   */
  target: string;
  /** Cells; zero (omitted) means adjacent, as Interact's does. Reach is
   * the host's truth — the caller passes what it was told, never a
   * distance it computed. */
  range?: number;
}

export interface UseSessionLootResult {
  loot: (params: LootParams) => Promise<LootResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Loot` — one file per verb, the shape
 * `useSessionSearch` established.
 *
 * THE RESPONSE SAYS NOTHING ABOUT WHAT MOVED, deliberately (`LootResponse`'s
 * own doc comment): an empty body and the captain answer with the same
 * fields. What the looter gained reaches them as a DOOR_REVEALED beat on
 * their own stream — byte-identical to the reveal a successful search
 * produces — and everyone present hears LOOTED, which names looter and body
 * and nothing else. So a caller that shows something after this resolves
 * MUST show the identical thing either way; only a genuine transport
 * failure differs.
 */
export function useSessionLoot(): UseSessionLootResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loot = useCallback(
    async (params: LootParams): Promise<LootResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.loot(params);
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Loot RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { loot, loading, error };
}
