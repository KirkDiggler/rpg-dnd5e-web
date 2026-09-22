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
 * THE CLOSED SETS ARE READ, NOT RESTATED. Stance words and predicate forms come
 * from `factionVocabulary.ts` and the temper words from `answerVocabulary.ts`,
 * so a word the engine seals is a word this decoder already knows. Semantic
 * questions — does the faction exist, is the pair reachable, does the mind name
 * a member — are the ENGINE's (`validate.go`, `factionRules.ts`); this refuses
 * only the shapes it cannot represent, exactly as `dungeonYaml.ts` does.
 */

import {
  ANSWER_TEMPER,
  EMPTY_TEMPER_MIX_REFUSAL,
  temperShareRefusal,
  unknownTemperRefusal,
} from '@/author/answerVocabulary';
import {
  PARTY,
  PREDICATE_FORMS,
  PREDICATE_SHAPE,
  STANCES,
  type PredicateDoc,
  type Stance,
} from '@/author/factionVocabulary';
import { validateAnswerTable, type AnswerTableShape } from './answerTableShape';
import { objectShape, rejectUnknownKeys } from './strictShape';

/** A faction id has the same grammar as the room key: lower-case, digits,
 * dashes. `party` is never declared — it is the players' side — and the
 * engine refuses it by name. */
const FACTION_ID_RE = /^[-a-z0-9]+$/;

/** A `temper:` as written: one sealed word, or a word->share mix on a faction.
 * A placement names one creature, so it takes a word; a faction is several and
 * deals one per member. */
export type SiteTemper = string | Record<string, number>;

/** One declared faction. `on` is the shared answer table its members inherit,
 * validated by the ONE answer grammar; `temper` is the mix dealt per member. */
export interface SiteFaction {
  id: string;
  mind?: string;
  on?: AnswerTableShape;
  temper?: SiteTemper;
}

/** How two factions stand to each other, and the predicate that ends the
 * hostility. `until` is legal only with `stance: hostile`. */
export interface SiteDisposition {
  between: [string, string];
  stance: Stance;
  until?: PredicateDoc;
}

/** The authored site scope. Each key is absent when nothing was authored, so a
 * document with none of it writes v3 exactly as it always did. */
export interface SiteScope {
  factions?: SiteFaction[];
  dispositions?: SiteDisposition[];
  intel?: SiteIntelRecord[];
}

/** One intel record's `reveals` — the shape `{ door: <id> }` or
 * `{ fact: <id> }` the engine's `RevealsSpec` carries.
 *
 * `fact` IS THE ONLY TARGET THIS DIALECT ACCEPTS (rpg-project#488 R3, corrected
 * by rpg-toolkit#1855). `door` is REFUSED BY NAME at `intel[<i>].reveals.door`:
 * revealing the way to a door needs a CONCEALED door on a crossing, and a
 * single room has no crossing to hide one on. The design first said a door
 * reveal was "accepted and inert"; the engine made it a sentence instead, so
 * the builder fails closed with it rather than writing bytes nothing can read.
 * `door` stays on the type so the refusal can be a sentence at the author's own
 * path rather than "not a key this build reads". */
export type SiteIntelReveals = { door: string } | { fact: string };

/** One intel record at the site root — the authored knowledge an author places
 * in a creature or prop (`holds`), beside `factions`/`dispositions`. Declared
 * HERE and held BY creatures; the record itself never lives where it is held. */
export interface SiteIntelRecord {
  id: string;
  reveals: SiteIntelReveals;
}

const FACTION_KEYS = ['id', 'mind', 'on', 'temper'] as const;
const DISPOSITION_KEYS = ['between', 'stance', 'until'] as const;
const INTEL_KEYS = ['id', 'reveals'] as const;
const REVEALS_KEYS = ['door', 'fact'] as const;

/** The engine's own sentence for `reveals: { door }` in this dialect
 * (`dungeonspec.single_room_gameplay.go`), transcribed so the builder shows the
 * words the author would read from the server. The word means something — it
 * simply needs a crossing to mean it. */
export const INTEL_REVEALS_DOOR_REFUSAL =
  'a door is not something a single room can reveal yet: revealing the way to ' +
  'one needs a concealed door on a crossing, and this dialect’s doors are ' +
  'footprints standing in the open; write `fact: <id>`, or wait for the sites ' +
  'layer';

const isMapping = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

/** Why an id cannot be a faction id, or undefined when it can. ONE HOME for
 * the grammar and the sentence, so the field refusal and the duplicate-list
 * refusal can never drift apart (rpg-dnd5e-web#1160). */
