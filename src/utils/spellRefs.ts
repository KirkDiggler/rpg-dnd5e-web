/**
 * spellRefs — the client's only reading of a `dnd5e:spells:<id>` ref string.
 *
 * SPELLS TRAVEL AS REFS, NOT AS AN ENUM (design rpg-project#405, R8).
 * `SpellOptions.available_refs` and `SpellSelection.spell_refs` carry the full
 * `core.Ref.String()` the toolkit's own catalog speaks; the closed `Spell`
 * enum is deprecated on both fields and is never read here.
 *
 * A LABEL DERIVED FROM A REF IS A LAST RESORT, NOT A NAME TABLE. Everywhere
 * the server authors a display name — an `AbilityRef`, an `AttackRef`, a
 * `SpellRef` on a cast or save beat — that name is used verbatim and this
 * module is not involved. The one place with nothing else to draw is the
 * creation picker: `SpellOptions` carries refs and no names, and its own
 * contract says a client that cannot resolve a ref shows the ref rather than
 * mistaking it for `SPELL_UNSPECIFIED`. This titleizes the id so the grid
 * reads "Vicious Mockery" instead of "dnd5e:spells:vicious-mockery", and it
 * decides nothing else: no rule, no legality, no icon, no ordering.
 *
 * The day `SpellOptions` carries names, this loses its last caller.
 */

/** The `<id>` of `dnd5e:spells:<id>`, or the whole string when it has none. */
export function spellRefId(ref: string): string {
  const separator = ref.lastIndexOf(':');
  if (separator < 0 || separator === ref.length - 1) return ref;
  return ref.slice(separator + 1);
}

/**
 * A display label for a spell ref with no server-authored name beside it.
 *
 * Hyphens become spaces and each word is capitalised, so `true-strike` reads
 * "True Strike". A ref that carries no id segment is shown whole, which is
 * ugly on purpose: an unresolvable ref should look unresolved rather than
 * quietly become a plausible spell name.
 */
export function spellRefLabel(ref: string): string {
  const id = spellRefId(ref);
  // NO ID MEANS NO LABEL. When the ref carried no `<id>` segment, `spellRefId`
  // hands the whole string back; titleizing that would turn a malformed ref
  // into something that reads like a name.
  if (!id || id === ref) return ref;
  const words = id
    .split(/[-_]/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : ref;
}
