/**
 * Editing ONE creature's own orders and interaction facts — its `on`, its
 * `temper`, its `actions` (rpg-dnd5e-web#1164), and its `intimidate`,
 * `persuade`, `arrives` and `holds` (rpg-dnd5e-web#1176).
 *
 * THE BUILDER IS A FORM BUILDER, AND THESE ARE ITS MECHANICS, NOT ITS
 * OPINIONS. Every function here moves bytes the toolkit already accepts
 * (`RoomMonsterBinding`, `dungeonspec/single_room.go`): it never decides which
 * action a creature swings first, never orders the actions for the author,
 * never reads a `when`, never decides whether a check route resolves, and
 * never resolves a `holds` record id. A weapon ref, an ability ref and an
 * `arrives` predicate are carried exactly as authored — whether one resolves
 * is the server's judgement, not this module's.
 *
 * TWO LEVELS, AND THE SPLIT IS DELIBERATE. The per-binding helpers below edit
 * ONE creature and answer with that creature's orders or `undefined`, which is
 * the authored state "this creature overrides nothing". `withBinding` is the
 * MAP level — the caller's, because the caller is the one holding the room —
 * and it is what turns "this creature has no orders" into a deleted entry.
 *
 * THE NORMALIZATION IS THE WHOLE POINT, AND IT IS NOT COSMETIC. The encoder
 * REFUSES these states outright (`roomDraft.ts`'s `validateMonsterBindings`):
 *
 *   `actions: []`          -> "actions is empty; omit the key instead."
 *   `intimidate: []`       -> "intimidate is empty; omit the key instead."
 *   `holds: []`            -> "holds is empty; omit the key instead."
 *   a binding with no keys -> "declares no orders; omit the binding instead."
 *
 * So removing the last weapon, the last check row or the last held record is
 * not a list edit — it must delete that key, and if nothing else is left, the
 * binding. An author who emptied their last override would otherwise publish a
 * document the engine refuses. `normalizeBinding` is the ONE place that law
 * lives, every helper routes through it, and `withBinding` applies it again at
 * the map level exactly as `removeRoomMonster` does when a creature is deleted.
 *
 * ABSENCE IS THE AUTHORED STATE "NONE", NOT "EMPTY". A creature with no orders
 * block keeps everything its faction supplies, and a document that authors no
 * orders must stay byte-identical to one written before bindings existed.
 */
import type { PredicateDoc } from '@/author/factionVocabulary';
import type { AnswerEntryShape, AnswerTableShape } from './answerTableShape';
import type { RoomCheckApproach, RoomMonsterBinding } from './roomDraft';
import { defaultAnswerEntry } from './sitePolicyEdits';

/** The authored orders, keyed by creature id. `undefined` is the authored
 * state "nothing here" and is the ONLY empty representation — never `{}`. */
export type MonsterBindings = Record<string, RoomMonsterBinding>;

/** Apply the encoder's two refusals by NORMALIZING rather than by validating:
 * an empty table, an empty action list and an empty temper are dropped, and a
 * binding with nothing left becomes `undefined`. */
