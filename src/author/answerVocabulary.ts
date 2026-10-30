/**
 * The answer table's sealed vocabulary — ONE declaration, three jobs.
 *
 * The engine owns this vocabulary, not this module: `dungeonspec`'s
 * `AnswerSpec.UnmarshalYAML` allowlists the entry keys and refuses the rest
 * by name, `encounter.TableKeys` seals the triggers, and
 * `dungeonspec/validate.go`'s `placeOn` enforces the entry rules. Everything
 * here is a transcription of that contract so the builder can read it without
 * re-deriving it, and so there is exactly one place to edit when the
 * engine's vocabulary grows one word per use case.
 *
 * WHAT THIS BUYS (rpg-dnd5e-web#1118, extended by #1137). Before #1118 the
 * parser's allowlist was the UI's subset rather than the spec's vocabulary, so
 * a file carrying `on:`, `intimidate:`, `persuade:` or `actions:` was refused
 * as an unknown key — the front room would not open at all. #1118 declared the
 * four social triggers and the two social words; the creature's table wave
 * (rpg-project#466, `rulebooks/dnd5e/encounter` v0.90.0) then SHIPPED a bigger
 * grammar while that PR was open. This module now carries the shipped grammar:
 * the fifth trigger `time`, the four `time`-only words, the word-to-trigger
 * applicability rule, the structured `when:`, the selectors, and `temper`.
 *
 * THE DECLARATION IS READ BY THE PARSER (what may appear), the PANELS (what
 * may be authored) and the REFUSALS (what the author probably meant). The
 * author-facing reference for the rows is
 * `rpg-project/docs/howto/author-a-creature.md`; when the engine and that page
 * disagree, the engine's `dungeonspec` is the tiebreak and the page is the
 * thing to fix.
 *
 * TWO DIMENSIONS, NOT ROWS. Two of the shipped facts cannot be expressed by a
 * flat word table and are modelled as their own dimensions:
 *
 *   1. a word is legal on SOME triggers — `fact`/`flee` answer a social
 *      verdict, `hold`/`attack`/`toward`/`away` are what a creature does with
 *      time — so `legalOn` is a field on every word. A picker built from this
 *      declaration therefore offers only the words the engine will take;
 *   2. `when:` is a structured condition (one enemy band, or one deed with a
 *      span) rather than one of the sealed flat words, so it has its own shape
 *      ([ANSWER_WHEN]) and its own place in an entry.
 *
 * WHAT IT DOES NOT DO. It never decides which entry fires, never sums
 * weights, and never reads a `when`. Eligibility and the roll are the
 * engine's; the builder's job ends at a document that means what the author
 * said.
 */

/**
 * Which trigger keys a word — or a `when` — may be written under.
 *
 * THE ENGINE'S RULE IS ONE WHOLE GROUP OR THE OTHER, never a mix
 * (`dungeonspec/validate.go` `wordLegality`): `fact` and `flee` answer a
 * social verdict, and the four action words are what a creature does with
 * time. It is modelled as a named group here rather than a per-trigger list so
 * a word can never drift into a shape the engine does not have — the two
 * groups move together by construction.
 */
export const ANSWER_APPLICABILITY = ['social', 'time'] as const;
export type AnswerApplicability = (typeof ANSWER_APPLICABILITY)[number];

/** One word of the outcome vocabulary. `value` is the shape of what the
 * word carries beside it: `fact` carries an opaque id, `flee`/`hold` are
 * written `{}` and carry nothing, `attack`/`toward`/`away` carry a
 * selector, and `search` carries `{ distance }` ([ANSWER_SEARCH]). */
export interface AnswerWordSpec {
  /** Imperative wording for the sentence editor: “do [Attack]”. */
  readonly commandLabel: string;
  readonly key: string;
  readonly label: string;
  readonly help: string;
  readonly value: 'none' | 'string' | 'selector' | 'search';
  /** The trigger groups this word is legal on — `AnswerSpec`'s
   * `wordLegality`. A word written under a group it is not in is refused with
   * the engine's own sentence ([answerWordRefusal]).
   *
   * A LIST, because one word now sits in both (rpg-project#569 R6): `fact` on
   * a `time` row is how a creature raises an alarm — "a loud fact" — so the
   * groups are no longer one-or-the-other for every word. */
  readonly legalOn: readonly AnswerApplicability[];
}

/** The entry words the engine accepts today, in the order the panels offer
 * them. `dungeonspec.AnswerSpec.UnmarshalYAML` allowlists exactly these;
 * `laterWords` refuses `alarm`, `lure`, `pretend`, `tell` and `patrol` by
 * name, each pointing at the slice that owns it — so a word appears HERE only
 * once the engine accepts it.
 *
 * THE ORDER IS THE AUTHOR-FACING REFERENCE'S OWN (`author-a-creature.md`,
 * "One word, or none"): the two social words first, then the four time
 * words, `hold` before the movement words. */
export const ANSWER_WORDS: readonly AnswerWordSpec[] = Object.freeze([
  {
    key: 'fact',
    label: 'Teaches a fact',
    commandLabel: 'Teach a fact',
    help: 'Witnesses learn this fact — and, on a `time` row, whoever hears the creature say it. An id and nothing else — a fact carries no truth bit, so a lie looks exactly like the truth.',
    value: 'string',
    // R6 (rpg-project#569): an alarm is a loud fact, legal on `time` too.
    legalOn: ['social', 'time'],
  },
  {
    key: 'flee',
    label: 'Bolts',
    commandLabel: 'Bolt',
    help: 'The creature holds `fled` against whoever spoke to it. It does NOT step here: it lands the memory, and its own `time` table does the running.',
    value: 'none',
    legalOn: ['social'],
  },
  {
    key: 'hold',
    label: 'Holds',
    commandLabel: 'Hold',
    help: 'The creature does nothing with its time. An unconditional `hold` competes on every roll, so it usually wants a `when`.',
    value: 'none',
    legalOn: ['time'],
  },
  {
    key: 'attack',
    label: 'Attacks',
    commandLabel: 'Attack',
    help: 'Strikes the selected creature. A swing at somebody out of reach is a wasted turn — this belongs under `{ enemy: reach }`.',
    value: 'selector',
    legalOn: ['time'],
  },
  {
    key: 'toward',
    label: 'Walks toward',
    commandLabel: 'Walk toward',
    help: 'Walks toward the selected creature, onto an authored cell, along an authored route, or to where it last heard something. The only word `{ at }` and `{ path }` are legal on.',
    value: 'selector',
    legalOn: ['time'],
  },
  {
    // rpg-project#671 R17: a run at the target that spends the turn on it.
    // `toward`'s selectors (a cell and a route among them), and `toward`'s
    // temperament factor.
    key: 'dash',
    label: 'Dashes toward',
    commandLabel: 'Dash toward',
    help: 'Runs at the selected creature, onto an authored cell or along an authored route, spending the turn on the run: no swing that turn. A dash at a foe already in reach is never picked; the dasher reads `{ enemy: dash }`.',
    value: 'selector',
    legalOn: ['time'],
  },
  {
    key: 'away',
    label: 'Walks away',
    commandLabel: 'Walk away',
    help: 'Walks away from the selected creature — or from the freshest sound it heard — for the turn: the coward’s run. Never from a cell.',
    value: 'selector',
    legalOn: ['time'],
  },
  {
    // rpg-project#668 R4: `encounter`'s `search`, eligible only under
    // `enemy: lost`.
    key: 'search',
    label: 'Searches',
    commandLabel: 'Search',
    help: 'Walks on from where it lost its enemy for `distance` cells (6 when omitted), along `heading` — went (the way the enemy was seen going, the default), faced (the way it faced), left or right (a quarter turn off went) — then gives up, and its `enemy: none` rows take it home.',
    value: 'search',
    legalOn: ['time'],
  },
]);

