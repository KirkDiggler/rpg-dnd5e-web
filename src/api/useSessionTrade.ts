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
  /** 'buy' populates `give.currency`/`receive.items` (acquiring from the
   * vendor's stock); 'sell' populates `give.items`/`receive.currency`
   * (the mirror — rpg-toolkit#1537). Exactly one item line either way. */
  direction: 'buy' | 'sell';
  equipmentType: string;
  equipmentId: string;
  quantity: number;
  /** On buy: the exact price to pay, read off `VendorStockEntry.price`.
   * On sell: the exact payout expected, read off `ItemLike.price`. Sent
   * verbatim as `currency` on whichever side `direction` puts it —
   * this hook does no affordability or correctness check of its own. */
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
 * BIDIRECTIONAL (rpg-toolkit#1534 buy, #1537 sell): same RPC, same shape,
 * just the other side populated — `direction` decides whether the one
 * item line goes on `give` or `receive`, and `price` lands as `currency`
 * on the OPPOSITE side (what's paid on a buy, what's expected back on a
 * sell). Either way price is a security property, not a display
 * convenience — the server always recomputes the real price and refuses
 * (`ErrWrongPrice`) any mismatch, so this hook makes no attempt to
 * validate `price` itself. Reach, legality, ownership
 * (`ErrNotInInventory`), and affordability (`ErrInsufficientFunds`) all
 * stay the server's call, the same law every other session verb keeps.
 */
export function useSessionTrade(): UseTradeResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const trade = useCallback(
    async (params: TradeParams): Promise<TradeResponse> => {
      setLoading(true);
      setError(null);
      try {
        const itemLine = {
          equipmentType: params.equipmentType,
          equipmentId: params.equipmentId,
          quantity: params.quantity,
        };
        const response = await sessionClient.trade({
          session: params.session,
          actor: params.actor,
          target: params.target,
          range: params.range ?? 0,
          give:
            params.direction === 'sell'
              ? { items: [itemLine] }
              : { items: [], currency: params.price },
          receive:
            params.direction === 'sell'
              ? { items: [], currency: params.price }
              : { items: [itemLine] },
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
