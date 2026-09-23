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
 * THE `at:` CELL IS CARRIED AS WRITTEN — `[col, row]`, the file's spelling.
 * The engine resolves an offset pair under the document's `orientation`, which
 * the single-room dialect does not carry; converting here would invent a frame
 * the file does not state. Shape only: validate the pair, carry it, and let
 * the frame question be answered where the document is compiled.
 */

import {
  ACTOR_WITHOUT_DEED_REFUSAL,
  ANSWER_AT_SELECTOR,
  ANSWER_ENTRY_RULES,
  ANSWER_SELECTOR_WORDS,
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
  isSelectorWord,
  MISSING_AT_REFUSAL,
  missingSpanRefusal,
  noneWordBodyRefusal,
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
} from '@/author/answerVocabulary';

/** A selector as written: one of the sealed words, or `{ at: [col, row] }`. */
export type AnswerSelectorShape = string | { at: [number, number] };

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

export type AnswerWhenShape =
  | { enemy: string }
  | { attacked: AnswerWhenDeed }
  | { intimidated: AnswerWhenDeed }
  | { persuaded: AnswerWhenDeed }
  | { fled: AnswerWhenDeed };

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
    table[trigger] = rawEntries.map((entry, index) =>
      validateAnswerEntry(entry, `${path}.${trigger}[${index}]`, trigger)
    );
  }
  return table;
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
    const meant = suggestKey(key, ENTRY_KEYS);
    fail(
      path,
      `unknown key "${key}"${meant ? ` — did you mean "${meant}"?` : ''}`
    );
  }

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
    entry.when = validateAnswerWhen(value.when, `${path}.when`);

  // --- the engine's own rules, in `answerEntry`'s order ---

  // An empty `fact:` is its own sentence rather than a missing word: the
  // author wrote the key, so they meant to teach something.
  if (words.includes('fact') && value.fact === '')
    fail(`${path}.fact`, EMPTY_FACT_REFUSAL);

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
      const selector = validateAnswerSelector(raw, `${path}.${word}`);
      if (word === 'attack') entry.attack = selector;
      else if (word === 'toward') entry.toward = selector;
      else if (word === 'away') entry.away = selector;
    } else {
      // `value: 'none'` — the engine's `FleeSpec`/`HoldSpec` are structs, so a
      // scalar or a sequence is refused; a MAPPING IS ACCEPTED, because the
      // custom unmarshaler means `KnownFields` never reaches inside it.
      if (!isMapping(raw)) fail(`${path}.${word}`, noneWordBodyRefusal(word));
      if (word === 'flee') entry.flee = raw;
      else if (word === 'hold') entry.hold = raw;
    }
  }

  // `at:` is legal on one word; `actor` needs a deed to have been the actor
  // of. The word is READ from the declaration rather than restated.
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
    if (typeof selector !== 'string') {
      if (word !== ANSWER_AT_SELECTOR.onlyWord)
        fail(`${path}.${word}`, atSelectorRefusal(word));
      continue;
    }
    const deedNamed =
      entry.when !== undefined &&
      Object.keys(entry.when).some((key) => ANSWER_WHEN.deeds.includes(key));
    if (selector === 'actor' && !deedNamed)
      fail(`${path}.${word}`, ACTOR_WITHOUT_DEED_REFUSAL);
  }

  return entry;
}

/** A `when:` — EXACTLY ONE of the four exclusive enemy bands, or one of the
 * four deeds with `{ within: N }` and an optional SCOPE
 * (`dungeonspec.WhenSpec`).
 *
 * THE REFUSALS RUN IN THE ENGINE'S OWN ORDER (`WhenSpec.UnmarshalYAML`), so an
 * author who made one mistake gets one sentence: the shape, then two
 * conditions, then the enemy band or the deed, then an unknown BODY key by
 * hand, then the span, then the scope.
 *
 * UNKNOWN BODY KEYS ARE REFUSED BY HAND because `Decode`'s strictness does not
 * reach inside a custom unmarshaler (rpg-toolkit#1890 thread 3). Before scopes
 * a dropped key in this body did nothing; now the dropped key decides WHOSE
 * deeds the row reads — `no: ally` would leave the condition on the self
 * reading, firing for the wrong wound and never for its own. So a body key
 * this build does not read is refused rather than dropped. */
function validateAnswerWhen(value: unknown, path: string): AnswerWhenShape {
  if (!isMapping(value) || Object.keys(value).length === 0)
    fail(path, whenShapeRefusal());
  const keys = Object.keys(value);
  if (keys.length > 1) fail(path, whenIsOneConditionRefusal(keys.length));
  const key = keys[0];

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
  return { [key]: { within, ...scope } } as AnswerWhenShape;
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

  // The engine tests presence, not truth, and reads the value as its text —
  // `scopeOf` compares against the sealed word, so a non-scalar reaches it as
  // whatever Go's decode makes of it. Mirroring that: a non-string is simply
  // not the sealed word, and is refused by the unknown-word sentence.
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

/** One selector: a sealed word, or `{ at: [col, row] }`. */
function validateAnswerSelector(
  value: unknown,
  path: string
): AnswerSelectorShape {
  if (typeof value === 'string') {
    if (!isSelectorWord(value)) fail(path, unknownSelectorRefusal(value));
    return value;
  }
  if (isMapping(value)) {
    for (const key of Object.keys(value)) {
      if (key !== 'at') fail(path, unknownSelectorKeyRefusal(key));
    }
    if (value.at === undefined || value.at === null)
      fail(path, MISSING_AT_REFUSAL);
    return { at: validateAtCell(value.at, `${path}.at`) };
  }
  fail(
    path,
    `a selector is one of ${ANSWER_SELECTOR_WORDS.map((s) => s.key).join(
      ', '
    )}, or { at: [col, row] }`
  );
}

/** The authored cell of an `at:` selector — `[col, row]`, carried as written. */
function validateAtCell(value: unknown, path: string): [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isInteger(value[0]) ||
    !Number.isInteger(value[1])
  )
    fail(path, 'expected [col,row]');
  return [value[0] as number, value[1] as number];
}