/** `search: { distance, heading }` (rpg-project#668 R4, rpg-project#679
 * R10) — `dungeonspec.SearchSpec`. `distance` is cells, counted from 1;
 * omitted is the engine's six. `heading` is one of the sealed four — `went`
 * (the way the quarry was seen going), `faced`, `left`, `right` — and omitted
 * is the engine's `went`. The body reads those two keys and nothing else,
 * refused by name. */
export const ANSWER_SEARCH = Object.freeze({
  bodyKeys: Object.freeze(['distance', 'heading']),
  defaultDistance: 6,
  minimumDistance: 1,
  headings: Object.freeze(['went', 'faced', 'left', 'right'] as const),
  defaultHeading: 'went' as const,
});

/** One of the sealed search headings (mind/behavior `SearchHeading`). */
export type SearchHeading = (typeof ANSWER_SEARCH.headings)[number];

/** Whether a value is one of the sealed search headings. */
export function isSearchHeading(value: unknown): value is SearchHeading {
  return (
    typeof value === 'string' &&
    (ANSWER_SEARCH.headings as readonly string[]).includes(value)
  );
}

/** `dungeonspec`'s refusal for a search that walks nowhere — mind/behavior's
 * own sentence. */
export function searchDistanceRefusal(distance: number): string {
  return `\`search\` distance ${distance}: a search walks at least one cell`;
}

/** `dungeonspec`'s refusal for a heading outside the sealed four —
 * mind/behavior's own sentence (Go's %q quotes the word). */
export function searchHeadingRefusal(heading: unknown): string {
  return `\`search\` heading ${JSON.stringify(String(heading))}: a search follows went, faced, left or right`;
}

/** `dungeonspec`'s refusal for a key `search` does not read. */
export function searchKeyRefusal(key: string): string {
  return `"${key}" is not a key \`search\` reads: it reads distance and heading`;
}

/** `dungeonspec`'s refusal for a `search` that is not a mapping. */
export const SEARCH_SHAPE_REFUSAL = `\`search\` is { distance: N, heading: went }, or {} for ${ANSWER_SEARCH.defaultDistance} cells the way they went`;

/** One trigger: the verb and its verdict, or `time`. Every social key is
 * `<verb>` or `<verb>_failed`, so the next social verb adds keys rather than
 * fields. */
export interface AnswerTriggerSpec {
  readonly key: string;
  readonly label: string;
  readonly help: string;
  /** Which words this trigger takes — the trigger's half of the
   * word-to-trigger applicability dimension. */
  readonly applicability: AnswerApplicability;
}

/** Sealed to `encounter.TableKeys`, which is `time` alone since
 * rpg-toolkit#2039: the four social keys retired to OPTIONS (rpg-project#569
 * R2), where a line carries its own check and what is answered on either
 * verdict ([ANSWER_VERDICTS]). They are refused by name
 * ([RETIRED_TRIGGER_KEYS]), not offered.
 *
 * `time` FIRES WITHOUT ANYBODY TALKING TO IT — the creature's turn in a
 * fight, or a round of the world clock — which is why it is the one trigger
 * the four action words are legal on. */
export const ANSWER_TRIGGERS: readonly AnswerTriggerSpec[] = Object.freeze([
  {
    key: 'time',
    label: 'Has time',
    help: 'The creature’s turn in a fight, or a round of the world clock — the one trigger that fires without anybody talking to it.',
    applicability: 'time',
  },
]);

/** The four social table keys that retired to options (rpg-project#569 R2) —
 * `encounter.RetiredTableKeys`. A table carrying one is refused BY NAME with
 * the engine's sentence ([retiredTriggerRefusal]) rather than as an unknown
 * trigger: the author wrote something this build once understood. The deeds
 * of the same names (`when: { intimidated }`) are NOT retired — a beaten
 * Intimidation line still lands the deed. */
export const RETIRED_TRIGGER_KEYS: readonly string[] = Object.freeze([
  'intimidated',
  'intimidate_failed',
  'persuaded',
  'persuade_failed',
]);

/** `dungeonspec`'s `retiredTableKey`: where a retired social key went. */
export function retiredTriggerRefusal(key: string): string {
  return `\`${key}\` is no longer a table key: author an option`;
}

/** The two VERDICTS an option answers on (rpg-project#569 R2) — `success`
 * when the speaker's check was beaten, `failure` when it was missed.
 *
 * THEY ARE NOT TRIGGERS, and that is why they are their own list. A trigger is
 * a key of an `on:` table; a verdict is a key of ONE OPTION (`OptionSpec`'s
 * `success:`/`failure:`), and `on: { success: … }` is refused as the unknown
 * trigger it is. What they share with the social triggers is the applicability
 * group: the engine judges an option row with the table's own `answerEntry`
 * under the verdict's key (`grammar.options`), so `fact`, `flee` and a line are
 * legal there, a time word and a `when` are not, and the sentences name the
 * verdict — "`attack` is what a creature does with time, and `success` is an
 * outcome". */
export const ANSWER_VERDICTS: readonly AnswerTriggerSpec[] = Object.freeze([
  {
    key: 'success',
    label: 'The check was beaten',
    help: 'What it answers when the line landed.',
    applicability: 'social',
  },
  {
    key: 'failure',
    label: 'The check was missed',
    help: 'What it answers when the line did not land — the half that makes trying worse than not trying.',
    applicability: 'social',
  },
]);

