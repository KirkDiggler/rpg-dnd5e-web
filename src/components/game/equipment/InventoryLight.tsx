/**
 * InventoryLight (rpg-dnd5e-web#531, promoted to production for #571) —
 * the carried-items list, Kirk's "inventory light": a compact list, NOT a
 * grid. Rows show icon, name, server-provided stat line, and a slot-
 * compatibility badge. Clicking an equippable row emits an EquipItem
 * intent targeting the first compatible slot (empty preferred, else
 * swap). No-slot gear renders unclickable.
 *
 * Shared by the live game screen and the `/concepts` equipment bench — see
 * EquipmentSlots' doc comment.
 */

import type {
  EquipIntent,
  EquippedMap,
  ItemLike,
  SlotDefLike,
} from './equipmentTypes';
import { refKey, resolveIconUrl, targetSlotFor } from './equipmentTypes';

export interface InventoryLightProps {
  slots: SlotDefLike[];
  equipped: EquippedMap;
  /** Every owned item — carried rows are every item NOT referenced by
   * `equipped`'s values. */
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
  // Keyed by the full {module,type,id} triple, not bare ref.id — an id is
  // only unique within one {module,type} pair (Copilot review on #575).
  const equippedRefKeys = new Set(
    Object.values(equipped).map((ref) => refKey(ref))
  );
  const carried = items.filter((i) => !equippedRefKeys.has(refKey(i.ref)));
  const slotLabel = (key: string) =>
    slots.find((s) => s.key === key)?.displayLabel ?? key;

  return (
    <div className="equip-inventory hud-skin" data-testid="inventory-light">
      <div className="equip-inventory-header">Carried</div>
      {carried.length === 0 && (
        <div className="equip-inventory-empty">Nothing carried.</div>
      )}
      {carried.map((item) => {
        const target = targetSlotFor(item, slots, equipped);
        const iconUrl = resolveIconUrl(item.iconKey);
        return (
          <button
            key={refKey(item.ref)}
            className={`equip-inv-row${target ? '' : ' gear'}`}
            data-testid={`inv-${refKey(item.ref)}`}
            disabled={!target || busy}
            aria-label={
              target
                ? `${item.name} — equip to ${slotLabel(target)}`
                : `${item.name} — not equippable`
            }
            title={
              target
                ? `${item.name} — click to equip (${slotLabel(target)})`
                : `${item.name} — carried gear`
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
            <span className="equip-inv-name">{item.name}</span>
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