function factionIdRefusal(
  id: string,
  otherIds: readonly string[] = []
): string | undefined {
  if (!FACTION_ID_RE.test(id)) return 'needs an id such as goblins';
  if (id === PARTY)
    return `\`${PARTY}\` is the players' side and is never declared`;
  if (otherIds.includes(id)) return `duplicate faction id: ${id}`;
  return undefined;
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
    rejectUnknownKeys(raw, FACTION_KEYS, path);
    if (typeof raw.id !== 'string') fail(path, 'needs an id such as goblins');
    const idRefusal = factionIdRefusal(raw.id, [...ids]);
    if (idRefusal) fail(path, idRefusal);
    ids.add(raw.id);
    const faction: SiteFaction = { id: raw.id };
    // ABSENT WHEN UNAUTHORED: each key is added only when the file wrote one.
    if (raw.mind !== undefined && raw.mind !== null) {
      if (typeof raw.mind !== 'string' || !raw.mind)
        fail(`${path} mind`, 'must name a placement id');
      faction.mind = raw.mind;
    }
    if (Object.hasOwn(raw, 'on'))
      faction.on = validateAnswerTable(raw.on, `${path} on`);
    if (Object.hasOwn(raw, 'temper'))
      faction.temper = validateFactionTemper(raw.temper, `${path} temper`);
    factions.push(faction);
  }
  return factions;
}

/** A faction's `temper:` — one sealed word, or a mix to deal one from. Shares
 * are counted from 1 (`TemperSpec.UnmarshalYAML`): a share of 0 can never be
 * dealt. */
function validateFactionTemper(value: unknown, path: string): SiteTemper {
  if (typeof value === 'string') {
    if (!ANSWER_TEMPER.words.includes(value))
      fail(path, unknownTemperRefusal(value));
    return value;
  }
  if (isMapping(value)) {
    const mix: Record<string, number> = {};
    for (const [word, share] of Object.entries(value)) {
      if (!ANSWER_TEMPER.words.includes(word))
        fail(path, unknownTemperRefusal(word));
      if (typeof share !== 'number' || !Number.isInteger(share))
        fail(`${path}.${word}`, `"${word}" takes a whole-number share`);
      if (share < ANSWER_TEMPER.minimumShare)
        fail(`${path}.${word}`, temperShareRefusal(share, word));
      mix[word] = share;
    }
    if (Object.keys(mix).length === 0) fail(path, EMPTY_TEMPER_MIX_REFUSAL);
    return mix;
  }
  fail(
    path,
    `a temper is a word (${ANSWER_TEMPER.words.join(' | ')}) or a mix of them with shares`
  );
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
    rejectUnknownKeys(raw, DISPOSITION_KEYS, path);
    const between = validateFactionPair(raw.between, `${path} between`);
    const pairKey = [...between].sort().join('\u0000');
    if (pairs.has(pairKey))
      fail(path, `the pair ${between[0]} and ${between[1]} is declared twice`);
    pairs.add(pairKey);
    if (typeof raw.stance !== 'string' || !isStance(raw.stance))
      fail(
        `${path} stance`,
        `must be one of ${STANCES.join(', ')}, and this is ${String(raw.stance)}`
      );
    const disposition: SiteDisposition = { between, stance: raw.stance };
    if (Object.hasOwn(raw, 'until')) {
      // `until` says when the hostility ENDS, so a pair that is not hostile
      // has nothing for it to stop (`validate.go`).
      if (raw.stance !== 'hostile')
        fail(
          `${path} until`,
          `is legal only with stance hostile, and this one is ${raw.stance}`
        );
      disposition.until = validatePredicate(raw.until, `${path} until`);
    }
    dispositions.push(disposition);
  }
  return dispositions;
}

function isStance(word: string): word is Stance {
  return (STANCES as readonly string[]).includes(word);
}

const SCOPE_KEYS = ['factions', 'dispositions', 'intel'] as const;

/** The site's `intel:` records, in authored order. An id is unique and follows
 * the same lower-case-dash grammar as a faction id; `reveals` is REQUIRED and
 * EXACTLY ONE target, and in this dialect that target is `fact`: `door` is
 * REFUSED BY NAME (rpg-project#488 R3, rpg-toolkit#1855). The refusal comes
 * FIRST and is the whole answer for a record naming a door — a record with both
 * keys is an author who wrote a forbidden word beside a legal one, and telling
 * them the word is not built is the sentence that helps. What a fact id
 * resolves to is the engine's judgement; the web keeps the shape and never
 * resolves it. */
