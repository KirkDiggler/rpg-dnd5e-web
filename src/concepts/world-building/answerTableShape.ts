/**
 * The answer table's FILE SHAPE, validated against `answerVocabulary.ts`.
 *
 * WHY THIS EXISTS. Two documents now carry an `on:` block: a creature's orders
 * (`room.monsterBindings[id].on`) and a faction's shared table
 * (`factions[].on`). Both are the engine's `map[string][]AnswerSpec`, both are
 * stored as the FILE's own shape (a trigger key to a list of entries) so the
 * bytes the author wrote are the bytes that round-trip, and both must be
 * refused in the words the SERVER would have used — the failure #1118 undid
 * was a web parser whose allowlist was the UI's subset rather than the spec's
 * vocabulary, so a file the server reads would not open.
 *
 * SO THERE IS ONE VOCABULARY AND TWO ADAPTERS. `dungeonYaml.ts` reads this
 * grammar out of a YAML AST into its own in-memory `AnswerTableDoc` (axial
 * cells, a separate emitter); this reads it out of a parsed value into the
 * file shape a JSON document stores. Neither restates a trigger, a word, a
 * band, a selector or a refusal: everything below is READ from
 * `answerVocabulary.ts`, which is why a word the engine adds is picked up here
 * with no change — minus the closed sets that are still the engine's
 * (`laterWords` names are refused as unknown keys, which is what they are).
 *
 * WHAT IT DOES NOT DO. It never decides which entry fires, never sums weights,
 * and never resolves a selector. It refuses what the engine's strict decoder
 * would refuse, in the engine's own sentences, and carries the rest verbatim.
 *
 * A CELL AND A ROUTE ARE SPELT IN THE ROOM'S OWN FRAME (rpg-toolkit#2063).
 * `toward: { at: { q, r } }` and `toward: { path: [{ q, r }, …] }` name cells
 * in the axial frame the room's walkable hexes are written in, read as
 * strictly as the engine reads them (both keys, integers, nothing else). The
 * offset spelling `[col, row]` is resolved through a document `orientation`
 * this dialect does not carry, so it is refused here in the engine's sentence.
 * The v2 dialect (`dungeonYaml.ts`) keeps its offsets.
 *
 * WHETHER A CELL IS WALKABLE IS NOT ASKED HERE, as `dungeonYaml.ts` does not
 * ask whether a v2 cell is floor: that is membership, and the engine's floor
 * and route-leg rules are its own (`singleRoomCells`, `routeLegs`). This
 * reader refuses the shape and the spelling; the server grades the rest.
 */

import {
  ACTOR_WITHOUT_DEED_REFUSAL,
  ANSWER_AS_WORDS,
  ANSWER_AT_SELECTOR,
  ANSWER_ENTRY_RULES,
  ANSWER_PATH_SELECTOR,
  ANSWER_SEARCH,
  ANSWER_SOUND_KINDS,
  ANSWER_TRIGGER_KEYS,
  ANSWER_WHEN,
  ANSWER_WORD_KEYS,
  answerWhenRefusal,
  answerWord,
  answerWordRefusal,
  atSelectorRefusal,
  bothScopesRefusal,
  EMPTY_ENTRY_REFUSAL,
  EMPTY_FACT_REFUSAL,
  EMPTY_TRIGGER_REFUSAL,
  entryDoesOneThingRefusal,
  GROUP_SENTENCES,
  HEARING_SENTENCES,
  isSearchHeading,
  isSelectorWord,
  missingSpanRefusal,
  noneWordBodyRefusal,
  patternOf,
  patternRegExp,
  RETIRED_TRIGGER_KEYS,
  retiredTriggerRefusal,
  SEARCH_SHAPE_REFUSAL,
  searchDistanceRefusal,
  searchHeadingRefusal,
  searchKeyRefusal,
  SELECTOR_MAPPING_KEYS,
  selectorShapeRefusal,
  selectorWordLegalOn,
  SINGLE_ROOM_CELL_FORMS,
  spanRefusal,
  suggestKey,
  unknownDeedRefusal,
  unknownEnemyBandRefusal,
  unknownScopeRefusal,
  unknownSelectorKeyRefusal,
  unknownSelectorRefusal,
  unknownTriggerRefusal,
  weightRefusal,
  whenIsOneConditionRefusal,
  whenShapeRefusal,
  type SearchHeading,
} from '@/author/answerVocabulary';
import { FACING_NAMES, isValidFacing } from '@/components/hex-grid/facingYaw';

/** One cell of the room, as its walkable hexes are written: axial. */
export interface AnswerCellShape {
  q: number;
  r: number;
}

/** One waypoint of a route: a cell, and optionally the PAUSE there
 * (rpg-project#624, the engine's `decodeWaypoint`): `wait`, the whole rounds
 * the walker stands on it before walking on, and `facing`, the compass word
 * it faces while it stands. Walking, it faces its step; a facing without a
 * wait is refused, because the facing is the stand's. Absent keys stay
 * absent, so an unpaused route reads and writes exactly as it always did. */
export interface AnswerWaypointShape extends AnswerCellShape {
  wait?: number;
  facing?: string;
}

/** A selector as written: one of the sealed words (`sound` among them), an
 * authored cell `{ at: { q, r } }`, or an authored route `{ path: [{ q, r },
 * …] }` (rpg-toolkit#2063), each waypoint optionally stating its pause. A
 * mapping names exactly one of the two. */
export type AnswerSelectorShape =
  | string
  | { at: AnswerCellShape }
  | { path: AnswerWaypointShape[] };

/** The cell a selector names, if it names one. */
export function selectorCell(
  selector: AnswerSelectorShape | undefined
): AnswerCellShape | undefined {
  return typeof selector === 'object' && 'at' in selector
    ? selector.at
    : undefined;
}

/** The route a selector names, if it names one. */
export function selectorRoute(
  selector: AnswerSelectorShape | undefined
): AnswerWaypointShape[] | undefined {
  return typeof selector === 'object' &&
    'path' in selector &&
    Array.isArray(selector.path)
    ? selector.path
    : undefined;
}

/** The parameter a route is written as inside a bundle, `path: $path`
 * (rpg-project#670), or undefined for a route of cells or no route. */
export function selectorRouteParam(
  selector: AnswerSelectorShape | undefined
): string | undefined {
  if (typeof selector !== 'object' || !('path' in selector)) return undefined;
  return paramRefOf(selector.path);
}

/** The parameter a scalar names inside a bundle's rows, `$distance` →
 * `distance`, or undefined for any other value (rpg-project#670): the
 * engine replaces a whole `$name` scalar, and nothing else. */
export function paramRefOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 1 && value.startsWith('$')
    ? value.slice(1)
    : undefined;
}

