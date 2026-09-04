/**
 * Vendor stock row formatting — straight from `VendorStockEntry`'s own wire
 * contract (service.proto), not the shape of any one example: `quantity` is
 * documented as "meaningful only when stock_mode is LIMITED", so the label
 * branches on `stock_mode` rather than on whether `quantity` happens to be
 * set.
 */
import type { VendorStockEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { VendorStockMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';

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

/** Whether a row can still be bought — false only for a LIMITED row
 * that's run out. An UNLIMITED (or unspecified/unmapped) row is always
 * purchasable, the same least-presumptuous reading `vendorStockLabel`
 * already gives an unrecognized mode. */
export function vendorStockPurchasable(entry: VendorStockEntry): boolean {
  return (
    entry.stockMode !== VendorStockMode.LIMITED || (entry.quantity ?? 0) > 0
  );
}
