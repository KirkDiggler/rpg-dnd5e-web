/**
 * VendorPopover — the merchant screen for a MEMBER_KIND_WORLD vendor NPC
 * (rpg-api SessionService.Interact, rpg-api#903 Phase 1; Buy wired to
 * SessionService.Trade, rpg-project#369/#370; price/wallet,
 * rpg-toolkit#1534 wave 4).
 *
 * Deliberately reuses `EquipmentPopover`/`InventoryLight`'s exact
 * `.equip-popover`/`.equip-inventory`/`.equip-inv-row` classes (same
 * floating hud-skin panel, same row grid) rather than new CSS.
 *
 * Fully prop-driven, no RPC calls in here — same separation
 * `EquipmentPopover`'s `onIntent` callback already establishes. A row's
 * "Buy" click only sets local `pendingEntry` (which row is asking to be
 * confirmed); the actual Trade call is the caller's, fired from `onBuy`
 * once the player confirms.
 */

import type { VendorStockEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { getItemIconUrl } from '../../../utils/itemIcons';
import { formatMoney } from '../../../utils/money';
import {
  vendorStockLabel,
  vendorStockPriceLabel,
  vendorStockPurchasable,
} from './vendorStock';

export interface VendorPopoverProps {
  open: boolean;
  displayName: string;
  inventory: VendorStockEntry[];
  onClose: () => void;
  /** Fires once the player confirms buying one row. The caller owns the
   * actual Trade RPC and any refresh of `inventory` afterward. */
  onBuy?: (entry: VendorStockEntry) => void;
  /** A prior Buy's RPC is in flight — disables every row's Buy/Confirm
   * so a second click can't race the first (mirrors EquipmentSlots'
   * own `busy` convention). */
  busy?: boolean;
  /** The player's own wallet, in copper (`CharacterData.wallet.copper`).
   * Undefined while characterData hasn't loaded yet — renders no wallet
   * line rather than claiming "0 cp". Informational only: Buy stays
   * enabled even if this is short of a row's price, since affordability
   * is the server's call (`ErrInsufficientFunds`), not this popover's. */
  walletCopper?: number;
}

export function VendorPopover({
  open,
  displayName,
  inventory,
  onClose,
  onBuy,
  busy,
  walletCopper,
}: VendorPopoverProps) {
  const reduced = useReducedMotion();
  // Which row is asking "Buy {name}?" right now — cleared on confirm,
  // cancel, or whenever the popover closes. Only one row at a time.
  const [pendingEntry, setPendingEntry] = useState<VendorStockEntry | null>(
    null
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="equip-popover hud-skin"
          data-testid="vendor-popover"
          role="region"
          aria-label={`Vendor — ${displayName}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
          transition={{ duration: reduced ? 0.1 : 0.2, ease: 'easeOut' }}
          style={{ transformOrigin: 'bottom right' }}
        >
          <div className="equip-popover-header">
            {displayName}
            {walletCopper !== undefined && (
              <span className="equip-popover-stats" data-testid="vendor-wallet">
                You have: {formatMoney(walletCopper)}
              </span>
            )}
            <button
              type="button"
              className="verb-btn"
              onClick={() => {
                setPendingEntry(null);
                onClose();
              }}
              aria-label="Close vendor"
            >
              Close
            </button>
          </div>
          <div className="equip-popover-body">
            <div
              className="equip-inventory hud-skin"
              data-testid="vendor-stock"
            >
              <div className="equip-inventory-header">Stock</div>
              {inventory.length === 0 && (
                <div className="equip-inventory-empty">Nothing for sale.</div>
              )}
              {inventory.map((entry) => {
                const iconUrl = getItemIconUrl({ id: entry.equipmentId }, '');
                const isPending =
                  pendingEntry?.equipmentId === entry.equipmentId;
                const purchasable = vendorStockPurchasable(entry);
                return (
                  <div key={entry.equipmentId}>
                    <div
                      className="equip-inv-row gear"
                      data-testid={`vendor-stock-${entry.equipmentId}`}
                    >
                      {iconUrl && (
                        <img
                          className="equip-inv-icon"
                          src={iconUrl}
                          alt=""
                          draggable={false}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <span className="equip-inv-name">
                        {entry.displayName}
                      </span>
                      <span className="equip-inv-stat">
                        {entry.equipmentType} · {vendorStockPriceLabel(entry)}
                      </span>
                      <span className="equip-inv-slot">
                        {vendorStockLabel(entry)}
                      </span>
                    </div>
                    {isPending ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem 0.625rem 0.625rem',
                        }}
                        data-testid={`vendor-buy-confirm-${entry.equipmentId}`}
                      >
                        <span style={{ flex: 1 }}>
                          Buy {entry.displayName} for{' '}
                          {vendorStockPriceLabel(entry)}?
                        </span>
                        <button
                          type="button"
                          className="verb-btn"
                          disabled={busy}
                          aria-label={`Confirm buy ${entry.displayName}`}
                          onClick={() => {
                            onBuy?.(entry);
                            setPendingEntry(null);
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="verb-btn"
                          disabled={busy}
                          aria-label="Cancel buy"
                          onClick={() => setPendingEntry(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding: '0.375rem 0.625rem 0.625rem' }}>
                        <button
                          type="button"
                          className="verb-btn"
                          data-testid={`vendor-buy-${entry.equipmentId}`}
                          disabled={!purchasable || busy}
                          aria-label={`Buy ${entry.displayName}`}
                          onClick={() => setPendingEntry(entry)}
                        >
                          Buy
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