export const ANSWER_WORD_KEYS: readonly string[] = Object.freeze(
  ANSWER_WORDS.map((w) => w.key)
);
export const ANSWER_TRIGGER_KEYS: readonly string[] = Object.freeze(
  ANSWER_TRIGGERS.map((t) => t.key)
);

/**
 * The `when:` shape — a structured condition, NOT one of the sealed flat
 * words (`dungeonspec.WhenSpec`).
 *
 * EXACTLY ONE of an enemy band or a deed with a span. Two keys in one `when`
 * is refused rather than read as `and`: an author who wrote two meant
 * something, and guessing which of two readings they meant is exactly what a
 * small vocabulary exists to avoid.
 *
 * `when` IS A `time` WORD (`AnswerSpec.When`'s own law): a social key IS the
 * condition — `intimidated` already means "the threat landed" — so a second
 * one under it would be an author asking when a thing that just happened
 * happened.
 */
export interface AnswerWhenSpec {
  /** Which triggers a `when` may appear under — always `time`. */
  readonly legalOn: AnswerApplicability;
  /** Every value `enemy:` takes, in the engine's own order
   * (`behavior.EnemyWords`): the five exclusive bands nearest first, then the
   * three move words (rpg-project#671) — what this turn's movement buys
   * against the foe `enemy` names. */
  readonly enemyBands: readonly string[];
  /** `threat: none | walk | dash` (rpg-project#671 R18): who ELSE could reach
   * the cell this row's move lands on and swing next turn. */
  readonly threatKey: 'threat';
  /** `behavior.ThreatWords`, in the engine's order. */
  readonly threatWords: readonly string[];
  /** The five deeds a `when` may read, in the engine's past tense
   * (`behavior.WhenDeeds`). */
  readonly deeds: readonly string[];
  /** The deeds whose condition may name WHO it was done to, with `who`
   * (`behavior.WhoDeeds`, rpg-project#716): `fell` alone. */
  readonly whoDeeds: readonly string[];
  /** A span is counted from 1 (`WhenSpec.Within`): `{ within: 0 }` is a
   * condition that can never hold. */
  readonly minimumWithin: number;
  /** The four keys a deed condition's body may carry, sealed so the reader
   * and the writer cannot drift apart (`dungeonspec`'s `whenBodyWithin`,
   * `whenBodyOn`, `whenBodyAs`, `whenBodyWho`). */
  readonly bodyKeys: readonly string[];
  /** WHOSE deed a condition is about — the two NAMED readings, in the
   * engine's order (`encounter.DeedScopes` minus `ScopeSelf`). */
  readonly scopes: readonly AnswerScopeSpec[];
  /** `heard: { kind, within }` — a sound of that kind the creature holds, no
   * older than the span (rpg-project#569 H2). A kind and a span, NEVER a
   * maker: a sound names nobody (R4). The span is the deed's, counted from 1. */
  readonly heardKey: 'heard';
  /** The two keys a `heard` body carries, sealed like the deed body's. */
  readonly heardBodyKeys: readonly string[];
  /** `fact: <id>` — the creature holds that world fact (R6). */
  readonly factKey: 'fact';
  /** `not: { <condition> }` — holds when the ONE condition inside does not
   * (R8). It wraps a condition, never a list: a negated `and` is an `or` the
   * grammar has not paid for. */
  readonly notKey: 'not';
}

/** One scope: the spelling a `when` body carries, and the words the form
 * shows for it. `on:` reads a deed against the creature's own side; `as:`
 * reads one the creature did (`WhenSpec.Scope`). */
export interface AnswerScopeSpec {
  /** The key the body carries — `on` or `as`. */
  readonly key: string;
  /** The value that key takes — `ally` or `actor`. */
  readonly value: string;
  /** What the form calls it, since the file says `on: ally` and an author
   * reading the row wants the sentence. */
  readonly label: string;
}

export const ANSWER_WHEN: AnswerWhenSpec = Object.freeze({
  legalOn: 'time',
  // `lost` (rpg-project#668 R3): went to the remembered cell, found nobody.
  enemyBands: Object.freeze([
    'reach',
    'seen',
    'remembered',
    'lost',
    'none',
    // rpg-project#671: walk puts me in reach, only a dash does, or not even
    // a dash. The host computes them; no number is written here.
    'walk',
    'dash',
    'far',
  ]),
  threatKey: 'threat',
  threatWords: Object.freeze(['none', 'walk', 'dash']),
  // `fell` (rpg-project#716): a fall, its actor who caused it, its target
  // who fell.
  deeds: Object.freeze([
    'attacked',
    'intimidated',
    'persuaded',
    'fled',
    'fell',
  ]),
  whoDeeds: Object.freeze(['fell']),
  minimumWithin: 1,
  bodyKeys: Object.freeze(['within', 'on', 'as', 'who']),
  // THE TWO NAMED SCOPES. Omitting both means the creature itself, which is
  // what the field being absent says — so `self` is deliberately NOT a third
  // word a document may write, and a refusal lists only these two.
  scopes: Object.freeze([
    Object.freeze({ key: 'on', value: 'ally', label: 'an ally was' }),
    Object.freeze({ key: 'as', value: 'actor', label: 'I did it' }),
  ]),
  heardKey: 'heard',
  heardBodyKeys: Object.freeze(['kind', 'within']),
  factKey: 'fact',
  notKey: 'not',
});

/**
 * THE SOUND KINDS — a sealed RULEBOOK vocabulary (rpg-project#569 R4), the
 * words a `heard` condition listens for and a `Heard` beat carries. The
 * encounter decides which deed makes which (an attack landing `clang`, a
 * forced door `crash`, a damaging cast `boom`, every `say` `voice`); the
 * studio offers these four and nothing else.
 *
 * ONE PER USE CASE, like every vocabulary here: a fifth kind arrives when a
 * use case brings the deed that makes it, and is added here, once.
 */
export const ANSWER_SOUND_KINDS: readonly string[] = Object.freeze([
  // `encounter.SoundKinds`, in the engine's own order.
  'boom',
  'crash',
  'clang',
  'voice',
]);

/** One selector word: what an `attack`/`toward`/`dash`/`away` entry acts on
 * (`encounter.SelectorWords`). */
export interface AnswerSelectorSpec {
  readonly key: string;
  readonly label: string;
  readonly help: string;
  /** Table words this selector may NOT be written on although they take a
   * selector — `sound` on `attack` (R10: a sound cannot be struck). Absent is
   * every selector word. */
  readonly refusedOn?: readonly string[];
}

/** The sealed selector words, in the engine's order (`behavior.SelectorWords`).
 * A scalar selector is one of these; the other spellings are a cell
 * ([ANSWER_AT_SELECTOR]) and a route ([ANSWER_PATH_SELECTOR]). */
