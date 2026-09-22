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
  /** The way out(s) of this room — `{ id, cell }`, carried verbatim
   * (rpg-project#488 R2). No form yet; the carry is so a hand-written v4
   * document round-trips and the engine grades it. */
  exits?: SiteExit[];
  /** The ways this room's run can end — `{ id, when }`, carried verbatim. */
  endings?: SiteEnding[];
  /** The scenario bindings — `{ scenarioId: { field: id } }`, carried
   * verbatim (the engine validates the references only). */
  scenarios?: SiteScenarios;
  /** The secrets this room hides — `{ id: { cells, props, checks, ... } }`,
   * carried verbatim (rpg-project#490). */
  concealments?: SiteConcealments;
}

/** One intel record's `reveals` — the shape `{ door: <id> }`, `{ fact: <id> }`
 * or `{ concealment: <id> }` the engine's `RevealsSpec` carries.
 *
 * `fact` was the ONLY target this dialect accepted at first (rpg-project#488
 * R3, corrected by rpg-toolkit#1855). rpg-project#490 R7 retargeted the record:
 * a record reveals the VAULT, `reveals.concealment`, named directly under the
 * root's `concealments:` — and `door` is REFUSED BY NAME at
 * `intel[<i>].reveals.door`: revealing the way to a door needs a CONCEALED
 * door, and a door is now hidden by being listed in a concealment's `props`
 * rather than by any `doorBindings.<id>.concealed`. `door` stays on the type
 * so the refusal can be a sentence at the author's own path rather than "not
 * a key this build reads". */
export type SiteIntelReveals =
  | { door: string }
  | { fact: string }
  | { concealment: string };

/** One intel record at the site root — the authored knowledge an author places
 * in a creature or prop (`holds`), beside `factions`/`dispositions`. Declared
 * HERE and held BY creatures; the record itself never lives where it is held. */
export interface SiteIntelRecord {
  id: string;
  reveals: SiteIntelReveals;
}

/** One axial cell in this dialect's frame — the same `{ q, r }` shape
 * `partyStart`, a monster's `cell`, and a concealment's `cells` use. */
export interface SiteRoomCell {
  q: number;
  r: number;
}

/** One authored way out — `{ id, cell }` (rpg-project#488 R2). `id` is what a
 * scenario binding names; `cell` is where somebody stands to leave. Carried,
 * never interpreted: whether the id is unique or the cell standable is the
 * engine's judgement at `PutDungeon`. */
export interface SiteExit {
  id: string;
  cell: SiteRoomCell;
}

/** One authored ending — `{ id, when }`. `when` is the SAME `PredicateSpec` a
 * disposition's `until` and a binding's `arrives` carry, judged by the one
 * grammar. Carried, not interpreted. */
export interface SiteEnding {
  id: string;
  when: PredicateDoc;
}

/** The scenario bindings — a map from scenario id to `{ fieldKey: id }`
 * ([Spec.Scenarios] verbatim). The engine validates ONLY the references (that
 * each value names a monster / declared prop / exit / faction); what the keys
 * mean is the scenarios package's own refusal. Carried whole. */
export type SiteScenarios = Record<string, Record<string, string>>;

/** The check forms a concealment prices (Search checks, and the passive
 * `notice` tell). `CheckSpec`'s shape, declared here (not imported from
 * `roomDraft`'s `RoomCheckApproach`) so `siteScope` — which `roomDraft`
 * imports — does not create an import cycle. */
export interface SiteConcealmentCheck {
  ability: string;
  dc: number;
  tool?: string;
}

/** One secret this room hides (rpg-project#490). Everything hidden belongs to
 * it: the cells it hides, the placed things it hides (doors are just placed
 * ids here), and the checks that find it. `notice` is the passive tell,
 * CARRIED AND UNREAD in this engine slice. Carried here, never graded. */
export interface SiteConcealmentSpec {
  notice?: SiteConcealmentCheck[];
  checks: SiteConcealmentCheck[];
  cells?: SiteRoomCell[];
  props?: string[];
}

/** The root `concealments:` map, keyed by id — the secret-vault shape. */
export type SiteConcealments = Record<string, SiteConcealmentSpec>;

const FACTION_KEYS = ['id', 'mind', 'on', 'temper'] as const;
const DISPOSITION_KEYS = ['between', 'stance', 'until'] as const;
const INTEL_KEYS = ['id', 'reveals'] as const;
const REVEALS_KEYS = ['door', 'fact', 'concealment'] as const;
const EXIT_KEYS = ['id', 'cell'] as const;
const ENDING_KEYS = ['id', 'when'] as const;
const CELL_KEYS = ['q', 'r'] as const;
const CONCEALMENT_KEYS = ['notice', 'checks', 'cells', 'props'] as const;
const CHECK_KEYS = ['ability', 'dc', 'tool'] as const;

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

