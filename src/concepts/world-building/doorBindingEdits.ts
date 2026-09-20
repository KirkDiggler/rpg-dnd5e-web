/**
 * Editing ONE placed item's door state — that it is a door at all, and what
 * state it rests in (rpg-project#485).
 *
 * THE BUILDER IS A FORM BUILDER, AND THESE ARE ITS MECHANICS, NOT ITS
 * OPINIONS. Every function here moves bytes the toolkit already accepts
 * (`RoomDoorBinding`, `dungeonspec/single_room_doors.go`): it never names an
 * ability, never picks a DC, never orders the approaches for the author, and
 * never reads whether a ref resolves. A row is carried exactly as typed.
 *
 * THE THIRD DECLARATION KIND, AND THE ONE PLACE THE ANALOGY BREAKS. This file
 * is `monsterOrderEdits.ts` one declaration kind over — same map level, same
 * normalize-rather-than-validate law — and the split between the per-binding
 * helpers and `withDoorBinding` is the same split for the same reason. But
 * `monsterOrderEdits` DELETES an emptied binding, because a creature's orders
 * are an override layer over a creature that exists without them. A door is
 * not like that:
 *
 *   FOR A DOOR THE BINDING'S EXISTENCE *IS* THE DOOR.
 *
 * `closed: false` is not writable — the engine's `Closed` is `omitempty`, so
 * it never emits one either — which means a door resting OPEN is an EMPTY
 * binding, `{}`. So `normalizeDoorBinding` returns a shape and never
 * `undefined`, and only an explicit `withDoorBinding(..., undefined)` — the
 * author choosing "not a door" — removes the entry. Emptying a door is a
 * state; it is never a deletion. Getting this backwards would quietly turn
 * every unlocked door in a published site into a wall.
 *
 * THE ONE THING NORMALIZED IS WHAT THE ENGINE CANNOT READ AT ALL: an empty
 * `locked` list, which is refused by name ("this locked door needs at least one
 * way through it"), and a `tool` or a `closed` the engine would have omitted.
 * Everything else — an unknown ability, a dc of 0 — is CARRIED and judged by
 * the server at its own path, because a refusal this module invented would be
 * a second grammar (rpg-project#481/#483).
 *
 * ABSENCE IS THE AUTHORED STATE "NOT A DOOR", NOT "EMPTY". A room that
 * authors no doors must still emit the bytes it always did, so
 * `withDoorBinding` answers `undefined` for an emptied map and the caller
 * omits the key.
 */
import { resolveWorldAsset } from '@/generated/worldAssetCatalog';
import type { RoomDoorApproach, RoomDoorBinding } from './roomDraft';

/** The authored door state, keyed by item id. `undefined` is "nothing here and
 * nothing was written" and is the ONLY empty representation — never `{}`. */
export type DoorBindings = Record<string, RoomDoorBinding>;

/** The four states the panel offers for one item, which are the engine's four
 * authored states exactly: no binding, `{}`, `{closed:true}`, `{locked:[...]}`.
 * `none` is a real authored state rather than a fifth option invented here —
 * it is what makes a placed door not a door, and what makes one removable. */
export type DoorBindingState = 'none' | 'open' | 'closed' | 'locked';

/** A fresh approach row, taken from the engine's own example for this key
 * (`gate-1: { closed: true, locked: [{ ability: str, dc: 15 }] }` in
 * `RoomDoorBinding`'s godoc) so a row is a legal document the moment it
 * appears rather than one the engine refuses for an empty ability or a dc of
 * 0. The author changes either; nothing here defends against them changing it
 * to something the server will refuse. */
export function defaultDoorApproach(): RoomDoorApproach {
  return { ability: 'str', dc: 15 };
}

/** Apply the engine's own absence rules by NORMALIZING rather than by
 * validating: a `closed` that is false is dropped (absence is an open doorway,
 * and `Closed` never emits a false), a `tool` that is empty is dropped, and an
 * EMPTY approach list drops the `locked` key instead of writing `[]`, which
 * the engine refuses by name.
 *
 * IT NEVER ANSWERS `undefined`. See this file's header: an empty result is a
 * door resting open, not a missing door, and only the map level deletes. */
export function normalizeDoorBinding(next: RoomDoorBinding): RoomDoorBinding {
  const normalized: RoomDoorBinding = {};
  if (next.closed === true) normalized.closed = true;
  if (next.locked !== undefined && next.locked.length > 0) {
    normalized.locked = next.locked.map((row) => {
      const approach: RoomDoorApproach = { ability: row.ability, dc: row.dc };
      if (row.tool !== undefined && row.tool !== '') approach.tool = row.tool;
      return approach;
    });
  }
  return normalized;
}

/** Set or clear ONE item's door state in the map. `undefined` is the author's
 * "this is not a door" and deletes the entry; a map that empties becomes
 * `undefined` so the key is omitted from the document rather than written as
 * `{}` — absent-not-empty, the law every optional key in this document keeps.
 *
 * NOTE WHAT IS *NOT* HERE: passing `{}` does not delete. That is the author
 * saying "a door, open". */