/** A `when:` as written: EXACTLY ONE exclusive enemy band, or one deed with
 * its span and — optionally — WHOSE deed it is about. The key IS the shape,
 * so no generic `deed:` field is invented.
 *
 * THE SCOPE REFINES THE DEED, it is not a second condition: `{ attacked: {
 * within: 3, on: ally } }` still names exactly one thing (rpg-toolkit#1883).
 * An enemy band has no "whose", which is why the scope lives on the deed
 * branches alone.
 *
 * THE TWO KEYS ARE OPTIONAL AND MUTUALLY EXCLUSIVE BY CONSTRUCTION: absent
 * means "the creature itself", which is what the field being absent says — so
 * there is no third word for it to disagree about. */
export type AnswerWhenDeed = {
  within: number;
  on?: 'ally';
  as?: 'actor';
};

/** `heard: { kind, within }` — a sound of a sealed kind, no older than the
 * span (rpg-project#569 H2). No maker: a sound names nobody (R4). */
export interface AnswerWhenHeard {
  kind: string;
  within: number;
}

/** ONE condition — one key, so the key IS the condition. `not` wraps exactly
 * one more condition (R8), never a list. */
export type AnswerWhenCondition =
  | { enemy: string }
  | { attacked: AnswerWhenDeed }
  | { intimidated: AnswerWhenDeed }
  | { persuaded: AnswerWhenDeed }
  | { fled: AnswerWhenDeed }
  | { heard: AnswerWhenHeard }
  | { fact: string }
  | { not: AnswerWhenCondition };

/** A `when:` AS WRITTEN — one condition as a single mapping, or a LIST of
 * them, every one of which must hold (rpg-project#569 R8). Both spellings are
 * carried exactly as the file had them, so an unedited file re-emits its own
 * bytes; the editor normalizes only what it writes ([whenFromConditions]). */
export type AnswerWhenShape = AnswerWhenCondition | AnswerWhenCondition[];

/** The conditions a written `when` holds, as a list — a single mapping is a
 * one-entry list. Absent is the empty list: "always eligible". */
export function whenConditions(
  when: AnswerWhenShape | undefined
): AnswerWhenCondition[] {
  if (when === undefined) return [];
  return Array.isArray(when) ? when : [when];
}

/** Whether a condition is a `not`. */
export function isNotCondition(
  condition: AnswerWhenCondition
): condition is { not: AnswerWhenCondition } {
  return 'not' in condition;
}

/**
 * The `when` the EDITOR writes for a list of conditions — the one place the
 * spelling is chosen:
 *
 *   - none → absent (the row is always eligible);
 *   - one, and not a `not` → the single mapping, which is the spelling every
 *     file before the list form used, so a row the author did not change in
 *     kind keeps its bytes;
 *   - otherwise → the list, so a negative always reads as an entry of one.
 */
export function whenFromConditions(
  conditions: readonly AnswerWhenCondition[]
): AnswerWhenShape | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1 && !isNotCondition(conditions[0]))
    return conditions[0];
  return [...conditions];
}

/** Whether the row LISTENS — a `heard` among its top-level conditions, never
 * one inside a `not` (`Answer.listens`). What makes `sound` legal. */
export function whenListensShape(when: AnswerWhenShape | undefined): boolean {
  return whenConditions(when).some((condition) => 'heard' in condition);
}

/** Whether any condition the row stands on names a DEED — positively; a
 * negated deed has no actor — which is what makes the `actor` selector
 * legal. */
export function whenNamesDeedShape(when: AnswerWhenShape | undefined): boolean {
  return whenConditions(when).some((condition) =>
    Object.keys(condition).some((key) => ANSWER_WHEN.deeds.includes(key))
  );
}

/** One answer entry as written. `weight`/`say`/`when` + at most one word. */
export interface AnswerEntryShape {
  weight?: number;
  say?: string;
  when?: AnswerWhenShape;
  fact?: string;
  flee?: Record<string, unknown>;
  hold?: Record<string, unknown>;
  attack?: AnswerSelectorShape;
  toward?: AnswerSelectorShape;
  away?: AnswerSelectorShape;
  /** `search: { distance }` (rpg-project#668 R4); distance absent is the
   * engine's six, carried absent so the file's bytes round-trip. */
  search?: AnswerSearchShape;
  /** `use: <bundle>` makes this row a GROUP (rpg-project#670): its answer is
   * the named bundle's rows, declared once under the root `bundles:`. A
   * `use:` row carries `weight`, `when`, `with` and `as` and no word. */
  use?: string;
  /** The bundle's parameters for this use, by name, carried as written: each
   * replaces every `$name` in the bundle's rows, whole. */
  with?: Record<string, unknown>;
  /** The temperament word the group counts as — one of attack, toward, away,
   * flee or hold — or absent for none, which loads at 100. */
  as?: string;
}

/** Whether a row is a group: it uses a bundle. */
export function isUseEntry(
  entry: AnswerEntryShape
): entry is AnswerEntryShape & { use: string } {
  return entry.use !== undefined;
}

/** `search`'s body as written: `{}`, `{ distance: N }`, `{ heading: H }` or
 * both. Each key absent is the engine's default (six, `went`), carried absent
 * so the file's bytes round-trip. */
export interface AnswerSearchShape {
  distance?: number;
  heading?: SearchHeading;
}

/** An `on:` block as written: trigger key to the entries on it. An empty list
 * is never valid (`placeOn`), so a trigger either has entries or is absent. */
export type AnswerTableShape = Record<string, AnswerEntryShape[]>;

const isMapping = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The keys an entry may carry — `AnswerSpec.UnmarshalYAML`'s allowlist, with
 * the words read from the vocabulary rather than listed again. */
const ENTRY_KEYS: readonly string[] = Object.freeze([
  'weight',
  'say',
  'when',
  ...ANSWER_WORD_KEYS,
  'use',
  'with',
  'as',
]);

/** The engine reads a raw node here, so a non-scalar `enemy:` reaches it as
 * the empty string and anything scalar as its own text. Mirrors
 * `dungeonYaml.ts`'s `scalarText` so `enemy: [1, 2]` reports the same empty
 * band from either reader. */
