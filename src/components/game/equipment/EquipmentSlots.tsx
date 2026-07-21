/**
 * EquipmentSlots (rpg-dnd5e-web#531, promoted to production for #571) —
 * the worn/wielded picture. Slots come from DATA (SlotDefLike[], server-
 * owned via CharacterData.slots), never a hardcoded list: a class or
 * module that adds slots ships without a web release. Each socket is a
 * HUD-framed tile (sprite with token fallback) showing the equipped item's
 * icon, name, and server-provided stat line, or an empty hint. Clicking an
 * occupied socket emits an UnequipItem intent.
 *
 * Shared by the live game screen (EncounterDock's equipment popover,
 * fed from the encounter-hydrated CharacterData) and the `/concepts`
 * equipment bench (fed from fixtures.ts) — same component, two data
 * sources, per rpg-dnd5e-web#571 scope.
 */

import type {
  EquipIntent,
  EquippedMap,
  ItemLike,
  SlotDefLike,
} from './equipmentTypes';
import { resolveIconUrl } from './equipmentTypes';

export interface EquipmentSlotsProps {
  slots: SlotDefLike[];
  equipped: EquippedMap;
  /** Every owned item (equipped or carried) — looked up by ref.id against
   * `equipped`'s Ref values to render each socket's contents. */
  items: ItemLike[];
  onIntent: (intent: EquipIntent) => void;
  /** A prior intent's RPC is in flight — disables every socket so a second
   * click can't race the first (mirrors actionsLoading on the verb row). */
  busy?: boolean;
}

export function EquipmentSlots({
  slots,
  equipped,
  items,
  onIntent,
  busy,
}: EquipmentSlotsProps) {
  const byId = new Map(items.map((i) => [i.ref.id, i]));
  return (
    <div className="equip-slots hud-skin" data-testid="equipment-slots">
      {slots.map((slot) => {
        const ref = equipped[slot.key];
        const item: ItemLike | undefined = ref ? byId.get(ref.id) : undefined;
        const iconUrl = item ? resolveIconUrl(item.iconKey) : undefined;
        return (
          <button
            key={slot.key}
            className={`equip-socket${item ? '' : ' empty'}`}
            data-testid={`equip-socket-${slot.key}`}
            disabled={!item || busy}
            aria-label={
              item
                ? `${slot.displayLabel}: ${item.name} — click to unequip`
                : `${slot.displayLabel}: empty`
            }
            title={
              item
                ? `${item.name} — ${item.statLine} (click to unequip)`
                : `${slot.displayLabel} — empty`
            }
            onClick={() =>
              item && onIntent({ kind: 'UnequipItem', slotKey: slot.key })
            }
          >
            <span className="equip-socket-label">{slot.displayLabel}</span>
            {item ? (
              <>
                {/* Graceful icon fallback (rpg-dnd5e-web#571): the server
                    sends icon_key empty today (rpg-api#680 Scope-decision),
                    and any future key could still miss the manifest —
                    resolveIconUrl returning undefined skips the <img>
                    entirely (no broken-image glyph); a load failure on a
                    key that DOES resolve hides itself the same way. */}
                {iconUrl && (
                  <img
                    className="equip-socket-icon"
                    src={iconUrl}
                    alt=""
                    draggable={false}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
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
