/**
 * Shared wire-shaped types for the equipment chip + popover (rpg-dnd5e-web
 * #571, promoting the #557 concept bench to the live game screen).
 *
 * These interfaces match the generated `dnd5e.api.v1alpha2.encounter` proto
 * types (`Ref`, `SlotDef`, `Item`) field-for-field — same names, same
 * shapes — rather than importing the generated classes directly, so the
 * `/concepts` equipment bench can keep feeding plain fixture data (per
 * CONTRACT.md's fixture-first convention) without constructing real proto
 * messages. The live game screen builds these directly off
 * `CharacterData.slots`/`inventory`/`equipped` (see
 * `src/hooks/useEncounterState.ts`'s `CharacterEquipment`); the concept
 * page builds them off `fixtures.ts`. One component tree, two data
 * sources, zero conversion layers beyond "same shape, different origin."
 */

/** {module, type, id} — matches the wire's Ref message. */
export interface RefLike {
  module: string;
  type: string;
  id: string;
}

/** One equip socket — matches the wire's SlotDef message. */
export interface SlotDefLike {
  /** "main_hand" | "off_hand" | "armor" — opaque to the web. */
  key: string;
  displayLabel: string;
  /** Item kinds this slot accepts, e.g. ["weapon", "shield"]. */
  accepts: string[];
}

/** One owned item (equipped or carried) — matches the wire's Item message. */
export interface ItemLike {
  ref: RefLike;
  name: string;
  /** Server-composed: "1d8 slashing · versatile", "AC 16 · heavy". */
  statLine: string;
  /** Reference key into the asset-owned manifest — may be empty (see
   * resolveIconUrl below); the web never invents one. */
  iconKey: string;
  /** "weapon" | "shield" | "armor" | "gear" — open vocabulary. */
  kind: string;
  /** Slot keys this item may occupy, e.g. ["main_hand", "off_hand"]. */
  slotKeys: string[];
}

/** slot key -> the Ref worn/wielded there — matches CharacterData.equipped. */
export type EquippedMap = Record<string, RefLike>;

/** The intent an equip/unequip click emits — exactly the RPC request shape
 * (dnd5e.api.v1alpha2.character.CharacterService.EquipItem/UnequipItem). */
export type EquipIntent =
  | { kind: 'EquipItem'; ref: RefLike; slotKey: string }
  | { kind: 'UnequipItem'; slotKey: string };

/**
 * Canonical string key for a Ref — "module:type:id", the same format the
 * encounter's `reactionReadiness` map already keys reaction refs by
 * (`useEncounterState.ts`). Used wherever items/equipped-slots need to be
 * looked up or deduplicated by identity: `ref.id` alone is only unique
 * within one `{module, type}` pair — a homebrew module or a future item
 * `type` split could otherwise collide two different items on the same
 * bare id (Copilot review on #575).
 */
export function refKey(ref: RefLike): string {
  return `${ref.module}:${ref.type}:${ref.id}`;
}

const ICON_LIBRARY_BASE = '/models/synty/ui/library';

/**
 * UI-boundary resolver: manifest key -> URL, or undefined for a graceful
 * no-icon fallback. Today the server always sends an empty `icon_key`
 * (rpg-api#680 Scope-decision: no toolkit/asset-manifest source exists yet
 * for a bare sprite key — see rpg-api's character_data.go) — components
 * must render the item's name/stat line without an image rather than a
 * broken `<img>`. Kept as a resolver (not baked into ItemLike) so a future
 * manifest key format change touches one function, not every call site.
 */
export function resolveIconUrl(iconKey: string): string | undefined {
  return iconKey ? `${ICON_LIBRARY_BASE}/${iconKey}` : undefined;
}

/**
 * First compatible slot for a carried item given current occupancy —
 * prefer an empty compatible slot, else the first compatible (a swap).
 * This is UI affordance only (which button click maps to which slot_key on
 * the outgoing EquipItem intent) — the server is the only legality judge;
 * an illegal choice here just means the RPC comes back with an error.
 */
export function targetSlotFor(
  item: ItemLike,
  slots: SlotDefLike[],
  equipped: EquippedMap
): string | undefined {
  const compatible = slots.filter(
    (s) => item.slotKeys.includes(s.key) && s.accepts.includes(item.kind)
  );
  return compatible.find((s) => !equipped[s.key])?.key ?? compatible[0]?.key;
}
