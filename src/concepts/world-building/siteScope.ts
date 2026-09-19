/**
 * The site scope — `factions` and `dispositions` at the ROOT of a single-room
 * document (rpg-project#477, rpg-dnd5e-web#1136 slice 1).
 *
 * THE NAME IS `site`, THE DOCUMENT IS THE ROOM'S ROOT. The design's hierarchy
 * is `campaign -> adventure -> site -> room`; the single-room document IS the
 * site document for one room, so its root is where identity and policy live
 * and `rooms[]` stays flat. There is deliberately NO `sites` layer and NO
 * `kind` here.
 *
 * SHAPE ONLY, CARRYING THE ENGINE'S OWN KEYS. These mirror `FactionSpec` and
 * `DispositionSpec` (`dungeonspec/spec.go`): `id`/`mind`/`on`/`temper` and
 * `between`/`stance`/`until`. Nothing reads them yet — no panel, no editor, no
 * read-only view. The whole job of this module is that an author can hand-write
 * the block, save, reload and get exactly the bytes they wrote back, with the
 * typos the strict decode is for still refused.
 *
 * THE CLOSED SETS ARE NOT READ HERE AT ALL (rpg-project#481 R3). A stance word,
 * a temperament, a predicate form and a faction id are the ENGINE's vocabulary,
 * and `PutDungeon{validate_only}` is where a file is graded against it. This
 * decoder used to refuse each of them in the engine's own sentences — a mirror
 * of a closed set, and a mirror drifts (rpg-dnd5e-web#1119, #1145). It now
 * carries what the author wrote and refuses only the shapes it cannot hold:
 * a faction that is not a mapping, a `between` that is not two names.
 *
 * `factionVocabulary.ts` and `answerVocabulary.ts` still declare the words the
 * panels OFFER as completions. An offer is not a rule.
 */

import { validateAnswerTable, type AnswerTableShape } from './answerTableShape';
import { objectShape } from './strictShape';

/** A `temper:` as written — a word, or a word->share mix. WHICH WORDS THIS
 * BUILD SHIPS, and whether a mix is legal where it was written, are the
 * engine's answers (`TemperSpec`); this carries what the file says. */
export type SiteTemper = unknown;

/** One declared faction. `on` is the shared answer table its members inherit,
 * carried by the ONE answer codec; `temper` is the mix dealt per member.
 * `id`, `mind` and every value below are carried as written — the engine
 * grades them. */
export interface SiteFaction {
  id: string;
  mind?: string;
  on?: AnswerTableShape;
  temper?: SiteTemper;
  /** EVERY OTHER KEY THE FILE WROTE, CARRIED IN PLACE. This document IS the
   * emitted shape, so a key held here reaches the compiler at its own path —
   * `factions[0].tempre` comes back named instead of stopping the file. */
  [key: string]: unknown;
}

/** How two factions stand to each other, and the predicate that ends the
 * hostility. `stance` and `until` are carried as written: "`until` is legal
 * only with `stance: hostile`" is `validate.go`'s rule and `validate.go`
 * makes it. */
export interface SiteDisposition {
  between: [string, string];
  stance: string;
  until?: unknown;
  /** Every other key the file wrote, carried in place. */
  [key: string]: unknown;
}

/** The authored site scope. Each key is absent when nothing was authored, so a
 * document with none of it writes v3 exactly as it always did. */
export interface SiteScope {
  factions?: SiteFaction[];
  dispositions?: SiteDisposition[];
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

/** The site's `factions:`, or an empty list when the key carried none. An
 * empty list is the authored state "no factions", not an error. */
export function validateSiteFactions(value: unknown): SiteFaction[] {
  if (!Array.isArray(value)) fail('Site factions', 'must be a list');
  const factions: SiteFaction[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `Site faction at index ${index}`;
    const raw = objectShape(entry, path);
    // A FACTION IS KEYED BY ITS ID, so an id this decoder cannot use as a key
    // is the one thing it still refuses: a string. Its GRAMMAR — lower-case,
    // digits, dashes, and `party` reserved — is the engine's, and the engine
    // names a bad one at `factions[i].id`.
    if (typeof raw.id !== 'string' || raw.id === '')
      fail(path, 'needs an id such as goblins');
    if (ids.has(raw.id)) fail(path, `duplicate faction id: ${raw.id}`);
    ids.add(raw.id);
    // The block AS WRITTEN, with the keys this decoder models checked in
    // place. Everything else rides along untouched.
    const faction: SiteFaction = { ...raw, id: raw.id };
    // ABSENT WHEN UNAUTHORED: each key is added only when the file wrote one.
    if (raw.mind !== undefined && raw.mind !== null) {
      if (typeof raw.mind !== 'string' || !raw.mind)
        fail(`${path} mind`, 'must name a placement id');
      faction.mind = raw.mind;
    }
    if (Object.hasOwn(raw, 'on'))
      faction.on = validateAnswerTable(raw.on, `${path} on`);
    // CARRIED, NOT GRADED: a word this build does not ship, a share of zero,
    // a mix where the engine wants a word — each is `TemperSpec`'s to refuse.
    factions.push(faction);
  }
  return factions;
}

/** The site's `dispositions:`. `between` is UNORDERED in meaning and kept in
 * the author's order in the bytes, so a pair can only be declared once. */
export function validateSiteDispositions(value: unknown): SiteDisposition[] {
  if (!Array.isArray(value)) fail('Site dispositions', 'must be a list');
  const dispositions: SiteDisposition[] = [];
  const pairs = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `Site disposition at index ${index}`;
    const raw = objectShape(entry, path);
    const between = validateFactionPair(raw.between, `${path} between`);
    const pairKey = [...between].sort().join('\u0000');
    if (pairs.has(pairKey))
      fail(path, `the pair ${between[0]} and ${between[1]} is declared twice`);
    pairs.add(pairKey);
    // THE WORD AS WRITTEN. Which three stances this build folds is
    // `DispositionSpec`'s sealed set, named by the engine at
    // `dispositions[i].stance`.
    if (typeof raw.stance !== 'string')
      fail(
        `${path} stance`,
        `must be a word, and this is ${String(raw.stance)}`
      );
    // CARRIED, NOT GRADED: "`until` is legal only with stance hostile" and
    // the predicate's own grammar are both `validate.go`'s. The block rides
    // along as written, with the two keys this decoder models checked.
    const disposition: SiteDisposition = {
      ...raw,
      between,
      stance: raw.stance,
    };
    dispositions.push(disposition);
  }
  return dispositions;
}

/** `[faction, faction]` — two names, carried in the author's order. Their
 * GRAMMAR is the engine's; the pair being two of them is what this decoder
 * has to be able to key and de-duplicate. */
function validateFactionPair(value: unknown, path: string): [string, string] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((id) => typeof id === 'string')
  )
    fail(path, 'expected [faction, faction]');
  return [value[0] as string, value[1] as string];
}