function scalarText(value: unknown): string {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : '';
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

/** One `on:` block. `path` is the whole caller-side path prefix so a refusal
 * points at the entry, exactly as the v2 parser's paths do. */
export function validateAnswerTable(
  value: unknown,
  path: string
): AnswerTableShape {
  if (!isMapping(value))
    fail(
      path,
      `expected a map of trigger to entries (${ANSWER_TRIGGER_KEYS.join(', ')})`
    );
  const table: AnswerTableShape = {};
  for (const [trigger, rawEntries] of Object.entries(value)) {
    if (RETIRED_TRIGGER_KEYS.includes(trigger))
      fail(`${path}.${trigger}`, retiredTriggerRefusal(trigger));
    if (!ANSWER_TRIGGER_KEYS.includes(trigger)) {
      const meant = suggestKey(trigger, ANSWER_TRIGGER_KEYS);
      fail(
        path,
        `${unknownTriggerRefusal(trigger)}${meant ? ` — did you mean "${meant}"?` : ''}`
      );
    }
    if (!Array.isArray(rawEntries))
      fail(`${path}.${trigger}`, 'expected a list of entries');
    if (rawEntries.length === 0)
      fail(`${path}.${trigger}`, EMPTY_TRIGGER_REFUSAL);
    // Judged in the AUTHORED order, so a refusal names the row the author
    // wrote; carried HEAVIEST FIRST (R12).
    table[trigger] = heaviestFirst(
      rawEntries.map((entry, index) =>
        validateAnswerEntry(entry, `${path}.${trigger}[${index}]`, trigger)
      )
    );
  }
  return table;
}

/**
 * The rows HEAVIEST FIRST, equal weights in authored order (rpg-project#576,
 * R12). An absent weight is the engine's 1.
 *
 * ORDER CARRIES NO MEANING IN THE ROLL. The engine weighs every eligible row
 * whatever its position (`mind/behavior` `Pick`), so the sort changes no
 * outcome; it exists because a heavy row in the middle of a list is misread.
 * The beat's entry index is a position in the file as SAVED, which is this
 * order. Weights are never touched.
 */
export function heaviestFirst<T extends { weight?: number }>(
  rows: readonly T[]
): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) => (b.row.weight ?? 1) - (a.row.weight ?? 1) || a.index - b.index
    )
    .map(({ row }) => row);
}

/**
 * One entry: `{ weight?, say?, when?, <one word> }`.
 *
 * The refusals run in the ENGINE'S OWN ORDER (`answerEntry`, mirrored by
 * `dungeonYaml.ts`'s `answerEntry`) so an author who made one mistake gets one
 * sentence: unknown keys first, then the weight, then an empty `fact` (which
 * is reported INSTEAD of the no-word refusal, not beside it), then two words,
 * then an entry that does nothing, then the word's legality, then the
 * selector.
 */
function validateAnswerEntry(
  value: unknown,
  path: string,
  trigger: string
): AnswerEntryShape {
  if (!isMapping(value))
    fail(
      path,
      `an entry is { weight, say, when } plus exactly one of { ${ANSWER_WORD_KEYS.join(
        ', '
      )} }`
    );
  for (const key of Object.keys(value)) {
    if (ENTRY_KEYS.includes(key)) continue;
    // THE RETIRED WORD POINTS AT ITS REPLACEMENT (rpg-project#569 R7): a
    // patrol is `toward: { path }`, and an author who wrote `patrol` meant it.
    if (key === 'patrol')
      fail(`${path}.patrol`, HEARING_SENTENCES.patrol(SINGLE_ROOM_CELL_FORMS));
    const meant = suggestKey(key, ENTRY_KEYS);
    fail(
      path,
      `unknown key "${key}"${meant ? ` — did you mean "${meant}"?` : ''}`
    );
  }

  // A GROUP ROW IS ITS OWN SHAPE (rpg-project#670): no word of its own.
  if (value.use !== undefined && value.use !== null)
    return validateUseEntry(value, path, trigger);
  if (value.with !== undefined && value.with !== null)
    fail(`${path}.with`, GROUP_SENTENCES.withWithoutUse());
  if (value.as !== undefined && value.as !== null)
    fail(`${path}.as`, GROUP_SENTENCES.asWithoutUse());

  // The words are found by ASKING THE VOCABULARY, not by listing keys here: a
  // word the engine adds is read by this loop with no change.
  const words = ANSWER_WORD_KEYS.filter(
    (key) => value[key] !== undefined && value[key] !== null
  );

  const entry: AnswerEntryShape = {};

  if (value.weight !== undefined && value.weight !== null) {
    const weight = value.weight;
    if (typeof weight !== 'number' || !Number.isInteger(weight))
      fail(`${path}.weight`, 'expected a whole number');
    // An authored weight is KEPT as authored — including a redundant `1` —
    // because omitted is 1 to the engine and the two are different bytes.
    entry.weight = weight;
    if (weight < ANSWER_ENTRY_RULES.minimumWeight)
      fail(`${path}.weight`, weightRefusal(weight));
  }

  if (value.say !== undefined && value.say !== null) {
    if (typeof value.say !== 'string') fail(`${path}.say`, 'expected a string');
    entry.say = value.say;
  }

  if (value.when !== undefined && value.when !== null)
    entry.when = validateAnswerWhen(value.when, `${path}.when`, path);

  // --- the engine's own rules, in `answerEntry`'s order ---

  // An empty `fact:` is its own sentence rather than a missing word: the
  // author wrote the key, so they meant to teach something.
  if (words.includes('fact') && value.fact === '')
    fail(`${path}.fact`, EMPTY_FACT_REFUSAL);
  // A ROW TEACHES ONE FACT, BY NAME (rpg-project#684 L2).
  if (
    words.includes('fact') &&
    typeof value.fact === 'string' &&
    patternOf(value.fact) !== undefined
  )
    fail(`${path}.fact`, GROUP_SENTENCES.patternTaught(value.fact));

  if (words.length > ANSWER_ENTRY_RULES.maximumWords)
    fail(path, entryDoesOneThingRefusal(words));

  // The rule is READ from the declaration, not restated here.
  if (
    ANSWER_ENTRY_RULES.wordRequiredUnlessSaid &&
    words.length === 0 &&
    entry.say === undefined
  )
    fail(path, EMPTY_ENTRY_REFUSAL);

  // THE APPLICABILITY DIMENSION. A word under a trigger it is not legal on is
  // refused with the engine's own sentence, and which sentence an author gets
  // depends on the direction of the mistake.
  for (const word of words) {
    const refusal = answerWordRefusal(word, trigger);
    if (refusal) fail(`${path}.${word}`, refusal);
  }

  // `when` is a `time` word: a social key IS the condition.
  if (entry.when !== undefined) {
    const refusal = answerWhenRefusal(trigger);
    if (refusal) fail(`${path}.when`, refusal);
  }

  // The word's value, by the shape the DECLARATION gives it.
  for (const word of words) {
    const raw = value[word];
    const shape = answerWord(word)?.value;
    if (shape === 'string') {
      if (typeof raw !== 'string') fail(`${path}.${word}`, 'expected a string');
      if (word === 'fact') entry.fact = raw;
    } else if (shape === 'selector') {
      const selector = validateAnswerSelector(raw, `${path}.${word}`, word);
      if (word === 'attack') entry.attack = selector;
      else if (word === 'toward') entry.toward = selector;
      else if (word === 'away') entry.away = selector;
    } else if (shape === 'search') {
      entry.search = validateAnswerSearch(raw, `${path}.${word}`);
    } else {
      // `value: 'none'` — the engine's `FleeSpec`/`HoldSpec` are structs, so a
      // scalar or a sequence is refused; a MAPPING IS ACCEPTED, because the
      // custom unmarshaler means `KnownFields` never reaches inside it.
      if (!isMapping(raw)) fail(`${path}.${word}`, noneWordBodyRefusal(word));
      if (word === 'flee') entry.flee = raw;
      else if (word === 'hold') entry.hold = raw;
    }
  }

  // `actor` needs a deed to have been the actor of; `sound` needs a row that
  // listened. A cell or a route is neither, and passes both.
  for (const word of words) {
    const selector =
      word === 'attack'
        ? entry.attack
        : word === 'toward'
          ? entry.toward
          : word === 'away'
            ? entry.away
            : undefined;
    if (selector === undefined) continue;
    // A deed named POSITIVELY by any entry of the list: a negated deed has no
    // actor to have been.
    const deedNamed = whenNamesDeedShape(entry.when);
    if (selector === 'actor' && !deedNamed)
      fail(`${path}.${word}`, ACTOR_WITHOUT_DEED_REFUSAL);
    // THE SOUND A ROW WALKS TO IS THE ONE IT LISTENED FOR (R10, as the
    // behavior review refined it): `sound` needs a top-level `heard`, and a
    // `heard` inside a `not` is not listening. Reported at the entry, as the
    // engine reports mind/behavior's own refusals.
    if (selector === 'sound' && !whenListensShape(entry.when))
      fail(path, HEARING_SENTENCES.soundWithoutHeard());
  }

  return entry;
}

