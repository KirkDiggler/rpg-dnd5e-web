/**
 * InventoryLight (rpg-dnd5e-web#531) — the carried-items list, Kirk's
 * "inventory light": a compact list, NOT a grid. Rows show icon, name,
 * server-provided stat line, and a slot-compatibility badge. Clicking an
 * equippable row emits an EquipItem intent targeting the first compatible
 * slot (empty preferred, else swap). No-slot gear renders unclickable.
 */

import type { EquipCastFixture, EquipIntent } from './fixtures';
import { resolveIconUrl, targetSlotFor } from './fixtures';

interface InventoryLightProps {
  cast: EquipCastFixture;
  equipped: Record<string, string>;
  onIntent: (intent: EquipIntent) => void;
}

export function InventoryLight({
  cast,
  equipped,
  onIntent,
}: InventoryLightProps) {
  const equippedIds = new Set(Object.values(equipped));
  const carried = cast.items.filter((i) => !equippedIds.has(i.ref.id));
  const slotLabel = (key: string) =>
    cast.slots.find((s) => s.key === key)?.label ?? key;

  return (
    <div className="equip-inventory hud-skin" data-testid="inventory-light">
      <div className="equip-inventory-header">Carried</div>
      {carried.length === 0 && (
        <div className="equip-inventory-empty">Nothing carried.</div>
      )}
      {carried.map((item) => {
        const target = targetSlotFor(item, cast.slots, equipped);
        return (
          <button
            key={item.ref.id}
            className={`equip-inv-row${target ? '' : ' gear'}`}
            data-testid={`inv-${item.ref.id}`}
            disabled={!target}
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
            <img
              className="equip-inv-icon"
              src={resolveIconUrl(item.iconKey)}
              alt=""
              draggable={false}
            />
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
