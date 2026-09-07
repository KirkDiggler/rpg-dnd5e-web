/**
 * Vendor stock row formatting — straight from `VendorStockEntry`'s own wire
 * contract (service.proto), not the shape of any one example: `quantity` is
 * documented as "meaningful only when stock_mode is LIMITED", so the label
 * branches on `stock_mode` rather than on whether `quantity` happens to be
 * set. `price` (rpg-toolkit#1534) is server-computed and display-only — the
 * server always recomputes and requires an exact match at Trade time, so a
 * stale value here can never buy anything for less than the real price.
 */
import type { VendorStockEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { VendorStockMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { formatMoney } from '../../../utils/money';

/** "3 left" for a LIMITED entry, "Always in stock" for UNLIMITED (or an
 * unspecified/unmapped mode, the least-presumptuous reading — same
 * "producer bug is the server's, not a reason to invent a new default"
 * treatment this codebase already gives other defensive enum cases). */
export function vendorStockLabel(entry: VendorStockEntry): string {
  if (entry.stockMode === VendorStockMode.LIMITED) {
    return `${entry.quantity ?? 0} left`;
  }
  return 'Always in stock';
}

/** Whether a row can still be bought — false for a LIMITED row that's
 * run out, or for any row with no server-computed price (nothing to
 * send as `give.currency`). An UNLIMITED (or unspecified/unmapped) row
 * with a price is always purchasable, the same least-presumptuous
 * reading `vendorStockLabel` already gives an unrecognized mode. */
export function vendorStockPurchasable(entry: VendorStockEntry): boolean {
  return (
    entry.price !== undefined &&
    (entry.stockMode !== VendorStockMode.LIMITED || (entry.quantity ?? 0) > 0)
  );
}

/** "15 gp" for a priced row, "—" when the server hasn't sent a price
 * (defensive only — Trade wave 4 always populates this). */
export function vendorStockPriceLabel(entry: VendorStockEntry): string {
  return entry.price !== undefined ? formatMoney(entry.price.copper) : '—';
}