export function validateIntel(value: unknown): SiteIntelRecord[] {
  if (!Array.isArray(value)) fail('Site intel', 'must be a list');
  const records: SiteIntelRecord[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `Site intel at index ${index}`;
    const raw = objectShape(entry, path);
    rejectUnknownKeys(raw, INTEL_KEYS, path);
    if (typeof raw.id !== 'string' || !FACTION_ID_RE.test(raw.id))
      fail(path, 'needs an id such as vault-map');
    if (ids.has(raw.id)) fail(path, `duplicate intel id: ${raw.id}`);
    ids.add(raw.id);
    const reveals = objectShape(raw.reveals, `${path} reveals`);
    rejectUnknownKeys(reveals, REVEALS_KEYS, `${path} reveals`);
    if (typeof reveals.door === 'string' && reveals.door !== '')
      fail(`${path} reveals.door`, INTEL_REVEALS_DOOR_REFUSAL);
    const revealKeys = Object.keys(reveals);
    if (revealKeys.length !== 1)
      fail(
        `${path} reveals`,
        `intel "${raw.id}" reveals nothing — a record says exactly one thing it reveals`
      );
    const id = reveals.fact;
    if (typeof id !== 'string' || !id)
      fail(`${path} reveals.fact`, 'must name a fact');
    records.push({ id: raw.id, reveals: { fact: id } });
  }
  return records;
}

/** The whole site scope, validated and NORMALIZED: each key is kept only when
 * it carries at least one entry, because absence is the authored state "none"
 * and an empty list must never become bytes the engine reads as a declaration.
 *
 * ONE HOME for the scope's shape, read ON THE WAY OUT of every encoder
 * (`roomDraft.ts`'s storage envelope, `singleRoomDungeon.ts`'s canonical YAML),
 * so a scope that cannot be represented is refused before it is written rather
 * than corrupting state (rpg-dnd5e-web#1160). */
export function validateSiteScope(value: unknown): SiteScope {
  const raw = objectShape(value, 'Site scope');
  rejectUnknownKeys(raw, SCOPE_KEYS, 'Site scope');
  const scope: SiteScope = {};
  if (Object.hasOwn(raw, 'factions')) {
    const factions = validateSiteFactions(raw.factions);
    if (factions.length > 0) scope.factions = factions;
  }
  if (Object.hasOwn(raw, 'dispositions')) {
    const dispositions = validateSiteDispositions(raw.dispositions);
    if (dispositions.length > 0) scope.dispositions = dispositions;
  }
  if (Object.hasOwn(raw, 'intel')) {
    const intel = validateIntel(raw.intel);
    if (intel.length > 0) scope.intel = intel;
  }
  return scope;
}

/** `[faction, faction]` — two ids, carried in the author's order. */
function validateFactionPair(value: unknown, path: string): [string, string] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((id) => typeof id === 'string' && FACTION_ID_RE.test(id))
  )
    fail(path, 'expected [faction, faction]');
  return [value[0] as string, value[1] as string];
}

/** One predicate — EXACTLY ONE of the four forms, in the form names the
 * vocabulary seals. Whether the thing a form names exists is `factionRules`'
 * question, not this decoder's.
 *
 * EXPORTED since rpg-dnd5e-web#1176: a creature's `arrives` carries the SAME
 * `PredicateSpec` a disposition's `until` does, so it is validated by this one
 * function rather than by a second transcription of the grammar. */
export function validatePredicate(value: unknown, path: string): PredicateDoc {
  if (!isMapping(value) || Object.keys(value).length !== 1)
    fail(path, PREDICATE_SHAPE);
  const form = Object.keys(value)[0];
  if (!(PREDICATE_FORMS as readonly string[]).includes(form))
    fail(path, PREDICATE_SHAPE);

  if (form === 'round') {
    const round = value.round;
    if (typeof round !== 'number' || !Number.isInteger(round) || round < 1)
      fail(`${path}.round`, 'must be a whole number of at least 1');
    return { round };
  }
  if (form === 'down' || form === 'fact') {
    const id = value[form];
    if (typeof id !== 'string' || !id)
      fail(`${path}.${form}`, 'must name an id');
    return { [form]: id } as PredicateDoc;
  }
  const body = value.stance;
  if (!isMapping(body)) fail(`${path}.stance`, PREDICATE_SHAPE);
  const between = validateFactionPair(body.between, `${path}.stance.between`);
  if (typeof body.is !== 'string' || !isStance(body.is))
    fail(`${path}.stance.is`, `must be one of ${STANCES.join(', ')}`);
  return { stance: { between, is: body.is } };
}
