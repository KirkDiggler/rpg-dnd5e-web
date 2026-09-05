/**
 * refs — the one parser for a ref string.
 *
 * A ref is `module:type:id` (rpg-dnd5e-web#947, rpg-toolkit#1536). Module
 * and type are single parts. **The id is everything after the second
 * colon**: one or more parts joined by `:`, so
 * `dnd5e:props:plushie:skeleton-dog` is a ref whose id is
 * `plushie:skeleton-dog`. Content owns the id's inner structure — this
 * file splits it and never assigns meaning to a part.
 *
 * Why one parser: web had 25 hand-rolled `.split(':')` sites, most taking
 * `.pop()` for a label and some indexing `parts[2]` as "the id". Both are
 * wrong once ids have parts — `chest:small` and `crate:small` collapse
 * onto "small", and `parts[2]` drops the rest of the id on the floor.
 *
 * Every part is one or more of `A-Z a-z 0-9 _ -`. A string that breaks
 * that grammar is not a ref, and `parseRef` says so with `null` rather
 * than handing back a half-parsed shape; the display helpers fall back to
 * reading the string itself, which is what the sites that take arbitrary
 * strings (a legacy damage source, a half-typed ref in an author panel)
 * did before.
 *
 * This is the ONLY place in `src/` allowed to split a ref on `:`.
 * `refs.guard.test.ts` fails if a new hand-split appears elsewhere.
 */

/** A ref split into its three fields. `id` is everything after the second
 * colon and may itself contain `:`; `idParts` is that id already split,
 * for the few callers whose own content rules give the parts meaning
 * (the prop calibration model's family/variant pair, the exact-ref test
 * below). */
export interface ParsedRef {
  readonly module: string;
  readonly type: string;
  readonly id: string;
  readonly idParts: readonly string[];
}

const PART = /^[A-Za-z0-9_-]+$/;

/**
 * Parse `module:type:id`, or `null` if the string is not a ref: fewer
 * than three parts, or any part empty or carrying a character outside
 * `A-Z a-z 0-9 _ -`.
 */
export function parseRef(ref: string): ParsedRef | null {
  const parts = ref.split(':');
  if (parts.length < 3) return null;
  if (!parts.every((part) => PART.test(part))) return null;
  const idParts = parts.slice(2);
  return {
    module: parts[0],
    type: parts[1],
    id: idParts.join(':'),
    idParts,
  };
}

/** A ref's id — everything after the second colon — or `null` if the
 * string is not a ref. For the three-part refs that were all web had
 * until now this is exactly the old `.split(':').pop()`. */
export function refId(ref: string): string | null {
  return parseRef(ref)?.id ?? null;
}

/**
 * The one rule for how a ref reads: **its id, with every separator turned
 * into a single space and nothing re-cased**. The `:` between id parts
 * counts as a separator, and so do `-` and `_` inside a part.
 *
 * - `dnd5e:props:reliquary` reads `reliquary`
 * - `dnd5e:props:tomb-open` reads `tomb open`
 * - `dnd5e:props:plushie:skeleton-dog` reads `plushie skeleton dog`
 *
 * `chest:small` and `crate:small` therefore read `chest small` and
 * `crate small` — the collision `.pop()` used to create. A string that is
 * not a ref reads as itself under the same rule, so a bare
 * `fighting_style_dueling` still reads `fighting style dueling`. Sites
 * that want Title Case apply it to these words; this helper never does,
 * because half the call sites want the author's own lowercase vocabulary.
 */
export function refLabel(ref: string): string {
  return (refId(ref) ?? ref).replace(/[:\-_]+/g, ' ').trim();
}

/**
 * A ref's id as one lowercase slug — id parts joined with `-`, the parts'
 * own `-`/`_` left alone. `dnd5e:props:plushie:skeleton-dog` slugs to
 * `plushie-skeleton-dog`; a one-part id is just that id lowercased, which
 * is what `.split(':').pop()?.toLowerCase()` gave before. For the two
 * places an id has to survive as a single token: the palette's baked
 * thumbnail filenames and the placement id the author is offered.
 * `null` when the string is not a ref.
 */
export function refSlug(ref: string): string | null {
  const parsed = parseRef(ref);
  return parsed ? parsed.idParts.join('-').toLowerCase() : null;
}

/**
 * An exact prop ref: a prop ref whose id names a specific model rather
 * than a family — `dnd5e:props:plushie:skeleton-dog` (exact) against
 * `dnd5e:props:plushie` (the family). The test is structural, "the id has
 * two or more parts", not a list of known families.
 *
 * Scoped by `type` alone rather than the `dnd5e:props:` prefix the
 * session renderer used to check: a homebrew module's multi-part prop ref
 * is exact for the same reason, and the caller's question — "is a missing
 * model here a hole in the content or just a family placeholder?" — has
 * the same answer either way. No such ref exists today, so nothing web
 * renders changes.
 */
export function isExactPropRef(ref: string): boolean {
  const parsed = parseRef(ref);
  return (
    parsed !== null && parsed.type === 'props' && parsed.idParts.length >= 2
  );
}