export const ANSWER_SELECTOR_WORDS: readonly AnswerSelectorSpec[] =
  Object.freeze([
    {
      key: 'enemy',
      label: 'The enemy',
      help: 'The nearest creature it is opposed to and can see, else the nearest one it remembers.',
    },
    {
      key: 'attacker',
      label: 'Whoever hit it',
      help: 'Whoever last landed an attack on it.',
    },
    {
      key: 'actor',
      label: 'Whoever did it',
      help: 'Whoever did the deed this entry’s `when` names. Legal only when the entry names a deed.',
    },
    {
      // R10 (rpg-project#569): a heard report names no enemy (R4), so
      // `toward: enemy` cannot walk a guard to a clang; this does.
      key: 'sound',
      label: 'The freshest sound',
      help: 'Where the freshest sound it holds was made — a place, never a figure. Walked toward or away from; never attacked.',
      refusedOn: Object.freeze(['attack']),
    },
    {
      // rpg-project#717: the nearest allied member held in sight, else in
      // memory. "Follow" is `{ when: { enemy: none }, toward: ally }`.
      key: 'ally',
      label: 'The nearest ally',
      help: 'The nearest creature on a side its own faction is allied with, in sight, else remembered. Walked toward or away from; never attacked.',
      refusedOn: Object.freeze(['attack']),
    },
  ]);

/** Whether a selector word may be written on a table word — every word but
 * the ones its declaration refuses (`sound` on `attack`). */
export function selectorWordLegalOn(selector: string, word: string): boolean {
  const spec = ANSWER_SELECTOR_WORDS.find((s) => s.key === selector);
  return spec !== undefined && !(spec.refusedOn ?? []).includes(word);
}

/** The authored-cell selector — `{ at: [col, row] }` in a v2 document,
 * `{ at: { q, r } }` in a single room (rpg-toolkit#2063).
 *
 * ONLY A WORD THAT WALKS TO A PLACE TAKES `at:` (`grammar.walksTo`): `toward`
 * and `dash` (rpg-project#671 R17). Walking away from a fixed cell is a
 * direction rather than a flight, and nothing has paid for one. An authored
 * cell is walked ONTO, not up to. */
export const ANSWER_AT_SELECTOR = Object.freeze({
  key: 'at',
  label: 'An authored cell',
  help: 'A cell to walk onto. Pick a cell nothing stands on — a creature anchor is stood beside.',
  /** The words this selector spelling is legal on: the words that walk to a
   * place (`grammar.walksTo`) — `toward`, and `dash`, a run toward
   * (rpg-project#671 R17). */
  words: Object.freeze(['toward', 'dash']),
});

/** The authored-route selector — `{ path: [[col, row], …] }` in a v2
 * document, `{ path: [{ q, r }, …] }` in a single room — a patrol
 * (rpg-project#569 R7).
 *
 * THE ROUTE HOLDS NO STATE. Which waypoint is next is derived by the engine
 * from where the creature stands each time the row fires, so nothing the
 * builder writes says how far along it got. `toward` and `dash` walk a route;
 * the old word `patrol` stays refused and points here. */
export const ANSWER_PATH_SELECTOR = Object.freeze({
  key: 'path',
  label: 'A route',
  help: 'Cells walked in order, looping. The next waypoint is worked out from where the creature stands.',
  /** The words a route is legal on — `Selector.validate`'s `toward` and
   * `dash`. */
  words: Object.freeze(['toward', 'dash']),
});

/** Whether a table word walks to a place, so it takes a cell or a route
 * (`grammar.walksTo`): `toward`, and `dash`. */
export function walksTo(word: string): boolean {
  return ANSWER_AT_SELECTOR.words.includes(word);
}

/**
 * `temper:` — a temperament, which is multipliers on a table's words and
 * nothing else (`encounter.TemperSpec`).
 *
 * A WORD ON A PLACEMENT, A WORD OR A MIX ON A FACTION. A placement names ONE
 * creature, so dealing a spread for it would be an author rolling for a
 * goblin they have already described; a faction is several creatures, and its
 * mix is dealt once per member as it enters the world.
 *
 * THE WORDS ARE THE ENGINE'S OWN ORDER (`TemperWords = soldier, coward,
 * aggressive`), which is also the order the reference page's table uses. */
export const ANSWER_TEMPER_WORDS: readonly string[] = Object.freeze([
  'soldier',
  'coward',
  'aggressive',
]);

export interface AnswerTemperSpec {
  readonly words: readonly string[];
  /** A share below 1 is a temperament that can never be dealt. */
  readonly minimumShare: number;
  /** A placement names one creature: a word. */
  readonly placementShape: 'word';
  /** A faction is several: a word, or a mix to deal one per member. */
  readonly factionShape: 'word-or-mix';
}

export const ANSWER_TEMPER: AnswerTemperSpec = Object.freeze({
  words: ANSWER_TEMPER_WORDS,
  minimumShare: 1,
  placementShape: 'word',
  factionShape: 'word-or-mix',
});

/** The engine's entry rules (`dungeonspec` `answerEntry` / `placeOn`), in
 * one place so the parser and the panel refuse the same things. An entry does
 * AT MOST ONE thing: two words in one entry is an error rather than an
 * ordering the author has to guess.
 *
 * THERE IS NO `emptyMappingWords` HERE ON PURPOSE (review round 1). Which
 * words carry nothing is already spelled by `AnswerWordSpec.value === 'none'`,
 * and a second list beside it is two spellings of one fact in a module whose
 * contract is one declaration — the declaration's copy could drift from the
 * enforced one with no test failing, which is the failure mode this module
 * exists to prevent. */
export const ANSWER_ENTRY_RULES = Object.freeze({
  /** `weight` is a pointer upstream precisely so that omitted differs from
   * `0`: omitted IS 1, and anything below 1 is refused. An authored 1 is
   * therefore redundant but legal, and must round-trip as written. */
  minimumWeight: 1,
  /** An entry with no word must still say something, or it does nothing.
   * Read at the enforcement point, not restated there. */
  wordRequiredUnlessSaid: true,
  /** And an entry carries one word at most. */
  maximumWords: 1,
});

export function answerWord(key: string): AnswerWordSpec | undefined {
  return ANSWER_WORDS.find((w) => w.key === key);
}

export function answerTrigger(key: string): AnswerTriggerSpec | undefined {
  return ANSWER_TRIGGERS.find((t) => t.key === key);
}

/** What group a trigger — or an option's verdict ([ANSWER_VERDICTS]) —
 * belongs to, or undefined when it is neither. */
