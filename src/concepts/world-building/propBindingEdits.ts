/**
 * Editing a placed prop's orders — `holdable`, `holds`, `arrives`
 * (rpg-project#488 R1, rpg-toolkit#1855).
 *
 * THE BUILDER IS A FORM BUILDER, AND THESE ARE ITS MECHANICS. Every function
 * moves bytes the toolkit accepts: it never resolves a record id, never decides
 * whether a predicate resolves, and never pre-judges the engine's three
 * ownership refusals (an id that declares no prop, an id that is also a door,
 * an arrangement template). Nothing here rewrites a reference.
 *
 * THE SAME NORMALIZATION LAW AS `monsterOrderEdits`, and it is the encoder's:
 * an empty `holds` list is refused ("holds is empty; omit the key instead"),
 * and a binding that declares nothing is refused ("declares no orders"), so the
 * last held record's removal deletes its key and an emptied block becomes
 * `undefined` rather than `{}`. Absence is the authored state "none".
 */
import type { PredicateDoc } from '@/author/factionVocabulary';
import type { RoomPropBinding } from './roomDraft';

/** The authored orders, keyed by prop id. `undefined` is the authored state
 * "nothing here" and is the ONLY empty representation — never `{}`. */
export type PropBindings = Record<string, RoomPropBinding>;

/** Apply the encoder's refusals by NORMALIZING rather than validating: an empty
 * `holds` and a block with nothing left are dropped. `holdable: false` is NOT
 * dropped — it is a real authored answer that stays out of the bytes because
 * the engine writes a plain bool, which is the keying law rather than an
 * omission. */
export function normalizePropBinding(
  next: RoomPropBinding
): RoomPropBinding | undefined {
  const normalized: RoomPropBinding = {};
  if (next.holdable === true) normalized.holdable = true;
  if (next.holds !== undefined && next.holds.length > 0)
    normalized.holds = next.holds;
  if (next.arrives !== undefined) normalized.arrives = next.arrives;
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

/** Set or clear ONE prop's orders in the map. `undefined` deletes the entry,
 * and a map that empties becomes `undefined` so the key is omitted rather than
 * written as `{}`. */
export function withPropBinding(
  bindings: PropBindings | undefined,
  id: string,
  next: RoomPropBinding | undefined
): PropBindings | undefined {
  const map: PropBindings = { ...(bindings ?? {}) };
  const normalized =
    next === undefined ? undefined : normalizePropBinding(next);
  if (normalized === undefined) delete map[id];
  else map[id] = normalized;
  return Object.keys(map).length === 0 ? undefined : map;
}

function working(binding: RoomPropBinding | undefined): RoomPropBinding {
  return { ...(binding ?? {}) };
}

/** The items a `propBindings` entry may name: a declared prop that is not a
 * door.
 *
 * THE ENGINE'S TWO RULES, read here as a convenience rather than re-decided:
 * a binding needs the item to own a `propDeclarations` entry because that is
 * where the footprint comes from, and an id that is ALSO a door is refused
 * ("a door somebody picks up"). An item that already carries a binding stays
 * listed whatever else changed, so an authored block can never become
 * unreachable. */
export function propBindingCandidateIds(
  items: ReadonlyArray<{ id: string }>,
  bindings: PropBindings | undefined,
  declaredIds: ReadonlySet<string>,
  doorIds: ReadonlySet<string>
): string[] {
  return items
    .filter(
      (item) =>
        bindings?.[item.id] !== undefined ||
        (declaredIds.has(item.id) && !doorIds.has(item.id))
    )
    .map((item) => item.id);
}

/** Set or clear `holdable`. `false` is normalized away rather than written:
 * the engine's field is a plain bool, and "a thing nobody declared holdable
 * stays scenery" is what an absent key means. */
export function setPropHoldable(
  binding: RoomPropBinding | undefined,
  holdable: boolean
): RoomPropBinding | undefined {
  return normalizePropBinding({ ...working(binding), holdable });
}

/** Add an intel record id to this prop's `holds`. Order is authored and
 * preserved; a duplicate is prevented because carrying one record twice means
 * nothing the second time. */
export function addPropHold(
  binding: RoomPropBinding | undefined,
  recordId: string
): RoomPropBinding | undefined {
  const next = working(binding);
  const holds = next.holds ?? [];
  if (holds.includes(recordId)) return binding;
  return normalizePropBinding({ ...next, holds: [...holds, recordId] });
}

export function removePropHold(
  binding: RoomPropBinding | undefined,
  recordId: string
): RoomPropBinding | undefined {
  const next = working(binding);
  return normalizePropBinding({
    ...next,
    holds: (next.holds ?? []).filter((id) => id !== recordId),
  });
}

/** Set or clear the predicate that brings this prop into the run. `undefined`
 * removes it, so the prop stands there from the first frame. */
export function setPropArrives(
  binding: RoomPropBinding | undefined,
  arrives: PredicateDoc | undefined
): RoomPropBinding | undefined {
  return normalizePropBinding({ ...working(binding), arrives });
}