/** The words a group row may NOT carry, in `behavior.Answer.words`' order:
 * every outcome word, the search, the line and the fact. */
const GROUP_CARRIED_KEYS: readonly string[] = Object.freeze([
  'hold',
  'attack',
  'toward',
  'away',
  'flee',
  'search',
  'say',
  'fact',
]);

/**
 * A `use:` row (rpg-project#670): `{ use, with?, weight?, when?, as? }`.
 *
 * What a row can be told FROM THE ROW ALONE is refused here, in the engine's
 * order: the weight, a social `when`, a word carried, then `as`. Whether the
 * bundle exists, whether the parameters fit it, and what its rows say are the
 * DOCUMENT's questions — asked by `groupRefusals` with the engine's sentences,
 * and refused by the engine at its own door — because a form builder never
 * resolves a name at decode (`TablesPanel`'s rule for a `table:`).
 */
function validateUseEntry(
  value: Record<string, unknown>,
  path: string,
  trigger: string
): AnswerEntryShape {
  if (typeof value.use !== 'string')
    fail(`${path}.use`, 'expected a bundle name');
  if (value.use === '') fail(`${path}.use`, GROUP_SENTENCES.noBundleNamed());
  const entry: AnswerEntryShape = { use: value.use };
  if (value.weight !== undefined && value.weight !== null) {
    const weight = value.weight;
    if (typeof weight !== 'number' || !Number.isInteger(weight))
      fail(`${path}.weight`, 'expected a whole number');
    entry.weight = weight;
    if (weight < ANSWER_ENTRY_RULES.minimumWeight)
      fail(`${path}.weight`, weightRefusal(weight));
  }
  if (value.when !== undefined && value.when !== null) {
    entry.when = validateAnswerWhen(value.when, `${path}.when`, path);
    const refusal = answerWhenRefusal(trigger);
    if (refusal) fail(`${path}.when`, refusal);
  }
  if (value.with !== undefined && value.with !== null) {
    if (!isMapping(value.with))
      fail(`${path}.with`, 'expected a map of parameter to value');
    entry.with = value.with;
  }
  const carried = GROUP_CARRIED_KEYS.filter(
    (key) => value[key] !== undefined && value[key] !== null
  );
  if (carried.length > 0) fail(path, GROUP_SENTENCES.carries(carried));
  if (value.as !== undefined && value.as !== null) {
    const as = scalarText(value.as);
    if (!ANSWER_AS_WORDS.includes(as)) fail(path, GROUP_SENTENCES.asWord(as));
    entry.as = as;
  }
  return entry;
}

/**
 * A bundle's rows, judged AS ROWS of `trigger` once a use has substituted its
 * parameters (rpg-project#670), in authored order: the bundle's order is the
 * group's, and the engine rolls it as written.
 */
export function validateAnswerRows(
  rows: readonly unknown[],
  path: string,
  trigger: string
): AnswerEntryShape[] {
  return rows.map((row, index) =>
    validateAnswerEntry(row, `${path}[${index}]`, trigger)
  );
}

/** `search: { distance, heading }` — `dungeonspec.SearchSpec.UnmarshalYAML`:
 * a mapping, reading `distance` and `heading` and nothing else, the distance a
 * whole number counted from 1 and the heading one of the sealed four. */
export function validateAnswerSearch(
  value: unknown,
  path: string
): AnswerSearchShape {
  if (!isMapping(value)) fail(path, SEARCH_SHAPE_REFUSAL);
  for (const key of Object.keys(value)) {
    if (!ANSWER_SEARCH.bodyKeys.includes(key))
      fail(path, searchKeyRefusal(key));
  }
  const search: AnswerSearchShape = {};
  if (value.distance !== undefined && value.distance !== null) {
    const distance = value.distance;
    if (typeof distance !== 'number' || !Number.isInteger(distance))
      fail(`${path}.distance`, 'expected a whole number');
    if (distance < ANSWER_SEARCH.minimumDistance)
      fail(path, searchDistanceRefusal(distance));
    search.distance = distance;
  }
  if (value.heading !== undefined && value.heading !== null) {
    if (!isSearchHeading(value.heading))
      fail(path, searchHeadingRefusal(value.heading));
    search.heading = value.heading;
  }
  return search;
}

/** A `when:` — ONE condition as a single mapping, or a LIST of them every
 * one of which must hold (rpg-project#569 R8; `WhenListSpec`).
 *
 * THE REFUSALS RUN IN THE ENGINE'S OWN ORDER (`WhenSpec.UnmarshalYAML`), so an
 * author who made one mistake gets one sentence: the shape, then two
 * conditions, then the condition's own rules.
 *
 * A LIST IS CARRIED AS A LIST, never folded to a single mapping here, so the
 * bytes the author wrote are the bytes that round-trip. */
function validateAnswerWhen(
  value: unknown,
  path: string,
  rowPath: string
): AnswerWhenShape {
  if (Array.isArray(value)) {
    if (value.length === 0) fail(path, HEARING_SENTENCES.emptyWhenList());
    return value.map((item, index) =>
      validateWhenCondition(item, `${path}[${index}]`, rowPath, (s) => s)
    );
  }
  return validateWhenCondition(value, path, rowPath, (s) => s);
}