export function normalizeBinding(
  next: RoomMonsterBinding
): RoomMonsterBinding | undefined {
  const normalized: RoomMonsterBinding = {};
  if (next.on !== undefined && Object.keys(next.on).length > 0)
    normalized.on = next.on;
  if (next.temper !== undefined && next.temper !== '')
    normalized.temper = next.temper;
  // An empty list is refused, so it is never stored: `actions` is present only
  // when it carries at least one weapon.
  if (next.actions !== undefined && next.actions.length > 0)
    normalized.actions = next.actions;
  // The interaction + reserve facts keep the SAME law (web#1176): the encoder
  // refuses an empty check list, an empty `holds`, and a binding that declares
  // nothing, so every one of them is dropped here rather than written out.
  if (next.intimidate !== undefined && next.intimidate.length > 0)
    normalized.intimidate = next.intimidate;
  if (next.persuade !== undefined && next.persuade.length > 0)
    normalized.persuade = next.persuade;
  if (next.holds !== undefined && next.holds.length > 0)
    normalized.holds = next.holds;
  if (next.arrives !== undefined) normalized.arrives = next.arrives;
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

/** Set or clear ONE creature's orders in the map. `undefined` deletes the
 * entry, and a map that empties becomes `undefined` so the key is omitted from
 * the document rather than written as `{}`. */
export function withBinding(
  bindings: MonsterBindings | undefined,
  id: string,
  next: RoomMonsterBinding | undefined
): MonsterBindings | undefined {
  const map: MonsterBindings = { ...(bindings ?? {}) };
  const normalized = next === undefined ? undefined : normalizeBinding(next);
  if (normalized === undefined) delete map[id];
  else map[id] = normalized;
  return Object.keys(map).length === 0 ? undefined : map;
}

/** The creature's orders as a working copy. An absent binding and an empty one
 * are the same thing to an editor, so both arrive here as `{}`. */
function working(binding: RoomMonsterBinding | undefined): RoomMonsterBinding {
  return { ...(binding ?? {}) };
}

/** Set the creature's temperament, or clear it. ONE WORD — never a mix: the
 * placement names one creature, so dealing a spread for it would be an author
 * rolling for a goblin they have already described. `RoomMonsterBinding.Temper`
 * is a plain `string` where `FactionSpec.Temper` is a `TemperSpec`. */
export function setMonsterTemper(
  binding: RoomMonsterBinding | undefined,
  temper: string | undefined
): RoomMonsterBinding | undefined {
  return normalizeBinding({ ...working(binding), temper });
}

/** Append a weapon to the END of the list. Order is authored, so a new weapon
 * never displaces one — the author moves it if they want it first. */
export function addMonsterAction(
  binding: RoomMonsterBinding | undefined,
  ref: string
): RoomMonsterBinding | undefined {
  const next = working(binding);
  return normalizeBinding({
    ...next,
    actions: [...(next.actions ?? []), ref],
  });
}

/** Remove one weapon by index. Removing the last one drops the key, and
 * possibly the whole binding — see this file's header. */
export function removeMonsterAction(
  binding: RoomMonsterBinding | undefined,
  index: number
): RoomMonsterBinding | undefined {
  const next = working(binding);
  return normalizeBinding({
    ...next,
    actions: (next.actions ?? []).filter((_, i) => i !== index),
  });
}

/** Move a weapon to another position. THE ORDER IS THE POINT: both turn
 * drivers take the first action whose target is in reach, so moving a weapon
 * changes which one a creature reaches for — this is the control that authors
 * "the archer draws a scimitar only when cornered". An out-of-range or no-op
 * move returns the binding UNCHANGED rather than guessing, and never
 * `undefined`: a refused move is not an emptied creature. */
export function moveMonsterAction(
  binding: RoomMonsterBinding | undefined,
  from: number,
  to: number
): RoomMonsterBinding | undefined {
  const next = working(binding);
  const actions = [...(next.actions ?? [])];
  if (from === to) return binding;
  if (from < 0 || from >= actions.length) return binding;
  if (to < 0 || to >= actions.length) return binding;
  const moved = actions.splice(from, 1)[0];
  if (moved === undefined) return binding;
  actions.splice(to, 0, moved);
  return normalizeBinding({ ...next, actions });
}

/** Add an entry on a trigger, defaulted from the ONE vocabulary declaration
 * (`sitePolicyEdits.defaultAnswerEntry`) so a creature's table and a faction's
 * cannot drift apart. */
export function addMonsterAnswerEntry(
  binding: RoomMonsterBinding | undefined,
  trigger: string
): RoomMonsterBinding | undefined {
  const next = working(binding);
  const table = next.on ?? {};
  return normalizeBinding({
    ...next,
    on: {
      ...table,
      [trigger]: [...(table[trigger] ?? []), defaultAnswerEntry(trigger)],
    },
  });
}

/** Replace one entry by index. An out-of-range index returns the binding
 * unchanged. */
export function patchMonsterAnswerEntry(
  binding: RoomMonsterBinding | undefined,
  trigger: string,
  index: number,
  entry: AnswerEntryShape
): RoomMonsterBinding | undefined {
  const next = working(binding);
  const table: AnswerTableShape = { ...(next.on ?? {}) };
  const entries = [...(table[trigger] ?? [])];
  if (index < 0 || index >= entries.length) return binding;
  entries[index] = entry;
  table[trigger] = entries;
  return normalizeBinding({ ...next, on: table });
}

/** Remove one entry by index. Removing the last entry on a trigger drops the
 * trigger key: an empty entry list is never valid (`answerTableShape.ts`), and
 * a trigger with nothing on it is absence, not an authored empty list. */
export function removeMonsterAnswerEntry(
  binding: RoomMonsterBinding | undefined,
  trigger: string,
  index: number
): RoomMonsterBinding | undefined {
  const next = working(binding);
  const table: AnswerTableShape = { ...(next.on ?? {}) };
  const entries = (table[trigger] ?? []).filter((_, i) => i !== index);
  if (entries.length === 0) delete table[trigger];
  else table[trigger] = entries;
  return normalizeBinding({ ...next, on: table });
}

// ---------------------------------------------------------------------------
// The creature's interaction facts (rpg-dnd5e-web#1176): the priced checks the
// party must beat, the records it carries, and the predicate that holds it in
// reserve. Every one of these is CARRIED, NOT GRADED — a route's ability is an
// opaque ref, a `holds` id names a record the engine resolves at compile, and
// what an `arrives` form means is the engine's judgement. Nothing here decides
// whether a check succeeds or a record exists.

/** One authored check route — the default a new row starts from. `dc: 1` is a
 * legal-but-uninteresting authored number rather than a derived one, so the
 * author always sees the number the engine will use; the ability is the first
 * the caller offers, because this module has no rules catalog of its own. */
export function defaultCheckApproach(ability: string): RoomCheckApproach {
  return { ability, dc: 1 };
}

/** Append a check route to `intimidate` or `persuade`. The route is carried
 * verbatim; an empty `ability` is the caller's to seed, not this module's to
 * invent a rules word for. */
export function addMonsterCheck(
  binding: RoomMonsterBinding | undefined,
  key: 'intimidate' | 'persuade',
  approach: RoomCheckApproach
): RoomMonsterBinding | undefined {
  const next = working(binding);
  return normalizeBinding({
    ...next,
    [key]: [...(next[key] ?? []), approach],
  });
}

/** Patch one check route by index. An out-of-range index returns the binding
 * unchanged, and never `undefined`. */
export function patchMonsterCheck(
  binding: RoomMonsterBinding | undefined,
  key: 'intimidate' | 'persuade',
  index: number,
  approach: RoomCheckApproach
): RoomMonsterBinding | undefined {
  const next = working(binding);
  const rows = [...(next[key] ?? [])];
  if (index < 0 || index >= rows.length) return binding;
  rows[index] = approach;
  return normalizeBinding({ ...next, [key]: rows });
}

/** Remove one check route. Removing the last one drops the key — an empty
 * list is refused by the encoder, so absence is the authored state. */
export function removeMonsterCheck(
  binding: RoomMonsterBinding | undefined,
  key: 'intimidate' | 'persuade',
  index: number
): RoomMonsterBinding | undefined {
  const next = working(binding);
  return normalizeBinding({
    ...next,
    [key]: (next[key] ?? []).filter((_, i) => i !== index),
  });
}

/** Add an intel record id to this creature's `holds`. Order is authored and
 * preserved; a duplicate is prevented because holding one record twice means
 * nothing the second time. */
export function addMonsterHold(
  binding: RoomMonsterBinding | undefined,
  recordId: string
): RoomMonsterBinding | undefined {
  const next = working(binding);
  const holds = next.holds ?? [];
  if (holds.includes(recordId)) return binding;
  return normalizeBinding({ ...next, holds: [...holds, recordId] });
}

export function removeMonsterHold(
  binding: RoomMonsterBinding | undefined,
  recordId: string
): RoomMonsterBinding | undefined {
  const next = working(binding);
  return normalizeBinding({
    ...next,
    holds: (next.holds ?? []).filter((id) => id !== recordId),
  });
}

/** Set or clear the predicate that holds this creature in reserve. `undefined`
 * removes it, so the creature stands there from the first frame. The predicate
 * is carried whole in the one shared shape; whether its form resolves is the
 * engine's question. */
export function setMonsterArrives(
  binding: RoomMonsterBinding | undefined,
  arrives: PredicateDoc | undefined
): RoomMonsterBinding | undefined {
  return normalizeBinding({ ...working(binding), arrives });
}