export function withDoorBinding(
  bindings: DoorBindings | undefined,
  id: string,
  next: RoomDoorBinding | undefined
): DoorBindings | undefined {
  const map: DoorBindings = { ...(bindings ?? {}) };
  if (next === undefined) delete map[id];
  else map[id] = normalizeDoorBinding(next);
  return Object.keys(map).length === 0 ? undefined : map;
}

/** Which of the four states this item is in, for a control that shows one.
 * An absent binding and an empty one are NOT the same thing here, unlike
 * `monsterOrderEdits`' `working` — which is the whole point of `none`. */
export function doorBindingState(
  binding: RoomDoorBinding | undefined
): DoorBindingState {
  if (binding === undefined) return 'none';
  // LOCKED OUTRANKS CLOSED: the engine's own law, so a locked door reports
  // `locked` however `closed` reads.
  if (binding.locked !== undefined && binding.locked.length > 0)
    return 'locked';
  return binding.closed === true ? 'closed' : 'open';
}

/** Move one item between the four states. `none` is the deletion; the other
 * three write a binding.
 *
 * LOCKING DROPS `closed`. The engine ignores `closed` beside a lock ("a locked
 * door is shut by definition"), so keeping it would be publishing a key that
 * means nothing — and the v2 door inspector drops it the same way. The
 * consequence is deliberate and visible: UN-LOCKING LANDS ON `open`, not on
 * shut, because the document never claimed it was shut.
 *
 * An existing lock's approaches are CARRIED, so toggling locked → closed →
 * locked does not rebuild the checks the author typed. */
export function setDoorBindingState(
  binding: RoomDoorBinding | undefined,
  state: DoorBindingState
): RoomDoorBinding | undefined {
  switch (state) {
    case 'none':
      return undefined;
    case 'open':
      return normalizeDoorBinding({});
    case 'closed':
      return normalizeDoorBinding({ closed: true });
    case 'locked':
      return normalizeDoorBinding({
        locked: binding?.locked ?? [defaultDoorApproach()],
      });
  }
}

/** Append an approach to the END of the lock's list. Order is authored and the
 * list is a set of alternatives, so nothing sorts or dedupes it. */
export function addDoorApproach(
  binding: RoomDoorBinding | undefined
): RoomDoorBinding {
  return normalizeDoorBinding({
    ...binding,
    locked: [...(binding?.locked ?? []), defaultDoorApproach()],
  });
}

/** Patch one approach by field. `tool: undefined` CLEARS the tool, which is
 * how the input's empty string reaches here — the normalization drops it, so
 * the key is removed rather than written empty. An out-of-range index returns
 * the binding unchanged rather than guessing. */
export function patchDoorApproach(
  binding: RoomDoorBinding | undefined,
  index: number,
  patch: Partial<RoomDoorApproach>
): RoomDoorBinding {
  const rows = [...(binding?.locked ?? [])];
  const current = rows[index];
  if (current === undefined) return normalizeDoorBinding({ ...binding });
  rows[index] = { ...current, ...patch };
  return normalizeDoorBinding({ ...binding, locked: rows });
}

/** Remove one approach by index.
 *
 * REMOVING THE LAST ONE REMOVES THE LOCK, NOT THE DOOR. `locked: []` is
 * refused by the engine, so the key goes — and what is left is the binding the
 * door already had, which is a door resting open. The panel also refuses to
 * remove the last row, the way the v2 door inspector does; this helper is
 * total anyway so a programmatic caller cannot publish a refused document. */
export function removeDoorApproach(
  binding: RoomDoorBinding | undefined,
  index: number
): RoomDoorBinding {
  return normalizeDoorBinding({
    ...binding,
    locked: (binding?.locked ?? []).filter((_, i) => i !== index),
  });
}

/** Whether this ref's asset declares a `leaf` — the renderer's own signal that
 * something on it swings.
 *
 * IT IS THE ONLY WAY THE BUILDER CAN SEE A DOOR CANDIDATE, AND IT IS NOT A
 * STATEMENT ABOUT THE DOCUMENT. The engine has never heard of a catalog: an
 * item is a door there because `doorBindings` says so, and a placed door whose
 * author never authored a binding is a walk-through prop with a door-shaped
 * mesh. This is the gap the panel closes, not a rule it enforces. */
export function isDoorAsset(assetRef: string): boolean {
  return (resolveWorldAsset(assetRef)?.roles ?? []).some(
    (role) => role.role === 'leaf'
  );
}

/** The placed items the Doors panel offers, in the caller's order: every prop
 * whose asset declares a leaf, UNION every item that already carries a
 * binding. The union matters in both directions — without the first half an
 * author could not author a door they have just placed, and without the second
 * a binding made before the catalog changed would be invisible, unedited and
 * unremovable while still being published. */
export function doorCandidateIds(
  items: ReadonlyArray<{ id: string; assetRef: string }>,
  bindings: DoorBindings | undefined
): string[] {
  return items
    .filter(
      (item) => isDoorAsset(item.assetRef) || bindings?.[item.id] !== undefined
    )
    .map((item) => item.id);
}