export function answerTriggerApplicability(
  trigger: string
): AnswerApplicability | undefined {
  return (
    answerTrigger(trigger) ?? ANSWER_VERDICTS.find((v) => v.key === trigger)
  )?.applicability;
}

/** Whether a word may be written under a trigger — the whole of the
 * word-to-trigger applicability rule, in one predicate a picker and the
 * parser both read. */
export function answerWordLegalOn(word: string, trigger: string): boolean {
  const spec = answerWord(word);
  const applicability = answerTriggerApplicability(trigger);
  if (!spec || applicability === undefined) return false;
  return spec.legalOn.includes(applicability);
}

/** The words a picker may offer for a trigger, and nothing else. A picker
 * that used [ANSWER_WORDS] wholesale would offer `flee` on `time`. */
export function answerWordsForTrigger(
  trigger: string
): readonly AnswerWordSpec[] {
  const applicability = answerTriggerApplicability(trigger);
  if (applicability === undefined) return [];
  return ANSWER_WORDS.filter((w) => w.legalOn.includes(applicability));
}

/** Whether `when` may appear under a trigger — `time` alone. */
export function answerWhenLegalOn(trigger: string): boolean {
  return ANSWER_WHEN.legalOn === answerTriggerApplicability(trigger);
}

/** Whether a selector word is one of the sealed three. */
export function isSelectorWord(word: string): boolean {
  return ANSWER_SELECTOR_WORDS.some((s) => s.key === word);
}

// ---------------------------------------------------------------------------
// The engine's own sentences
//
// A refusal a streamer meets twice — once here on load, once from the server —
// must read the same both times, or the two look like two different problems
// (`dungeonYaml.ts`'s law for `knows` and the deleted wall form). Each of
// these is `dungeonspec`'s sentence, word for word, minus the `(line N)` the
// validator appends — the parser resolves the line from the document and
// appends it.
// ---------------------------------------------------------------------------

/** `validate.go` `placeOn`: a key nobody designed. */
export function unknownTriggerRefusal(trigger: string): string {
  return `"${trigger}" is not a trigger this build rolls: they are ${ANSWER_TRIGGER_KEYS.join(
    ', '
  )}`;
}

/**
 * A body on a `none`-shaped word that is not a mapping. THIS ONE IS NOT THE
 * ENGINE'S SENTENCE, and the reason is worth stating rather than hiding.
 *
 * `FleeSpec`/`HoldSpec` are `struct{}`, so the Go decoder refuses a scalar or
 * a sequence with the YAML LIBRARY'S error, not a designed refusal:
 *
 *   flee: 5      → cannot unmarshal !!int `5` into dungeonspec.FleeSpec
 *   hold: [1]    → cannot unmarshal !!seq into dungeonspec.HoldSpec
 *
 * The web cannot reproduce that text faithfully: JavaScript's number model
 * cannot tell `5.0` from `5`, so the `!!int`/`!!float` tag the decoder prints
 * from the YAML source cannot be mirrored from the parsed value. Rather than
 * print a tag that is sometimes wrong, the web says the same thing in its own
 * words and refuses the same inputs.
 *
 * A MAPPING WITH KEYS IN IT IS ACCEPTED, because the engine accepts it: the
 * custom unmarshaler means `KnownFields` never reaches inside `FleeSpec`, so
 * `flee: { x: 1 }` decodes clean there too. Refusing it here would be the
 * harmful direction — the web refusing a file the server reads — which is the
 * exact failure this whole issue exists to undo.
 */
export function noneWordBodyRefusal(word: string): string {
  return `${word} takes a mapping — write \`${word}: {}\``;
}

/** `validate.go` `placeOn`: a trigger key with no entries at all. */
export const EMPTY_TRIGGER_REFUSAL =
  'this names a trigger and lists nothing that happens on it';

/** `validate.go` `answerEntry`: a row that can never fire. */
export function weightRefusal(weight: number): string {
  return `a weight of ${weight} can never be rolled: omit it for 1, or give it a share`;
}

/** `validate.go` `answerEntry`: a `fact:` that does not say what. */
export const EMPTY_FACT_REFUSAL =
  'this says the world learns something and does not say what';

/** `validate.go` `answerEntry`: two outcome words in one entry. */
export function entryDoesOneThingRefusal(words: readonly string[]): string {
  return `an entry does one thing: \`${words.join(
    '` and `'
  )}\` in the same entry is ${words.length}`;
}

/** `validate.go` `answerEntry`: a row written for no reason. */
export const EMPTY_ENTRY_REFUSAL = 'this entry does nothing and says nothing';

/**
 * `validate.go` `wordLegality`: a word under a key it is not legal on, or
 * undefined when the pair is legal.
 *
 * The engine has TWO sentences here and which one an author gets depends on
 * the direction of the mistake:
 *
 *   - a social word on `time` — "`fact` answers a social verdict, and `time`
 *     is not one";
 *   - an action word on a social key — "`attack` is what a creature does with
 *     time, and `intimidated` is an outcome".
 *
 * A picker built from [answerWordsForTrigger] never produces either; this is
 * for the file an author hand-edited, so the sentence has to be the one the
 * server would have said.
 */
export function answerWordRefusal(
  word: string,
  trigger: string
): string | undefined {
  if (answerWordLegalOn(word, trigger)) return undefined;
  const spec = answerWord(word);
  if (spec !== undefined && !spec.legalOn.includes('time')) {
    return `\`${word}\` answers a social verdict, and \`${trigger}\` is not one`;
  }
  return `\`${word}\` is what a creature does with time, and \`${trigger}\` is an outcome`;
}

/** `validate.go` `wordLegality`: a `when` under a social key, or undefined
 * when the trigger takes one. */
export function answerWhenRefusal(trigger: string): string | undefined {
  if (answerWhenLegalOn(trigger)) return undefined;
  return `\`${trigger}\` is already the condition — a \`when\` under it asks when a thing that just happened happened`;
}

/** `WhenSpec.UnmarshalYAML`: two conditions in one `when` entry. The list is
 * the `and` (rpg-project#569 R8), so the sentence names the fix. */
export function whenIsOneConditionRefusal(count: number): string {
  return HEARING_SENTENCES.whenNamesSeveral(count);
}

/** `WhenSpec.UnmarshalYAML`: the shape, for a `when` that is not a map at
 * all. */
export function whenShapeRefusal(): string {
  return HEARING_SENTENCES.whenShape();
}

/** `WhenSpec.UnmarshalYAML`: an `enemy:` value outside the eight words. */
export function unknownEnemyBandRefusal(band: string): string {
  return `\`enemy: ${band}\` is not a condition this build reads: they are ${ANSWER_WHEN.enemyBands.join(
    ', '
  )}`;
}

