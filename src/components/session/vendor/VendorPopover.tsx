/**
 * VendorPopover — the merchant screen for a MEMBER_KIND_WORLD vendor NPC
 * (rpg-api SessionService.Interact, rpg-api#903 Phase 1; Buy wired to
 * SessionService.Trade, rpg-project#369/#370; price/wallet,
 * rpg-toolkit#1534 wave 4; Sell, rpg-toolkit#1537).
 *
 * Deliberately reuses `EquipmentPopover`/`InventoryLight`'s exact
 * `.equip-popover`/`.equip-inventory`/`.equip-inv-row` classes (same
 * floating hud-skin panel, same row grid) rather than new CSS — including
 * for the Buy/Sell tab buttons, which reuse `verb-btn`.
 *
 * Fully prop-driven, no RPC calls in here — same separation
 * `EquipmentPopover`'s `onIntent` callback already establishes. A row's
 * "Buy"/"Sell" click only sets local pending state (which row is asking
 * to be confirmed); the actual Trade call is the caller's, fired from
 * `onBuy`/`onSell` once the player confirms.
 *
 * Sell is scoped to items `equipmentTypeForKind` can resolve
 * (weapon/armor/shield) — the caller is responsible for filtering
 * `carriedItems` to that set (see `equipmentTypes.ts`'s own doc comment
 * for why "gear"-kind items aren't safely sellable yet).
 */

import type { VendorStockEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { getItemIconUrl } from '../../../utils/itemIcons';
import { formatMoney } from '../../../utils/money';
import type {
  CarriedStack,
  ItemLike,
} from '../../game/equipment/equipmentTypes';
import { refKey } from '../../game/equipment/equipmentTypes';
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
  /** The player's own carried, sellable stacks — already filtered by the
   * caller to items `equipmentTypeForKind` can resolve. */
  carriedItems: CarriedStack[];
  /** Fires once the player confirms selling one stack, at its full
   * carried count. The caller owns the actual Trade RPC. */
  onSell?: (item: ItemLike, quantity: number) => void;
  /** A prior Buy or Sell RPC is in flight — disables every row's
   * Buy/Sell/Confirm so a second click can't race the first (mirrors
   * EquipmentSlots' own `busy` convention). */
  busy?: boolean;
  /** The player's own wallet, in copper (`CharacterData.wallet.copper`).
   * Undefined while characterData hasn't loaded yet — renders no wallet
   * line rather than claiming "0 cp". Informational only: Buy/Sell stay
   * enabled regardless, since affordability is the server's call
   * (`ErrInsufficientFunds`), not this popover's. */
  walletCopper?: number;
}

export function VendorPopover({
  open,
  displayName,
  inventory,
  onClose,
  onBuy,
  carriedItems,
  onSell,
  busy,
  walletCopper,
}: VendorPopoverProps) {
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  // Which row is asking "Buy/Sell {name}?" right now — cleared on confirm,
  // cancel, tab switch, or whenever the popover closes. Only one row at a
  // time, and the two tabs never share a pending row.
  const [pendingEntry, setPendingEntry] = useState<VendorStockEntry | null>(
    null
  );
  const [pendingSell, setPendingSell] = useState<ItemLike | null>(null);

  const switchTab = (tab: 'buy' | 'sell') => {
    setActiveTab(tab);
    setPendingEntry(null);
    setPendingSell(null);
  };

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
                setPendingSell(null);
                onClose();
              }}
              aria-label="Close vendor"
            >
              Close
            </button>
          </div>
          <div
            className="equip-popover-body"
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="verb-btn"
                aria-pressed={activeTab === 'buy'}
                onClick={() => switchTab('buy')}
              >
                Buy
              </button>
              <button
                type="button"
                className="verb-btn"
                aria-pressed={activeTab === 'sell'}
                onClick={() => switchTab('sell')}
              >
                Sell
              </button>
            </div>
            {activeTab === 'buy' && (
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
                          {entry.playerSold ? ' · sold back' : ''}
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
            )}
            {activeTab === 'sell' && (
              <div
                className="equip-inventory hud-skin"
                data-testid="vendor-sell-stock"
              >
                <div className="equip-inventory-header">Sell</div>
                {carriedItems.length === 0 && (
                  <div className="equip-inventory-empty">Nothing to sell.</div>
                )}
                {carriedItems.map(({ item, carriedCount }) => {
                  const key = refKey(item.ref);
                  const iconUrl = getItemIconUrl(item.ref, item.iconKey);
                  const isPending = pendingSell
                    ? refKey(pendingSell.ref) === key
                    : false;
                  const priceLabel = item.price
                    ? formatMoney(item.price.copper)
                    : '—';
                  return (
                    <div key={key}>
                      <div
                        className="equip-inv-row gear"
                        data-testid={`vendor-sell-${item.ref.id}`}
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
                        <span className="equip-inv-name">{item.name}</span>
                        <span className="equip-inv-stat">
                          {item.kind} · {priceLabel}
                        </span>
                        <span className="equip-inv-slot">×{carriedCount}</span>
                      </div>
                      {isPending ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.375rem 0.625rem 0.625rem',
                          }}
                          data-testid={`vendor-sell-confirm-${item.ref.id}`}
                        >
                          <span style={{ flex: 1 }}>
                            Sell {item.name} for {priceLabel}?
                          </span>
                          <button
                            type="button"
                            className="verb-btn"
                            disabled={busy}
                            aria-label={`Confirm sell ${item.name}`}
                            onClick={() => {
                              onSell?.(item, carriedCount);
                              setPendingSell(null);
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="verb-btn"
                            disabled={busy}
                            aria-label="Cancel sell"
                            onClick={() => setPendingSell(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ padding: '0.375rem 0.625rem 0.625rem' }}>
                          <button
                            type="button"
                            className="verb-btn"
                            data-testid={`vendor-sell-btn-${item.ref.id}`}
                            disabled={!item.price || busy}
                            aria-label={`Sell ${item.name}`}
                            onClick={() => setPendingSell(item)}
                          >
                            Sell
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