/** ONE condition: an enemy band, a deed with its span and scope, `heard`,
 * `fact`, or `not` around one more condition.
 *
 * UNKNOWN BODY KEYS ARE REFUSED BY HAND because `Decode`'s strictness does not
 * reach inside a custom unmarshaler (rpg-toolkit#1890 thread 3): the dropped
 * key would decide WHOSE deeds the row reads. */
function validateWhenCondition(
  value: unknown,
  path: string,
  /** Where a `mind/behavior` fault is reported — the row, `…time[i]`. */
  rowPath: string,
  /** "inside `not`: …" once per `not` this condition sits in. */
  wrap: (sentence: string) => string
): AnswerWhenCondition {
  if (!isMapping(value) || Object.keys(value).length === 0)
    fail(path, whenShapeRefusal());
  const keys = Object.keys(value);
  if (keys.length > 1) fail(path, whenIsOneConditionRefusal(keys.length));
  const key = keys[0];

  if (key === ANSWER_WHEN.heardKey)
    return {
      heard: validateHeard(value.heard, `${path}.heard`, rowPath, wrap),
    };

  if (key === ANSWER_WHEN.factKey) {
    const fact = value.fact;
    // The engine reads a scalar here; anything else, or nothing, names none.
    if (
      typeof fact !== 'string' &&
      typeof fact !== 'number' &&
      typeof fact !== 'boolean'
    )
      fail(`${path}.fact`, HEARING_SENTENCES.emptyFactCondition());
    const id = scalarText(fact);
    if (id === '') fail(`${path}.fact`, HEARING_SENTENCES.emptyFactCondition());
    // A PATTERN OVER FACT IDS (rpg-project#670 R16): one that does not
    // compile is mind/behavior's, at the row; whether it matches a fact this
    // file sets is the document's question (`groupRefusals`).
    const pattern = patternOf(id);
    if (pattern === '') fail(path, GROUP_SENTENCES.factEmptyPattern());
    if (pattern !== undefined && patternRegExp(pattern) === undefined)
      fail(rowPath, wrap(GROUP_SENTENCES.notAPattern('`fact`', id)));
    return { fact: id };
  }

  if (key === ANSWER_WHEN.notKey) {
    // ONE CONDITION, judged by this same function: a `not` inside a `not` is
    // legal, and a list or a scalar is refused with the shape sentence.
    return {
      not: validateWhenCondition(value.not, `${path}.not`, rowPath, (s) =>
        wrap(HEARING_SENTENCES.insideNot(s))
      ),
    };
  }

  if (key === 'enemy') {
    const band = scalarText(value.enemy);
    if (!ANSWER_WHEN.enemyBands.includes(band))
      fail(path, unknownEnemyBandRefusal(band));
    return { enemy: band };
  }

  if (!ANSWER_WHEN.deeds.includes(key)) fail(path, unknownDeedRefusal(key));
  const body = value[key];
  if (!isMapping(body)) fail(path, missingSpanRefusal(key));

  for (const bodyKey of Object.keys(body)) {
    // `within`, `on` and `as` are the three keys the engine decodes, read from
    // the one declaration rather than listed again. The sentence is Go's own
    // strict-field text, because that is what the server would say.
    if (ANSWER_WHEN.bodyKeys.includes(bodyKey)) continue;
    fail(
      `${path}.${key}.${bodyKey}`,
      `field ${bodyKey} not found in type dungeonspec.withinSpec`
    );
  }

  const within = body.within;
  if (within === undefined || within === null)
    fail(path, missingSpanRefusal(key));
  if (typeof within !== 'number' || !Number.isInteger(within))
    fail(`${path}.${key}.within`, 'expected a whole number');
  if (within < ANSWER_WHEN.minimumWithin) fail(path, spanRefusal(within));

  const scope = validateWhenScope(body, `${path}.${key}`, key);
  return { [key]: { within, ...scope } } as AnswerWhenCondition;
}

/** `heard: { kind, within }`. The DECODER refuses the shape, an unknown key
 * and a kind no deed makes; a missing kind and a span below 1 (an absent span
 * reads as 0) are `When.Validate`'s, reported at the ROW and prefixed
 * "inside `not`:" once per `not` around them — the engine's own split. */
function validateHeard(
  value: unknown,
  path: string,
  rowPath: string,
  wrap: (sentence: string) => string
): AnswerWhenHeard {
  if (!isMapping(value)) fail(path, HEARING_SENTENCES.heardShape());
  for (const key of Object.keys(value)) {
    if (ANSWER_WHEN.heardBodyKeys.includes(key)) continue;
    fail(`${path}.${key}`, HEARING_SENTENCES.heardUnknownKey(key));
  }
  const kind =
    value.kind === undefined || value.kind === null
      ? ''
      : scalarText(value.kind);
  // A PATTERN IS JUDGED AGAINST THE SOUNDS A FILE CAN MAKE
  // (rpg-project#684 L3), in `decodeHeard`'s order: empty, then matching
  // nothing. One that does not compile is mind/behavior's, at the row.
  const pattern = patternOf(kind);
  if (pattern !== undefined) {
    if (pattern === '')
      fail(`${path}.kind`, GROUP_SENTENCES.heardEmptyPattern());
    const re = patternRegExp(pattern);
    if (re === undefined)
      fail(rowPath, wrap(GROUP_SENTENCES.notAPattern('`heard` kind', kind)));
    if (!ANSWER_SOUND_KINDS.some((k) => re.test(k)))
      fail(`${path}.kind`, GROUP_SENTENCES.heardPatternNoSound(kind));
  } else if (kind !== '' && !ANSWER_SOUND_KINDS.includes(kind))
    fail(`${path}.kind`, HEARING_SENTENCES.unknownSoundKind(kind));
  const raw = value.within;
  if (
    raw !== undefined &&
    raw !== null &&
    (typeof raw !== 'number' || !Number.isInteger(raw))
  )
    fail(`${path}.within`, 'expected a whole number');
  const within = typeof raw === 'number' ? raw : 0;
  if (kind === '') fail(rowPath, wrap(HEARING_SENTENCES.heardNoKind()));
  if (within < ANSWER_WHEN.minimumWithin)
    fail(rowPath, wrap(HEARING_SENTENCES.heardSpan(within)));
  return { kind, within };
}

/** WHOSE deed a condition is about — `on: ally`, `as: actor`, or `undefined`
 * for the creature itself. `WhenSpec.scopeOf`'s two refusals, in its own
 * order: both spellings at once, then an unknown word BY NAME.
 *
 * `undefined` is the third answer and is NOT a spelling: a document says "the
 * creature itself" by omitting the field, so there is no word to return. */
