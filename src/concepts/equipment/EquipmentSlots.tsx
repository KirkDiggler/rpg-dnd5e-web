/**
 * EquipmentSlots (rpg-dnd5e-web#531) — the worn/wielded picture.
 *
 * Slots come from DATA (EquipSlotDef[] per fixture), never a hardcoded
 * list: a class or module that adds slots ships without a web release.
 * Each socket is a HUD-framed tile (sprite with token fallback) showing
 * the equipped item's icon, name, and server-provided stat line, or an
 * empty hint. Clicking an occupied socket emits an UnequipItem intent.
 */

import type { EquipCastFixture, EquipIntent, ItemFixture } from './fixtures';
import { resolveIconUrl } from './fixtures';

interface EquipmentSlotsProps {
  cast: EquipCastFixture;
  equipped: Record<string, string>;
  onIntent: (intent: EquipIntent) => void;
}

export function EquipmentSlots({
  cast,
  equipped,
  onIntent,
}: EquipmentSlotsProps) {
  const byId = new Map(cast.items.map((i) => [i.ref.id, i]));
  return (
    <div className="equip-slots hud-skin" data-testid="equipment-slots">
      {cast.slots.map((slot) => {
        const itemId = equipped[slot.key];
        const item: ItemFixture | undefined = itemId
          ? byId.get(itemId)
          : undefined;
        return (
          <button
            key={slot.key}
            className={`equip-socket${item ? '' : ' empty'}`}
            data-testid={`equip-socket-${slot.key}`}
            disabled={!item}
            aria-label={
              item
                ? `${slot.label}: ${item.name} — click to unequip`
                : `${slot.label}: empty`
            }
            title={
              item
                ? `${item.name} — ${item.statLine} (click to unequip)`
                : `${slot.label} — empty`
            }
            onClick={() =>
              item && onIntent({ kind: 'UnequipItem', slotKey: slot.key })
            }
          >
            <span className="equip-socket-label">{slot.label}</span>
            {item ? (
              <>
                <img
                  className="equip-socket-icon"
                  src={resolveIconUrl(item.iconKey)}
                  alt=""
                  draggable={false}
                />
                <span className="equip-socket-name">{item.name}</span>
                <span className="equip-socket-stat">{item.statLine}</span>
              </>
            ) : (
              <span className="equip-socket-hint">— empty —</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