/** `WhenSpec.UnmarshalYAML`: a deed key this build does not hold. */
export function unknownDeedRefusal(deed: string): string {
  return `\`${deed}\` is not a deed this build holds: they are ${ANSWER_WHEN.deeds.join(
    ', '
  )} (and \`enemy\`, \`heard\`, \`fact\`, \`threat\`, \`not\`)`;
}

/** `WhenSpec.UnmarshalYAML`: a `threat:` value outside the sealed three. */
export function unknownThreatRefusal(word: string): string {
  return `\`threat: ${word}\` is not a threat this build reads: they are ${ANSWER_WHEN.threatWords.join(
    ', '
  )} (who else could reach where this row lands: nobody, a walker, or only a dasher)`;
}

/** `WhenSpec.UnmarshalYAML`: a deed with no span written. */
export function missingSpanRefusal(deed: string): string {
  return `\`${deed}\` names no span — write { within: N }`;
}

/** `WhenSpec.UnmarshalYAML`: `who` on a deed that is not a fall
 * (rpg-project#716). */
export function whoOnlyOnFellRefusal(deed: string): string {
  return `\`who\` names the one who fell, and only \`${ANSWER_WHEN.whoDeeds.join(
    '`, `'
  )}\` takes it; \`${deed}\` does not`;
}

/** `WhenSpec.UnmarshalYAML`: `who` written and naming nobody. */
export function whoNamesNobodyRefusal(deed: string): string {
  return `\`${deed}: { who }\` names nobody: write the id of the monster placement whose fall this waits on`;
}

/** `WhenSpec.UnmarshalYAML`: a span counted from zero. */
export function spanRefusal(within: number): string {
  return `a span of ${within} rounds is counted from 1`;
}

/** `scopeWords` (`dungeonspec/spec.go`): the scopes a refusal lists — the two
 * NAMED readings, since the default is what omitting the field means and
 * saying so twice would read as a third option. Read from the declaration, so
 * a scope the engine adds is listed here with no change. */
export function scopeWords(): string {
  return ANSWER_WHEN.scopes.map((scope) => scope.value).join(', ');
}

/** `scopeOf` (`dungeonspec/spec.go`): BOTH spellings at once. The two are
 * different questions — "was my side hit" vs "did I act" — so an author who
 * wrote both has made a mistake the grammar cannot resolve for them. */
export function bothScopesRefusal(
  deed: string,
  on: string,
  as: string
): string {
  return `\`${deed}\` names both \`on: ${on}\` and \`as: ${as}\`, and a condition asks one thing: \`on: ally\` is a deed against your side, \`as: actor\` is one you did`;
}

/** `scopeOf` (`dungeonspec/spec.go`): a scope word outside the named two, in
 * the same shape every other refusal in this dialect takes — the word means
 * something, it is simply not a scope this build reads. */
export function unknownScopeRefusal(key: string, value: string): string {
  return `\`${key}: ${value}\` is not a scope this build reads: they are ${scopeWords()} (and omitting it means the creature itself)`;
}

/** How a dialect spells a cell and a route, for the hints the decoder's
 * shared refusals give (`cellForms`, rpg-toolkit#2063). The decoder cannot
 * tell the dialects apart, so a refusal carries its sentence unspelt and the
 * dialect that read the file spells it: v2 in offset pairs, the single room in
 * its own axial `{ q, r }`. */
export interface CellForms {
  readonly cell: string;
  readonly route: string;
}

/** The v2 document's spelling (`floorCells.forms`): offsets in its
 * orientation. The default, so every v2 sentence reads as it always has. */
export const V2_CELL_FORMS: CellForms = Object.freeze({
  cell: '[col, row]',
  route: '[[col, row], …]',
});

/** The single room's spelling (`singleRoomCells.forms`): axial, as its
 * walkable hexes are written. */
export const SINGLE_ROOM_CELL_FORMS: CellForms = Object.freeze({
  cell: '{ q, r }',
  route: '[{ q, r }, …]',
});

/** `selectorForms`: the two mapping spellings, in a dialect's forms. */
function selectorForms(forms: CellForms): string {
  return `or { at: ${forms.cell} }, or { path: ${forms.route} }`;
}

/** `SelectorSpec.UnmarshalYAML`: a scalar outside the sealed three. */
export function unknownSelectorRefusal(
  word: string,
  forms: CellForms = V2_CELL_FORMS
): string {
  return `"${word}" is not a selector this build resolves: they are ${ANSWER_SELECTOR_WORDS.map(
    (s) => s.key
  ).join(', ')}, ${selectorForms(forms)}`;
}

/** `SelectorSpec.UnmarshalYAML`: a selector that is neither a word nor a
 * mapping. */
export function selectorShapeRefusal(forms: CellForms = V2_CELL_FORMS): string {
  return `a selector is one of ${ANSWER_SELECTOR_WORDS.map((s) => s.key).join(
    ', '
  )}, ${selectorForms(forms)}`;
}

/** `SelectorSpec.UnmarshalYAML`: a selector mapping that names anything but
 * `at`. */
export function unknownSelectorKeyRefusal(key: string): string {
  return `field ${key} not found in type dungeonspec.SelectorSpec`;
}

/** The keys a selector MAPPING may carry — a cell or a route. */
export const SELECTOR_MAPPING_KEYS: readonly string[] = Object.freeze([
  ANSWER_AT_SELECTOR.key,
  ANSWER_PATH_SELECTOR.key,
]);

/** `validate.go` `entrySelector`: a cell where only a word is legal. */
export function atSelectorRefusal(word: string): string {
  return `a cell is somewhere to walk toward, and \`${word}\` acts on a creature`;
}

/** `validate.go` `entrySelector`: `actor` with no deed to have been the
 * actor of. */
export const ACTOR_WITHOUT_DEED_REFUSAL =
  "`actor` is the actor of the deed this entry's `when` names, and this entry names no deed";

/** `TemperSpec.UnmarshalYAML`: a word outside the sealed three. */
export function unknownTemperRefusal(word: string): string {
  return `"${word}" is not a temperament this build ships: they are ${ANSWER_TEMPER.words.join(
    ', '
  )}`;
}

/** `TemperSpec.UnmarshalYAML`: a share that can never be dealt. */
export function temperShareRefusal(share: number, word: string): string {
  return `a share of ${share} can never be dealt — give "${word}" a share of at least ${ANSWER_TEMPER.minimumShare}`;
}

/** `TemperSpec.UnmarshalYAML`: a mix with nothing in it. */
export const EMPTY_TEMPER_MIX_REFUSAL =
  'a temper mix with nothing in it deals nothing';

