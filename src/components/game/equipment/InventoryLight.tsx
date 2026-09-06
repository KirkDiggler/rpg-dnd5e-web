/**
 * InventoryLight (rpg-dnd5e-web#531, promoted to production for #571) —
 * the carried-items list, Kirk's "inventory light": a compact list, NOT a
 * grid. Rows show icon, name, server-provided stat line, and a slot-
 * compatibility badge. Clicking an equippable row emits an EquipItem
 * intent targeting the first compatible slot (empty preferred, else
 * swap). No-slot gear renders unclickable — except a pack
 * (`equipmentType === 'pack'`, rpg-toolkit#1546), which gets an "Unpack"
 * affordance instead: click to reveal an inline "Unpack {name}?
 * [Confirm][Cancel]" row, same pattern the vendor popover's Buy/Sell rows
 * already use. One pack instance per click, no quantity picker (matches
 * this codebase's own "one unit per click" convention for Trade).
 *
 * Shared by the live game screen and the `/concepts` equipment bench — see
 * EquipmentSlots' doc comment.
 */

import { useState } from 'react';
import { getItemIconUrl } from '../../../utils/itemIcons';
import type {
  EquipIntent,
  EquippedMap,
  ItemLike,
  SlotDefLike,
} from './equipmentTypes';
import { computeCarried, refKey, targetSlotFor } from './equipmentTypes';

export interface InventoryLightProps {
  slots: SlotDefLike[];
  equipped: EquippedMap;
  /** Every owned item — carried rows show each stack's unequipped copies. */
  items: ItemLike[];
  onIntent: (intent: EquipIntent) => void;
  /** A prior intent's RPC is in flight — disables every row so a second
   * click can't race the first (mirrors actionsLoading on the verb row). */
  busy?: boolean;
}

export function InventoryLight({
  slots,
  equipped,
  items,
  onIntent,
  busy,
}: InventoryLightProps) {
  const carried = computeCarried(items, equipped);
  const slotLabel = (key: string) =>
    slots.find((s) => s.key === key)?.displayLabel ?? key;
  // Which pack row is asking "Unpack {name}?" right now — cleared on
  // confirm or cancel. Only one row at a time, mirroring VendorPopover's
  // own pendingEntry/pendingSell.
  const [pendingUnpack, setPendingUnpack] = useState<ItemLike | null>(null);

  return (
    <div className="equip-inventory hud-skin" data-testid="inventory-light">
      <div className="equip-inventory-header">Carried</div>
      {carried.length === 0 && (
        <div className="equip-inventory-empty">Nothing carried.</div>
      )}
      {carried.map(({ item, carriedCount, showCount }) => {
        const target = targetSlotFor(item, slots, equipped);
        const iconUrl = getItemIconUrl(item.ref, item.iconKey);
        const displayName = `${item.name}${showCount ? ` ×${carriedCount}` : ''}`;
        const isPack = item.equipmentType === 'pack';
        const isPendingUnpack =
          isPack &&
          pendingUnpack !== null &&
          refKey(pendingUnpack.ref) === refKey(item.ref);

        if (isPack) {
          return (
            <div key={refKey(item.ref)}>
              <div
                className="equip-inv-row gear"
                data-testid={`inv-${refKey(item.ref)}`}
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
                <span className="equip-inv-name">{displayName}</span>
                <span className="equip-inv-stat">{item.statLine}</span>
                <span className="equip-inv-slot">pack</span>
              </div>
              {isPendingUnpack ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.375rem 0.625rem 0.625rem',
                  }}
                  data-testid={`unpack-confirm-${refKey(item.ref)}`}
                >
                  <span style={{ flex: 1 }}>Unpack {item.name}?</span>
                  <button
                    type="button"
                    className="verb-btn"
                    disabled={busy}
                    aria-label={`Confirm unpack ${item.name}`}
                    onClick={() => {
                      onIntent({
                        kind: 'Unpack',
                        ref: item.ref,
                        name: item.name,
                        quantity: 1,
                      });
                      setPendingUnpack(null);
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="verb-btn"
                    disabled={busy}
                    aria-label="Cancel unpack"
                    onClick={() => setPendingUnpack(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ padding: '0.375rem 0.625rem 0.625rem' }}>
                  <button
                    type="button"
                    className="verb-btn"
                    data-testid={`unpack-${refKey(item.ref)}`}
                    disabled={busy}
                    aria-label={`Unpack ${item.name}`}
                    onClick={() => setPendingUnpack(item)}
                  >
                    Unpack
                  </button>
                </div>
              )}
            </div>
          );
        }

        return (
          <button
            key={refKey(item.ref)}
            className={`equip-inv-row${target ? '' : ' gear'}`}
            data-testid={`inv-${refKey(item.ref)}`}
            disabled={!target || busy}
            aria-label={
              target
                ? `${displayName} — equip to ${slotLabel(target)}`
                : `${displayName} — not equippable`
            }
            title={
              target
                ? `${displayName} — click to equip (${slotLabel(target)})`
                : `${displayName} — carried gear`
            }
            onClick={() =>
              target &&
              onIntent({ kind: 'EquipItem', ref: item.ref, slotKey: target })
            }
          >
            {/* Graceful icon fallback — see EquipmentSlots' doc comment. */}
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
            <span className="equip-inv-name">{displayName}</span>
            <span className="equip-inv-stat">{item.statLine}</span>
            <span className="equip-inv-slot">
              {target ? slotLabel(target) : 'gear'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
