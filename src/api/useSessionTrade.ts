import type { TradeResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface TradeParams {
  session: string;
  /** The initiating player — the local player's own member id. */
  actor: string;
  /** The MEMBER_KIND_WORLD vendor being traded with. */
  target: string;
  /** Max distance in cells target may stand from actor. Omitted/0 means
   * adjacent, matching the proto's own default. */
  range?: number;
  /** The one stock row being bought — `receive` carries exactly one
   * TradeItem this wave; `give` is always empty (one-directional
   * acquisition only, rpg-toolkit#1275 wave 1). */
  equipmentType: string;
  equipmentId: string;
  quantity: number;
}

export interface UseTradeResult {
  trade: (params: TradeParams) => Promise<TradeResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Trade` (v1alpha1) — mirrors
 * `useSessionInteract`: one file per verb, `loading` true while in
 * flight, `error` cleared at the start of every call and set again on
 * failure, the returned promise rejects so the caller decides what to
 * show.
 *
 * ONE-DIRECTIONAL ONLY. `give` is always sent empty; a caller that needs
 * to give something back is a later wave (rpg-toolkit#1275). No
 * client-side price/affordability check happens here — there's no price
 * on the wire yet, and reach/legality are the server's call regardless,
 * the same law every other session verb keeps.
 */
export function useSessionTrade(): UseTradeResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const trade = useCallback(
    async (params: TradeParams): Promise<TradeResponse> => {
      setLoading(true);
      setError(null);
      try {
        const response = await sessionClient.trade({
          session: params.session,
          actor: params.actor,
          target: params.target,
          range: params.range ?? 0,
          give: { items: [] },
          receive: {
            items: [
              {
                equipmentType: params.equipmentType,
                equipmentId: params.equipmentId,
                quantity: params.quantity,
              },
            ],
          },
        });
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Trade RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { trade, loading, error };
}
