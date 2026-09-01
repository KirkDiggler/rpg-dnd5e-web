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

import { getItemIconUrl } from '../../../utils/itemIcons';
import type {
  EquipIntent,
  EquippedMap,
  ItemLike,
  SlotDefLike,
} from './equipmentTypes';
import { refKey, targetSlotFor } from './equipmentTypes';

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
  // Keyed by the full {module,type,id} triple, not bare ref.id — an id is
  // only unique within one {module,type} pair (Copilot review on #575).
  const equippedCounts = new Map<string, number>();
  for (const ref of Object.values(equipped)) {
    const key = refKey(ref);
    equippedCounts.set(key, (equippedCounts.get(key) ?? 0) + 1);
  }
  const carried = items.flatMap((item) => {
    // Legacy owner snapshots predate quantity and decode its wire default as
    // zero. Treat only that display case as one copy during rollout.
    const owned = item.quantity > 0 ? item.quantity : 1;
    const carriedCount = owned - (equippedCounts.get(refKey(item.ref)) ?? 0);
    return carriedCount > 0
      ? [{ item, carriedCount, showCount: carriedCount > 1 || owned > 1 }]
      : [];
  });
  const slotLabel = (key: string) =>
    slots.find((s) => s.key === key)?.displayLabel ?? key;

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