// ---------------------------------------------------------------------------
// THE HEARING SENTENCES (rpg-project#569 R4–R8, R10) — ONE TABLE.
//
// Every one is the engine's, word for word, at rpg-toolkit#2044's final head
// (the single-room cell and route sentences and the dialect-spelled `patrol`
// hint at rpg-toolkit#2063, 4e588e2d)
// (6081ad79, `dungeonspec/hearing_test.go`, `single_room_site.go`) and the
// `mind/behavior` it pins (29ea4324, `When.Validate`, `Selector.validate`,
// `Answer.Validate`) — minus the `line N:` prefix and the sentinel suffix the
// engine trims for the form. A `mind/behavior` refusal is reported at the ROW
// (`…time[i]`), as the grammar reports it.
// ---------------------------------------------------------------------------

export const HEARING_SENTENCES = Object.freeze({
  /** `WhenSpec.UnmarshalYAML`: two conditions in one entry of the list. */
  whenNamesSeveral: (count: number): string =>
    `a \`when\` entry is one condition, and this names ${count}: give each its own entry in a list, \`when: [{ … }, { … }]\`, and every entry must hold`,
  /** `WhenSpec.UnmarshalYAML`: a condition that is not a mapping, or names
   * nothing — and a `not` around anything but one condition. */
  whenShape: (): string =>
    `a \`when\` is one of { enemy: ${ANSWER_WHEN.enemyBands.join(
      ' | '
    )} }, { <deed>: { within: N } }, { heard: { kind, within } }, { fact: <id> }, { threat: ${ANSWER_WHEN.threatWords.join(
      ' | '
    )} } or { not: { … } }`,
  /** `WhenListSpec.UnmarshalYAML`: `when: []`. */
  emptyWhenList: (): string =>
    'a `when` with no condition in it is on the table always — omit it',
  /** `decodeHeard`: a body that is not a mapping. */
  heardShape: (): string => '`heard` takes { kind, within: N }',
  /** `decodeHeard`: a body key nobody designed. */
  heardUnknownKey: (key: string): string =>
    `field ${key} not found in type dungeonspec.heardBody`,
  /** `When.Validate` (mind/behavior), reported at the ROW: no kind. */
  heardNoKind: (): string => '`heard` needs a `kind`, the sound it listens for',
  /** `decodeHeard`: a kind no deed makes. */
  unknownSoundKind: (kind: string): string =>
    `\`heard: { kind: ${kind} }\` is not a sound this build makes: they are ${ANSWER_SOUND_KINDS.join(
      ', '
    )}`,
  /** `When.Validate` (mind/behavior), reported at the ROW: a span below 1 —
   * an absent span reads as 0. */
  heardSpan: (within: number): string =>
    `\`heard\` within ${within}: a span is counted from 1`,
  /** `When.Validate`'s prefix for a fault inside a `not`. */
  insideNot: (inner: string): string => `inside \`not\`: ${inner}`,
  /** `WhenSpec.UnmarshalYAML`: `fact:` naming nothing. */
  emptyFactCondition: (): string =>
    '`fact` in a `when` names the fact the creature must hold, and this names none',
  /** `Selector.validate` (mind/behavior): `sound` on `attack`. */
  attackSound: (): string =>
    '`attack` cannot take `sound`: a sound cannot be struck, only walked toward or away from',
  /** `Selector.validate` (mind/behavior): `ally` on `attack`
   * (rpg-project#717). */
  attackAlly: (): string =>
    '`attack` cannot take `ally`: a mind is never handed an ally to strike, only one to walk toward or away from',
  /** `Answer.Validate` (mind/behavior): `sound` on a row whose top-level
   * conditions listen for nothing — a `heard` inside a `not` is not
   * listening. */
  soundWithoutHeard: (): string =>
    '`sound` needs a `heard` condition on the row: the sound it walks to is the one the row listened for',
  /** `Selector.validate` (mind/behavior): a route on a word that does not
   * walk one. */
  pathNotToward: (word: string): string =>
    `\`${word}\` cannot take a \`path\`: a route is walked, and only \`toward\` and \`dash\` walk one`,
  /** `Selector.validate` (mind/behavior), at the ROW: a cell and a route at
   * once. */
  selectorNamesBoth: (word: string): string =>
    `\`${word}\` names a cell (\`at\`) and a route (\`path\`); a target is exactly one of somebody, a cell or a route`,
  /** `Selector.validate` (mind/behavior), at the ROW: a mapping naming no
   * target — `{}`, or a route with no waypoints. */
  namesNoTarget: (word: string): string =>
    `\`${word}\` names no target; give it one of somebody, a cell (\`at\`) or a route (\`path\`)`,
  /** `AnswerSpec.UnmarshalYAML`: the word named before it was built — a
   * route, spelt in the reading dialect's forms (`patrolRefusal`,
   * rpg-toolkit#2063). */
  patrol: (forms: CellForms = V2_CELL_FORMS): string =>
    `\`patrol\` is not a word: a patrol is a route, write toward: { path: ${forms.route} }`,
  /** `singleRoomCellSelector` (rpg-toolkit#2063, 4e588e2d): an `at` written
   * as an offset pair in the single room, whose cells are its own axial
   * `{ q, r }`. Refused whatever word it sits on — the spelling is the
   * mistake. */
  singleRoomCell: (): string =>
    'at names a cell of this room, written { q, r } as its walkable hexes are: [col, row] is an offset in a document orientation this dialect does not have',
  /** `singleRoomPathSelector`: the route twin, said once for the route when
   * any waypoint is an offset pair. */
  singleRoomPath: (): string =>
    "path names a route of this room's cells, each written { q, r } as its walkable hexes are: [col, row] is an offset in a document orientation this dialect does not have",
});

/**
 * The nearest legal key to what the author typed, or undefined when nothing
 * is close. Exists so a refusal can say what was meant: `unknown key` alone
 * is the weakest form of the typo protection this vocabulary is for.
 *
 * Deliberately simple — a case-insensitive exact match, then a prefix
 * match, then edit distance within a third of the word. It suggests; it
 * never accepts.
 */