const SCOPE_KEYS = [
  'factions',
  'dispositions',
  'intel',
  'exits',
  'endings',
  'scenarios',
  'concealments',
] as const;

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
    // TWO TARGETS IN THIS DIALECT: `fact` (the thing a failed persuasion
    // teaches and an `arrives` reads) and `concealment` (the secret a record
    // gives away, named directly under the root `concealments:`). `door` was
    // refused above. The id's length is checked only — whether the named fact
    // or concealment resolves is the engine's judgement at `PutDungeon`.
    if (typeof reveals.fact === 'string') {
      if (!reveals.fact) fail(`${path} reveals.fact`, 'must name a fact');
      records.push({ id: raw.id, reveals: { fact: reveals.fact } });
    } else {
      const concealment = reveals.concealment;
      if (typeof concealment !== 'string' || !concealment)
        fail(`${path} reveals.concealment`, 'must name a concealment');
      records.push({
        id: raw.id,
        reveals: { concealment },
      });
    }
  }
  return records;
}

/** The site's `exits:`, in authored order. An id is required and unique; a cell
 * is required and every field matters. Whether the cell is standable is the
 * engine's question at `PutDungeon` — this refuses only shapes it cannot
 * represent. */
export function validateSiteExits(value: unknown): SiteExit[] {
  if (!Array.isArray(value)) fail('Site exits', 'must be a list');
  const exits: SiteExit[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `Site exit at index ${index}`;
    const raw = objectShape(entry, path);
    rejectUnknownKeys(raw, EXIT_KEYS, path);
    if (typeof raw.id !== 'string' || !FACTION_ID_RE.test(raw.id))
      fail(path, 'needs an id such as entrance');
    if (ids.has(raw.id)) fail(path, `duplicate exit id: ${raw.id}`);
    ids.add(raw.id);
    if (!isMapping(raw.cell))
      fail(`${path} cell`, 'must name an axial cell { q, r }');
    const cell = validateSiteCell(raw.cell, `${path} cell`);
    exits.push({ id: raw.id, cell });
  }
  return exits;
}

/** The site's `endings:`, in authored order. An id is required and unique; a
 * `when` is REQUIRED and is the SAME `PredicateSpec` a disposition's `until`
 * and a binding's `arrives` carry — validated by the one shared
 * `validatePredicate` rather than by a second transcription of the grammar. */
export function validateSiteEndings(value: unknown): SiteEnding[] {
  if (!Array.isArray(value)) fail('Site endings', 'must be a list');
  const endings: SiteEnding[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `Site ending at index ${index}`;
    const raw = objectShape(entry, path);
    rejectUnknownKeys(raw, ENDING_KEYS, path);
    if (typeof raw.id !== 'string' || !FACTION_ID_RE.test(raw.id))
      fail(path, 'needs an id such as held-out');
    if (ids.has(raw.id)) fail(path, `duplicate ending id: ${raw.id}`);
    ids.add(raw.id);
    if (raw.when === undefined)
      fail(`${path} when`, 'an ending needs a predicate that fires it');
    const when = validatePredicate(raw.when, `${path} when`);
    endings.push({ id: raw.id, when });
  }
  return endings;
}

/** The site's `scenarios:` — a map of scenario id to its `{ field: id }`
 * bindings, carried whole. The engine validates ONLY the references (that each
 * value names a monster / declared prop / exit / faction); what the keys mean
 * is the scenarios package's own refusal. This refuses only a shape it cannot
 * represent: a non-mapping scenarios, or a binding value that is not an id. */
export function validateSiteScenarios(value: unknown): SiteScenarios {
  if (!isMapping(value)) fail('Site scenarios', 'must be a map');
  const scenarios: SiteScenarios = {};
  for (const [scenarioId, body] of Object.entries(value)) {
    const path = `Site scenario ${scenarioId}`;
    if (!FACTION_ID_RE.test(scenarioId))
      fail(path, 'scenario id needs an id such as hold-out');
    if (!isMapping(body)) fail(path, 'must be a map of field to id');
    const fields: Record<string, string> = {};
    for (const [field, referred] of Object.entries(body)) {
      if (typeof referred !== 'string' || !referred)
        fail(`${path}.${field}`, 'must name an id in this document');
      fields[field] = referred;
    }
    scenarios[scenarioId] = fields;
  }
  return scenarios;
}