function validateWhenScope(
  body: Record<string, unknown>,
  path: string,
  deed: string
): Pick<AnswerWhenDeed, 'on' | 'as'> {
  const on = body.on;
  const as = body.as;

  // THE ENGINE'S OWN PATH, for every value class (probed against yaml.v3
  // v3.0.1, the toolkit's pinned version — independent review round, finding 2).
  //
  //   on: 5      decodes to the string "5"     -> scopeOf refuses by name   MATCHES
  //   on: true   decodes to the string "true"  -> scopeOf refuses by name   MATCHES
  //   on: ""     decodes to a non-nil empty    -> scopeOf refuses by name   MATCHES
  //   on: null   decodes to nil                -> the creature itself       MATCHES
  //   on: {a: b} FAILS at body.Decode          -> the takes-wrapper sentence DIVERGES
  //   on: [1, 2] FAILS at body.Decode          -> the takes-wrapper sentence DIVERGES
  //
  // THE NON-SCALAR IS A SENTENCE DIVERGENCE, NOT A SILENT REWRITE: both sides
  // still REFUSE the document, only the words differ. The engine never reaches
  // `scopeOf` for one — `Decode` fails first and `UnmarshalYAML` wraps it as
  // "`<deed>` takes { within: N }: yaml: unmarshal errors: ...". That wrapper
  // quotes a Go yaml error string, and restating it here would put a second
  // copy of yaml.v3's phrasing in this file for a pathological input — the
  // drift this module exists to prevent. So the unknown-word sentence stands,
  // and the divergence is stated rather than pretended away.
  //
  // THE ENGINE TESTS PRESENCE, NOT TRUTH, and `null` is the absence: mirroring
  // that is why a nullish value is dropped BEFORE `scalarText`, which maps a
  // non-scalar to "" and so refuses rather than silently reading it as self.
  const onText = on === undefined || on === null ? undefined : scalarText(on);
  const asText = as === undefined || as === null ? undefined : scalarText(as);

  if (onText !== undefined && asText !== undefined)
    fail(path, bothScopesRefusal(deed, onText, asText));

  if (onText !== undefined) {
    if (onText !== 'ally')
      fail(`${path}.on`, unknownScopeRefusal('on', onText));
    return { on: 'ally' };
  }
  if (asText !== undefined) {
    if (asText !== 'actor')
      fail(`${path}.as`, unknownScopeRefusal('as', asText));
    return { as: 'actor' };
  }
  return {};
}

/** One selector on a table word: a sealed word (`sound` among them), a cell
 * `{ at: { q, r } }` or a route `{ path: [{ q, r }, …] }`. `word` is the table
 * word it sits on, because `sound` on `attack` and a cell on anything but
 * `toward` are refused for the pair.
 *
 * THE ENGINE'S ORDER (rpg-toolkit#2063), so one mistake reads as one
 * sentence: the decoder first (a key that is not `at`/`path`, a `{ q, r }`
 * that is not strictly one), then the frame — a route spelt in offsets, else
 * a cell spelt in offsets, each refused whole — then a cell on a word that
 * acts on a creature, then mind/behavior's shape at the row: both a cell and
 * a route, neither, a route on a word that does not walk one. */
function validateAnswerSelector(
  value: unknown,
  path: string,
  word: string
): AnswerSelectorShape {
  if (typeof value === 'string') {
    if (!isSelectorWord(value))
      fail(path, unknownSelectorRefusal(value, SINGLE_ROOM_CELL_FORMS));
    if (!selectorWordLegalOn(value, word))
      // A SELECTOR-SHAPE FAULT IS THE ROW'S (rpg-toolkit#2044): the engine
      // asks mind/behavior of the compiled row and reports at `…time[i]`.
      fail(rowPathOf(path, word), HEARING_SENTENCES.attackSound());
    return value;
  }
  if (isMapping(value)) {
    // DECODE IN DOCUMENT ORDER, as `SelectorSpec.UnmarshalYAML` walks the
    // mapping: an unknown key, a malformed `at` and a malformed `path` are
    // refused as each is reached, so the first one written is the one
    // reported. A parsed mapping keeps the file's key order. Each spelling
    // goes into its own slot, as `decodeAt`/`decodePath` do; an offset is
    // only noted here, and the frame refuses it below, by path.
    const rawAt = value[ANSWER_AT_SELECTOR.key];
    const hasAt = rawAt !== undefined && rawAt !== null;
    let at: AnswerCellShape | null = null;
    const rawPath = value[ANSWER_PATH_SELECTOR.key];
    const waypoints = Array.isArray(rawPath) ? (rawPath as unknown[]) : [];
    const route: AnswerWaypointShape[] = [];
    let offsetWaypoint = false;
    for (const key of Object.keys(value)) {
      if (!SELECTOR_MAPPING_KEYS.includes(key))
        fail(path, unknownSelectorKeyRefusal(key));
      if (key === ANSWER_AT_SELECTOR.key && hasAt && isMapping(rawAt))
        at = hexCell(rawAt, `${path}.at`);
      if (key === ANSWER_PATH_SELECTOR.key)
        waypoints.forEach((waypoint, i) => {
          if (isMapping(waypoint))
            route.push(routeWaypoint(waypoint, `${path}.path[${i}]`));
          else offsetWaypoint = true;
        });
    }
    // THE FRAME: a route first, then a cell; an offset is the whole defect.
    // A `path` that is not a list at all is refused here too — the engine's
    // decoder refuses it in yaml.v3's words, which this file does not copy.
    const routeWritten =
      waypoints.length > 0 ||
      (rawPath !== undefined && rawPath !== null && !Array.isArray(rawPath));
    if (routeWritten && (offsetWaypoint || !Array.isArray(rawPath)))
      fail(`${path}.path`, HEARING_SENTENCES.singleRoomPath());
    if (!routeWritten && hasAt) {
      if (at === null) fail(`${path}.at`, HEARING_SENTENCES.singleRoomCell());
      if (word !== ANSWER_AT_SELECTOR.onlyWord)
        fail(path, atSelectorRefusal(word));
    }
    // mind/behavior's shape, at the ROW (`Selector.validate`).
    if (hasAt && route.length > 0)
      fail(rowPathOf(path, word), HEARING_SENTENCES.selectorNamesBoth(word));
    if (route.length > 0) {
      if (word !== ANSWER_PATH_SELECTOR.onlyWord)
        fail(rowPathOf(path, word), HEARING_SENTENCES.pathNotToward(word));
      return { path: route };
    }
    if (at !== null) return { at };
    fail(rowPathOf(path, word), HEARING_SENTENCES.namesNoTarget(word));
  }
  fail(path, selectorShapeRefusal(SINGLE_ROOM_CELL_FORMS));
}

/** `decodeHexCell`: one axial `{ q, r }`, STRICTLY — both keys, each an
 * integer, nothing else — in the engine's sentences (minus the `line N:`
 * prefix this reader never carries). A missing `r` read as 0 would be a
 * creature sent to a cell nobody wrote. */
