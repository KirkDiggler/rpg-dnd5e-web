/**
 * VendorPopover — the merchant screen for a MEMBER_KIND_WORLD vendor NPC
 * (rpg-api SessionService.Interact, rpg-api#903 Phase 1). Read-only for
 * this slice: name + stock list, no buy/sell/price/wallet — the wire
 * (`VendorStockEntry`) carries no price field yet.
 *
 * Deliberately reuses `EquipmentPopover`/`InventoryLight`'s exact
 * `.equip-popover`/`.equip-inventory`/`.equip-inv-row` classes (same
 * floating hud-skin panel, same row grid) rather than new CSS — this is
 * the same "compact list of items with an icon and a status label" shape,
 * just non-interactive rows (`.gear`'s cursor: default treatment) instead
 * of equip-intent buttons.
 */

import type { VendorStockEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { getItemIconUrl } from '../../../utils/itemIcons';
import { vendorStockLabel } from './vendorStock';

export interface VendorPopoverProps {
  open: boolean;
  displayName: string;
  inventory: VendorStockEntry[];
  onClose: () => void;
}

export function VendorPopover({
  open,
  displayName,
  inventory,
  onClose,
}: VendorPopoverProps) {
  const reduced = useReducedMotion();

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
            <button
              type="button"
              className="verb-btn"
              onClick={onClose}
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
                return (
                  <div
                    key={entry.equipmentId}
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
                    <span className="equip-inv-name">{entry.displayName}</span>
                    <span className="equip-inv-stat">
                      {entry.equipmentType}
                    </span>
                    <span className="equip-inv-slot">
                      {vendorStockLabel(entry)}
                    </span>
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