/** The site's `concealments:` — a map of secret id to what it hides.
 * `checks` is REQUIRED non-empty (a secret nobody can find is one the author
 * started and did not finish), `notice`/`cells`/`props` are optional. Every id
 * everywhere follows the lower-case-dash grammar. Carried, never graded: what
 * resolves — cells that are standable, props that are declared — is the
 * engine's question at `PutDungeon`. */
export function validateSiteConcealments(value: unknown): SiteConcealments {
  if (!isMapping(value)) fail('Site concealments', 'must be a map');
  const concealments: SiteConcealments = {};
  for (const [id, body] of Object.entries(value)) {
    const path = `Site concealment ${id}`;
    if (!FACTION_ID_RE.test(id)) fail(path, 'needs an id such as vault');
    const raw = objectShape(body, path);
    rejectUnknownKeys(raw, CONCEALMENT_KEYS, path);
    const spec: SiteConcealmentSpec = {
      checks: validateConcealmentChecks(raw.checks, `${path} checks`),
    };
    if (Object.hasOwn(raw, 'notice'))
      spec.notice = validateConcealmentChecks(raw.notice, `${path} notice`);
    if (Object.hasOwn(raw, 'cells')) {
      const cellsVal = raw.cells;
      if (!Array.isArray(cellsVal)) fail(`${path} cells`, 'must be a list');
      spec.cells = cellsVal.map((cell, i) =>
        validateSiteCell(cell, `${path} cells[${i}]`)
      );
    }
    if (Object.hasOwn(raw, 'props')) {
      const propsVal = raw.props;
      if (!Array.isArray(propsVal)) fail(`${path} props`, 'must be a list');
      spec.props = propsVal.map((prop, i) => {
        if (typeof prop !== 'string' || !prop)
          fail(`${path} props[${i}]`, 'must name a placed prop id');
        return prop;
      });
    }
    concealments[id] = spec;
  }
  return concealments;
}

/** A `CheckSpec` — a LIST of approach routes, beaten by any listed one
 * (`type CheckSpec []ApproachSpec`): the search price of a secret. Non-empty:
 * a secret nobody can find is one the author started and did not finish. */
function validateConcealmentChecks(
  value: unknown,
  path: string
): SiteConcealmentCheck[] {
  if (!Array.isArray(value)) fail(path, 'must be a list of checks');
  const checks = value.map((check, i) =>
    validateConcealmentCheck(check, `${path}[${i}]`)
  );
  if (checks.length === 0)
    fail(path, 'a secret nobody can find is an author who started and stopped');
  return checks;
}

/** One approach route — `{ ability, dc, tool? }`, `ApproachSpec`'s shape. `dc`
 * is a whole number and `tool` is optional. Whether `ability`/`tool` resolve is
 * the engine's judgement. */
function validateConcealmentCheck(
  value: unknown,
  path: string
): SiteConcealmentCheck {
  const raw = objectShape(value, path);
  rejectUnknownKeys(raw, CHECK_KEYS, path);
  if (typeof raw.ability !== 'string' || !raw.ability)
    fail(`${path} ability`, 'must name an ability');
  if (typeof raw.dc !== 'number' || !Number.isInteger(raw.dc) || raw.dc < 1)
    fail(`${path} dc`, 'must be a whole number of at least 1');
  const check: SiteConcealmentCheck = { ability: raw.ability, dc: raw.dc };
  if (typeof raw.tool === 'string' && raw.tool !== '') check.tool = raw.tool;
  return check;
}

/** One axial cell — `{ q, r }`. Both are required integers. */
function validateSiteCell(value: unknown, path: string): SiteRoomCell {
  const raw = objectShape(value, path);
  rejectUnknownKeys(raw, CELL_KEYS, path);
  if (typeof raw.q !== 'number' || !Number.isInteger(raw.q))
    fail(`${path} q`, 'must be a whole number');
  if (typeof raw.r !== 'number' || !Number.isInteger(raw.r))
    fail(`${path} r`, 'must be a whole number');
  return { q: raw.q, r: raw.r };
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
  if (Object.hasOwn(raw, 'exits')) {
    const exits = validateSiteExits(raw.exits);
    if (exits.length > 0) scope.exits = exits;
  }
  if (Object.hasOwn(raw, 'endings')) {
    const endings = validateSiteEndings(raw.endings);
    if (endings.length > 0) scope.endings = endings;
  }
  if (Object.hasOwn(raw, 'scenarios')) {
    const scenarios = validateSiteScenarios(raw.scenarios);
    if (Object.keys(scenarios).length > 0) scope.scenarios = scenarios;
  }
  if (Object.hasOwn(raw, 'concealments')) {
    const concealments = validateSiteConcealments(raw.concealments);
    if (Object.keys(concealments).length > 0) scope.concealments = concealments;
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