function hexCell(
  value: Record<string, unknown>,
  path: string
): AnswerCellShape {
  for (const key of Object.keys(value)) {
    if (key !== 'q' && key !== 'r')
      fail(path, `field ${key} not found in type dungeonspec.RoomCell`);
    const n = value[key];
    if (typeof n !== 'number' || !Number.isInteger(n))
      fail(path, `a cell's ${key} must be an integer`);
  }
  for (const key of ['q', 'r']) {
    if (!(key in value))
      fail(path, `a cell is { q, r }, and this one has no ${key}`);
  }
  // Written q then r, the order the engine's fixture and the room's own
  // walkable hexes use, so the bytes re-emit in that order.
  return { q: value.q as number, r: value.r as number };
}

/** The engine's `decodeWaypoint` and the dialect's waypoint checks
 * (`grammar.go`, rpg-project#624), in its sentences: a strict `{ q, r }`
 * plus an optional `facing` word and `wait` count. The decode refusals are
 * said at the waypoint, the dialect's at the key it judges. Keys are kept in
 * the file's order — q, r, then the pause — so the bytes re-emit as written. */
function routeWaypoint(
  value: Record<string, unknown>,
  path: string
): AnswerWaypointShape {
  // DECODE, in the file's key order as the engine reads it: each pause key
  // must be a word or a whole number; then the cell, strictly.
  const cell: Record<string, unknown> = {};
  const pause: { wait?: number; facing?: string } = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === 'facing') {
      if (typeof v !== 'string')
        fail(
          path,
          `a waypoint's facing is a word, one of ${FACING_NAMES.join('|')}`
        );
      pause.facing = v;
    } else if (key === 'wait') {
      if (typeof v !== 'number' || !Number.isInteger(v))
        fail(path, "a waypoint's wait is a whole number of rounds");
      pause.wait = v;
    } else cell[key] = v;
  }
  const out: AnswerWaypointShape = { ...hexCell(cell, path), ...pause };
  // THE DIALECT: the placement's vocabulary, the facing is the stand's, and
  // a stand is not negative.
  if (pause.facing !== undefined && !isValidFacing(pause.facing))
    fail(
      `${path}.facing`,
      `"${pause.facing}" is not a compass direction: a facing is one of ${FACING_NAMES.join('|')}`
    );
  if (pause.facing !== undefined && !pause.wait)
    fail(
      `${path}.facing`,
      'a facing is taken while standing; give the waypoint a wait'
    );
  if (pause.wait !== undefined && pause.wait < 0)
    fail(
      `${path}.wait`,
      `a wait is how many rounds the walker stands here, and ${pause.wait} is negative`
    );
  return out;
}

/** The row's own path, from a selector's `…time[i].<word>`. */
function rowPathOf(selectorPath: string, word: string): string {
  const suffix = `.${word}`;
  return selectorPath.endsWith(suffix)
    ? selectorPath.slice(0, -suffix.length)
    : selectorPath;
}

// ---------------------------------------------------------------------------
// OPTIONS — the lines a character can say to a creature or a prop
// (rpg-project#569, rpg-toolkit#2039)
// ---------------------------------------------------------------------------

/** One way through an option's check — the engine's `ApproachSpec`, the same
 * route a lock carries. `ability` is an opaque rulebook ref and `dc` what the
 * roll must beat. CARRIED, NEVER INTERPRETED: what a ref resolves to is the
 * engine's judgement. */
export interface AnswerApproachShape {
  ability: string;
  dc: number;
  tool?: string;
}

/** What must hold for the SPEAKER before a line is offered (R9): a fact the
 * speaker knows, or a placed prop the speaker carries. Exactly one form, and
 * only these two — `round`, `down` and `stance` answer "when", not "who may
 * say this". */
export type OptionRequiresShape = { fact: string } | { holds: string };

/** One option as written (`dungeonspec.OptionSpec`): an id, the line, the
 * approaches through its check, what gates it, and what is answered on each
 * verdict. The verdict rows are answer entries judged by the table's own
 * grammar under the verdict's key. */
export interface OptionShape {
  id: string;
  say: string;
  check: AnswerApproachShape[];
  requires?: OptionRequiresShape;
  success?: AnswerEntryShape[];
  failure?: AnswerEntryShape[];
}

/** The two verdict keys, in the order the engine judges and writes them. */
export const OPTION_VERDICTS = ['success', 'failure'] as const;
export type OptionVerdict = (typeof OPTION_VERDICTS)[number];

/** Every key an option reads — `optionKeys` in `dungeonspec/spec.go`. */
const OPTION_KEYS: readonly string[] = Object.freeze([
  'id',
  'say',
  'check',
  'requires',
  ...OPTION_VERDICTS,
]);
/** Every key an approach reads — `approachKeys` in `dungeonspec/spec.go`. */
const APPROACH_KEYS: readonly string[] = Object.freeze([
  'ability',
  'tool',
  'dc',
]);

// THE ENGINE'S SENTENCES, word for word (`dungeonspec/grammar.go`, the
// `errOption*` constants and `grammar.options`/`optionRequires`/`approaches`).
// The studio says what the engine will say, so an author who meets one twice —
// once on the form, once from the server — reads one problem, not two.

/** `errOptionNoID`. */
export const OPTION_NO_ID_REFUSAL = 'the option has no id';
/** `errOptionNoSay`. */
export const OPTION_NO_SAY_REFUSAL =
  'the option does not say what the character says';
/** `errOptionNoCheck`. */
export const OPTION_NO_CHECK_REFUSAL =
  'this option needs at least one way to make its check — an ability and a DC';
/** `errOptionPropFlees`. */
export const OPTION_PROP_FLEES_REFUSAL =
  "a prop cannot run: `flee` is a creature's answer";
/** `grammar.options`: an id already used on this binding. */
export function optionDuplicateRefusal(id: string, previous: number): string {
  return `option "${id}" is already declared at options[${previous}]`;
}
/** `grammar.options`: a verdict written and left empty. */
export function optionEmptyVerdictRefusal(verdict: string): string {
  return `\`${verdict}\` lists nothing — omit it, or write what is answered`;
}
/** `grammar.optionRequires`: a predicate form that is not fact or holds. */
export function optionRequiresFormRefusal(form: string): string {
  return `an option requires { fact: <id> } or { holds: <prop id> }, and \`${form}\` is neither`;
}
/** `grammar.optionRequires`: a holding of a prop the room does not place. */
export function optionHoldsNotAPropRefusal(id: string): string {
  return `"${id}" is not a prop in this dungeon, so nobody can hold it`;
}
/** `grammar.optionRequires`: a holding of a prop nobody can pick up. */
export function optionHoldsNotHoldableRefusal(id: string): string {
  return `"${id}" is a prop nobody can pick up, so nobody can hold it`;
}
/** `grammar.approaches`: an approach that rolls nothing. */
export const APPROACH_NO_ABILITY_REFUSAL =
  'the approach does not say which ability it rolls';
