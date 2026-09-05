import type { TradeResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { Money } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
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
   * TradeItem this wave; `give` is item-empty (one-directional
   * acquisition only, rpg-toolkit#1275 wave 1) but now carries the
   * payment as `currency`. */
  equipmentType: string;
  equipmentId: string;
  quantity: number;
  /** The exact price to offer, read straight off the row's own
   * `VendorStockEntry.price` (rpg-toolkit#1534). Sent verbatim as
   * `give.currency` — this hook does no affordability or correctness
   * check of its own. */
  price: Money;
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
 * ONE-DIRECTIONAL ONLY. `give.items` is always sent empty; a caller that
 * needs to give items back is a later wave (rpg-toolkit#1275). `give`
 * DOES carry `currency` now (rpg-toolkit#1534, wave 4): price is a
 * security property, not a display convenience — the server always
 * recomputes the real price and refuses (`ErrWrongPrice`) any mismatch,
 * so this hook makes no attempt to validate `price` itself. Reach,
 * legality, and affordability (`ErrInsufficientFunds`) all stay the
 * server's call, the same law every other session verb keeps.
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
          give: { items: [], currency: params.price },
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