export function suggestKey(
  unknown: string,
  candidates: readonly string[]
): string | undefined {
  const needle = unknown.toLowerCase();
  const exact = candidates.find((c) => c.toLowerCase() === needle);
  if (exact) return exact;
  const prefixed = candidates.filter(
    (c) =>
      c.toLowerCase().startsWith(needle) || needle.startsWith(c.toLowerCase())
  );
  if (prefixed.length === 1) return prefixed[0];
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(needle, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  const ceiling = Math.max(1, Math.floor(needle.length / 3));
  return bestDistance <= ceiling ? best : undefined;
}

/**
 * Damerau–Levenshtein (optimal string alignment), so a TRANSPOSITION costs
 * one edit rather than two. `fcat` is the typo people actually type, and
 * plain Levenshtein scores it 2 — far enough that no sane ceiling suggests
 * `fact`. Getting the commonest slip wrong would make the suggestion
 * machinery useless exactly where it is wanted.
 */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// ---------------------------------------------------------------------------
// THE GROUP SENTENCES (rpg-project#670, S3 bundles) — ONE TABLE.
//
// A `use:` row is a GROUP: its answer is a named bundle's rows, declared once
// under the root `bundles:`. Every sentence is the engine's, word for word, at
// rpg-toolkit#2128 (`dungeonspec/bundles.go`, `grammar.go`, `spec.go`) and the
// `mind/behavior` v0.12.0 it pins (`Answer.Validate`'s group arm) — minus the
// `(line N)` suffix and the sentinel the engine trims for the form.
// ---------------------------------------------------------------------------

/** The words a group's `as` may name: the five a temperament carries a
 * percent for (`behavior.AsWords`). Omitted is none, which loads at 100. */
export const ANSWER_AS_WORDS: readonly string[] = Object.freeze([
  'attack',
  'toward',
  'away',
  'flee',
  'hold',
]);

/** How deep groups nest (`behavior.MaxGroupDepth`). */
export const MAX_GROUP_DEPTH = 8;

/** "a and b", "a, b and c" — `behavior.andList`. */
function andListOf(words: readonly string[]): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** A bundle's parameters, for a refusal: "it takes distance, heading". */
function paramsListOf(params: readonly string[]): string {
  return params.length === 0
    ? 'it takes none'
    : `it takes ${params.join(', ')}`;
}

export const GROUP_SENTENCES = Object.freeze({
  /** `bundleResolver.use`: `use:` with an empty name. */
  noBundleNamed: (): string => '`use` names no bundle',
  /** `bundleResolver.use`: a name no bundle in the file has. */
  unknownBundle: (name: string, declared: readonly string[]): string =>
    `\`use: ${name}\` names no bundle in this file: ${
      declared.length === 0
        ? 'it declares none'
        : `it declares ${declared.join(', ')}`
    }`,
  /** `bundleResolver.params`: a parameter the bundle does not declare. */
  unknownParam: (
    bundle: string,
    param: string,
    params: readonly string[]
  ): string =>
    `bundle "${bundle}" takes no parameter \`${param}\`: ${paramsListOf(params)}`,
  /** `bundleResolver.params`: a parameter with no default, not given. */
  missingParam: (bundle: string, param: string): string =>
    `bundle "${bundle}" needs \`${param}\`: it has no default, so the use gives one`,
  /** `bundleResolver.use`: a bundle inside itself. */
  usesItself: (bundle: string, chain: readonly string[]): string =>
    `bundle "${bundle}" uses itself: ${[...chain, bundle].join(' → ')}; a group cannot hold the table it is in`,
  /** `bundleResolver.use`: nested past the guard. */
  tooDeep: (bundle: string, depth: number): string =>
    `\`use: ${bundle}\` is a group nested ${depth} deep; groups nest at most ${MAX_GROUP_DEPTH} deep`,
  /** `bundleResolver.bundle`: `rows` missing or empty. */
  noRows: (): string =>
    'a bundle holds no rows; a group is a table, and a table with no rows can never be picked',
  /** `bundleResolver.bundle`: a `$name` the bundle does not declare. */
  undeclaredRef: (
    ref: string,
    bundle: string,
    params: readonly string[]
  ): string =>
    `\`$${ref}\` is not a parameter bundle "${bundle}" declares: ${paramsListOf(params)}`,
  /** `Answer.Validate`'s group arm: a word on a `use:` row. */
  carries: (words: readonly string[]): string =>
    `a group carries ${andListOf(words.map((w) => `\`${w}\``))}; a group's answer is its rows, so the word goes on a row inside it`,
  /** `Answer.Validate`'s group arm: `as` outside the five words. */
  asWord: (word: string): string =>
    `a group counts \`as\` "${word}"; it counts as one of attack, toward, away, flee or hold, or as nothing`,
  /** `grammar.answerEntry`: `with` on a row that uses nothing. */
  withWithoutUse: (): string =>
    '`with` gives a bundle its parameters, and this row uses no bundle',
  /** `grammar.answerEntry`: `as` on a row that uses nothing. */
  asWithoutUse: (): string =>
    '`as` is the word a group counts as, and this row uses no bundle',
  /** `decodeHeard`: a pattern between empty slashes. */
  heardEmptyPattern: (): string =>
    '`heard: { kind: // }` is a pattern between empty slashes, and names no sound',
  /** `decodeHeard`: a pattern no sound this build makes matches. */
  heardPatternNoSound: (kind: string): string =>
    `\`heard\` kind ${kind} matches no sound this file makes: they are ${ANSWER_SOUND_KINDS.join(
      ', '
    )}`,
  /** `Name.validate` (mind/behavior): a pattern that does not compile. The
   * engine appends Go's own parse error, which a browser cannot reproduce;
   * the sentence up to it is the engine's. */
  notAPattern: (what: string, written: string): string =>
    `${what} ${written} is not a pattern`,
  /** `grammar.whenPatterns`: a `fact` pattern matching no fact the file
   * sets. */
  factPatternNoFact: (fact: string): string =>
    `\`fact\` ${fact} matches no fact this file sets`,
  /** `grammar.whenPatterns`: `fact: //`. */
  factEmptyPattern: (): string =>
    '`fact: //` is a pattern between empty slashes, and names no fact',
  /** `grammar.answerEntry`: a pattern on a row that TEACHES a fact. */
  patternTaught: (fact: string): string =>
    `a row teaches one fact by its name, and ${fact} is a pattern: a pattern only matches facts, in a \`when\``,
});

/** The pattern a written name carries between its slashes, or undefined for
 * a literal (`dungeonspec.patternOf`): `/clang|bell/` is a pattern, anything
 * else the name it always was. */
export function patternOf(written: string): string | undefined {
  return written.length >= 2 && written.startsWith('/') && written.endsWith('/')
    ? written.slice(1, -1)
    : undefined;
}

/** The pattern compiled to match a WHOLE authored name, as the engine anchors
 * it (`behavior.Name.Matches`), or undefined when it does not compile. */
export function patternRegExp(pattern: string): RegExp | undefined {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return undefined;
  }
}

/** Whether a written name — a literal or a `/…/` pattern — names `name`. */
export function writtenNameMatches(written: string, name: string): boolean {
  const pattern = patternOf(written);
  if (pattern === undefined) return written === name;
  return patternRegExp(pattern)?.test(name) ?? false;
}