/** `grammar.approaches`: an approach with nothing to beat. */
export function approachDcRefusal(dc: number): string {
  return `an approach with dc ${dc} has nothing to beat`;
}

/** The predicate forms a `requires` may NOT take but the shared predicate
 * grammar names — refused with `optionRequiresFormRefusal` by name, because
 * the author wrote a real predicate in the wrong place. */
const OTHER_PREDICATE_FORMS: readonly string[] = Object.freeze([
  'round',
  'down',
  'stance',
]);

/**
 * A binding's `options:` — a creature's (`isProp` false) or a prop's.
 *
 * WHAT IT JUDGES is everything one option can say about itself, in the
 * engine's order and words: the id, the line, the check, the `requires` form,
 * and each verdict's rows by the table's own grammar under the verdict's key.
 *
 * WHAT IT DOES NOT JUDGE is whether a `holds` names a prop somebody can pick
 * up: that needs the room's props, which this reader does not have.
 * [optionHoldsRefusal] answers it where the room is in hand.
 */
export function validateOptions(
  value: unknown,
  path: string,
  isProp: boolean
): OptionShape[] {
  if (!Array.isArray(value)) fail(path, 'expected a list of options');
  if (value.length === 0) fail(path, 'is empty; omit the key instead');
  const seen = new Map<string, number>();
  return value.map((raw, index) => {
    const at = `${path}[${index}]`;
    if (!isMapping(raw))
      fail(
        at,
        'an option is { id, say, check } plus what it requires and answers'
      );
    for (const key of Object.keys(raw)) {
      if (!OPTION_KEYS.includes(key))
        fail(at, `field ${key} not found in type dungeonspec.OptionSpec`);
    }

    if (raw.id !== undefined && raw.id !== null && typeof raw.id !== 'string')
      fail(`${at}.id`, 'expected a string');
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (id === '') fail(`${at}.id`, OPTION_NO_ID_REFUSAL);
    const previous = seen.get(id);
    if (previous !== undefined)
      fail(`${at}.id`, optionDuplicateRefusal(id, previous));
    seen.set(id, index);

    if (
      raw.say !== undefined &&
      raw.say !== null &&
      typeof raw.say !== 'string'
    )
      fail(`${at}.say`, 'expected a string');
    const say = typeof raw.say === 'string' ? raw.say : '';
    if (say === '') fail(`${at}.say`, OPTION_NO_SAY_REFUSAL);

    const option: OptionShape = {
      id,
      say,
      check: validateApproaches(raw.check, `${at}.check`),
    };

    if (raw.requires !== undefined && raw.requires !== null)
      option.requires = validateOptionRequires(raw.requires, `${at}.requires`);

    for (const verdict of OPTION_VERDICTS) {
      const rows = raw[verdict];
      if (rows === undefined || rows === null) continue;
      const verdictAt = `${at}.${verdict}`;
      if (!Array.isArray(rows)) fail(verdictAt, 'expected a list of entries');
      if (rows.length === 0)
        fail(verdictAt, optionEmptyVerdictRefusal(verdict));
      option[verdict] = heaviestFirst(
        rows.map((row, rowIndex) => {
          const rowAt = `${verdictAt}[${rowIndex}]`;
          const entry = validateAnswerEntry(row, rowAt, verdict);
          if (isProp && entry.flee !== undefined)
            fail(`${rowAt}.flee`, OPTION_PROP_FLEES_REFUSAL);
          return entry;
        })
      );
    }
    return option;
  });
}

/** An option's check: at least one approach, each rolling something against
 * something (`grammar.approaches`, the lock's own grammar). */
function validateApproaches(
  value: unknown,
  path: string
): AnswerApproachShape[] {
  if (value === undefined || value === null)
    fail(path, OPTION_NO_CHECK_REFUSAL);
  if (!Array.isArray(value)) fail(path, 'expected a list of approaches');
  if (value.length === 0) fail(path, OPTION_NO_CHECK_REFUSAL);
  return value.map((raw, index) => {
    const at = `${path}[${index}]`;
    if (!isMapping(raw)) fail(at, 'an approach is { ability, dc, tool }');
    for (const key of Object.keys(raw)) {
      if (!APPROACH_KEYS.includes(key))
        fail(at, `field ${key} not found in type dungeonspec.ApproachSpec`);
    }
    if (
      raw.ability !== undefined &&
      raw.ability !== null &&
      typeof raw.ability !== 'string'
    )
      fail(`${at}.ability`, 'expected a string');
    const ability = typeof raw.ability === 'string' ? raw.ability : '';
    if (ability === '') fail(`${at}.ability`, APPROACH_NO_ABILITY_REFUSAL);
    const rawDc = raw.dc ?? 0;
    if (typeof rawDc !== 'number' || !Number.isInteger(rawDc))
      fail(`${at}.dc`, 'expected a whole number');
    if (rawDc < 1) fail(`${at}.dc`, approachDcRefusal(rawDc));
    const approach: AnswerApproachShape = { ability, dc: rawDc };
    if (raw.tool !== undefined && raw.tool !== null && raw.tool !== '') {
      if (typeof raw.tool !== 'string') fail(`${at}.tool`, 'expected a string');
      approach.tool = raw.tool;
    }
    return approach;
  });
}

/** `requires`: exactly `{ fact: <id> }` or `{ holds: <prop id> }`. A real
 * predicate of another form is refused BY NAME with the engine's sentence,
 * since the author wrote something meaningful in the wrong place. */
function validateOptionRequires(
  value: unknown,
  path: string
): OptionRequiresShape {
  const shape = 'an option requires { fact: <id> } or { holds: <prop id> }';
  if (!isMapping(value) || Object.keys(value).length !== 1) fail(path, shape);
  const form = Object.keys(value)[0];
  if (OTHER_PREDICATE_FORMS.includes(form))
    fail(path, optionRequiresFormRefusal(form));
  if (form !== 'fact' && form !== 'holds') fail(path, shape);
  const id = value[form];
  if (typeof id !== 'string' || id === '')
    fail(`${path}.${form}`, 'must name an id');
  return form === 'fact' ? { fact: id } : { holds: id };
}

/** Whether a `requires: { holds }` names a prop somebody can pick up, against
 * the room's props — id to holdable, exactly the universe the engine builds
 * (`roomProps`: every `propDeclarations` id, holdable when its binding says
 * so). Answers the engine's sentence, or undefined when the holding is legal. */
export function optionHoldsRefusal(
  holds: string,
  props: ReadonlyMap<string, boolean>
): string | undefined {
  const holdable = props.get(holds);
  if (holdable === undefined) return optionHoldsNotAPropRefusal(holds);
  if (!holdable) return optionHoldsNotHoldableRefusal(holds);
  return undefined;
}
