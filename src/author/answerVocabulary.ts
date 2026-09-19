/**
 * The answer table's vocabulary — OFFERS, NOT RULES.
 *
 * WHAT THIS IS (rpg-project#481 R3). These are the words a palette puts in
 * front of an author: the triggers a picker lists, the outcome words it
 * offers under each, the enemy bands and deeds a `when` builder shows, the
 * selector words, the temperaments. They exist so a panel can offer something
 * real instead of a free-text box.
 *
 * WHAT IT IS NOT. It is not a gate. NOTHING IN THE WEB REFUSES A FILE AGAINST
 * THIS LIST. `dungeonspec` owns the vocabulary — `AnswerSpec.UnmarshalYAML`
 * allowlists the entry keys, `encounter.TableKeys` seals the triggers,
 * `validate.go`'s `placeOn` enforces the entry rules — and
 * `PutDungeon{validate_only}` is where a file is graded against it, in the
 * engine's own paths and sentences.
 *
 * THE ENGINE'S SENTENCES USED TO LIVE HERE, transcribed word for word so a
 * refusal read the same from the builder and from the server. That is a
 * mirror, and a mirror drifts one release at a time: rpg-dnd5e-web#1119 was
 * the builder refusing the only authored `on:` block in the project, and
 * #1145 refused a `temper` the engine takes. Both were the web declining a
 * file the engine plays. The sentences are deleted; the codec carries what
 * the author wrote and the compiler answers.
 *
 * THE COST, NAMED. An offer can fall behind the engine. A word this list has
 * not learned is a word no picker offers — and a file that uses it still
 * opens, still round-trips, and is still graded by the engine. Falling behind
 * costs a completion; it no longer costs an author their file.
 *
 * The author-facing reference for the rows is
 * `rpg-project/docs/howto/author-a-creature.md`; when the engine and that page
 * disagree, the engine's `dungeonspec` is the tiebreak.
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
 * selector. */
export interface AnswerWordSpec {
  readonly key: string;
  readonly label: string;
  readonly help: string;
  readonly value: 'none' | 'string' | 'selector';
  /** The triggers this word is legal on — `AnswerSpec`'s `wordLegality`. A
   * word written under the other group is refused with the engine's own
   * sentence ([answerWordRefusal]). */
  readonly legalOn: AnswerApplicability;
}

/** The entry words the panels OFFER, in the order they offer them — the ones
 * the engine accepted when this list was last read. A word appears here once
 * the engine accepts it; a word the engine accepts and this list has not
 * learned is simply one no picker offers, never one a file is refused for.
 *
 * THE ORDER IS THE AUTHOR-FACING REFERENCE'S OWN (`author-a-creature.md`,
 * "One word, or none"): the two social words first, then the four time
 * words, `hold` before the movement words. */
export const ANSWER_WORDS: readonly AnswerWordSpec[] = Object.freeze([
  {
    key: 'fact',
    label: 'Teaches a fact',
    help: 'Witnesses learn this fact. An id and nothing else — a fact carries no truth bit, so a lie looks exactly like the truth.',
    value: 'string',
    legalOn: 'social',
  },
  {
    key: 'flee',
    label: 'Bolts',
    help: 'The creature holds `fled` against whoever spoke to it. It does NOT step here: it lands the memory, and its own `time` table does the running.',
    value: 'none',
    legalOn: 'social',
  },
  {
    key: 'hold',
    label: 'Holds',
    help: 'The creature does nothing with its time. An unconditional `hold` competes on every roll, so it usually wants a `when`.',
    value: 'none',
    legalOn: 'time',
  },
  {
    key: 'attack',
    label: 'Attacks',
    help: 'Strikes the selected creature. A swing at somebody out of reach is a wasted turn — this belongs under `{ enemy: reach }`.',
    value: 'selector',
    legalOn: 'time',
  },
  {
    key: 'toward',
    label: 'Walks toward',
    help: 'Walks toward the selected creature, or onto an authored cell. The only word `{ at: [col,row] }` is legal on.',
    value: 'selector',
    legalOn: 'time',
  },
  {
    key: 'away',
    label: 'Walks away',
    help: 'Walks away from the selected creature for the turn — the coward’s run. Acts on a creature, never on a cell.',
    value: 'selector',
    legalOn: 'time',
  },
]);

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

/** Sealed to `encounter.TableKeys`: the four social keys, then `time` —
 * the engine's own order (`table.go`), which is also the order the reference
 * page lists and the order the panels offer.
 *
 * `time` FIRES WITHOUT ANYBODY TALKING TO IT — the creature's turn in a
 * fight, or a round of the world clock — which is why it is the one trigger
 * the four action words are legal on. */
export const ANSWER_TRIGGERS: readonly AnswerTriggerSpec[] = Object.freeze([
  {
    key: 'intimidated',
    label: 'Intimidation landed',
    help: 'The threat worked. What the creature does now.',
    applicability: 'social',
  },
  {
    key: 'intimidate_failed',
    label: 'Intimidation failed',
    help: 'The threat did not land. Failure may cost the party something — that is what gives the attempt teeth.',
    applicability: 'social',
  },
  {
    key: 'persuaded',
    label: 'Persuasion landed',
    help: 'The appeal worked. What the creature does now.',
    applicability: 'social',
  },
  {
    key: 'persuade_failed',
    label: 'Persuasion failed',
    help: 'The appeal did not land. A failed appeal is where a lie or bad directions live.',
    applicability: 'social',
  },
  {
    key: 'time',
    label: 'Has time',
    help: 'The creature’s turn in a fight, or a round of the world clock — the one trigger that fires without anybody talking to it.',
    applicability: 'time',
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
  /** The four exclusive enemy bands, in the engine's own order. Exactly one
   * holds at any moment, so an author writes one entry per band. */
  readonly enemyBands: readonly string[];
  /** The four deeds a `when` may read, in the engine's past tense. */
  readonly deeds: readonly string[];
  /** A span is counted from 1 (`WhenSpec.Within`): `{ within: 0 }` is a
   * condition that can never hold. */
  readonly minimumWithin: number;
}

export const ANSWER_WHEN: AnswerWhenSpec = Object.freeze({
  legalOn: 'time',
  enemyBands: Object.freeze(['reach', 'seen', 'remembered', 'none']),
  deeds: Object.freeze(['attacked', 'intimidated', 'persuaded', 'fled']),
  minimumWithin: 1,
});

/** One selector word: what an `attack`/`toward`/`away` entry acts on
 * (`encounter.SelectorWords`). */
export interface AnswerSelectorSpec {
  readonly key: string;
  readonly label: string;
  readonly help: string;
}

/** The three sealed selector words, in the engine's order. A scalar selector
 * is one of these; the fourth spelling is a cell ([ANSWER_AT_SELECTOR]). */
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
  ]);

/** The authored-cell selector — `{ at: [col, row] }`.
 *
 * `toward` IS THE ONLY WORD `at:` IS LEGAL ON (`SelectorSpec`): walking away
 * from a fixed cell is a direction rather than a flight, and nothing has paid
 * for one. An authored cell is walked ONTO, not up to. */
export const ANSWER_AT_SELECTOR = Object.freeze({
  key: 'at',
  label: 'An authored cell',
  help: 'A cell to walk onto. Pick a cell nothing stands on — a creature anchor is stood beside.',
  /** The one word this selector spelling is legal on. */
  onlyWord: 'toward',
});

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

/**
 * THE ENTRY RULES ARE NOT DECLARED HERE ANY MORE (rpg-project#481 R3).
 *
 * `ANSWER_ENTRY_RULES` used to carry the minimum weight, "an entry does one
 * thing" and "an entry with no word must still say something" so the parser
 * and the panel could refuse the same things. They are `validate.go`'s
 * `answerEntry` rules, they are enforced there, and the builder reads the
 * verdict off `PutDungeon{validate_only}` rather than deciding it twice.
 */

export function answerWord(key: string): AnswerWordSpec | undefined {
  return ANSWER_WORDS.find((w) => w.key === key);
}

export function answerTrigger(key: string): AnswerTriggerSpec | undefined {
  return ANSWER_TRIGGERS.find((t) => t.key === key);
}

/** What group a trigger belongs to, or undefined when it is not a trigger
 * this build rolls. */
export function answerTriggerApplicability(
  trigger: string
): AnswerApplicability | undefined {
  return answerTrigger(trigger)?.applicability;
}

/** Whether a word may be written under a trigger — the whole of the
 * word-to-trigger applicability rule, in one predicate a picker and the
 * parser both read. */
export function answerWordLegalOn(word: string, trigger: string): boolean {
  const spec = answerWord(word);
  if (!spec) return false;
  return spec.legalOn === answerTriggerApplicability(trigger);
}

/** The words a picker may offer for a trigger, and nothing else. A picker
 * that used [ANSWER_WORDS] wholesale would offer `flee` on `time`. */
export function answerWordsForTrigger(
  trigger: string
): readonly AnswerWordSpec[] {
  const applicability = answerTriggerApplicability(trigger);
  if (applicability === undefined) return [];
  return ANSWER_WORDS.filter((w) => w.legalOn === applicability);
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
// THE ENGINE'S OWN SENTENCES USED TO LIVE HERE — twenty of them, transcribed
// from `dungeonspec/validate.go`, `WhenSpec.UnmarshalYAML`,
// `SelectorSpec.UnmarshalYAML` and `TemperSpec.UnmarshalYAML` so an author met
// the same words from the builder and from the server.
//
// They are deleted (rpg-project#481 R3). Each one was a verdict the web made
// about whether a file plays, and the engine makes that verdict: an author now
// meets ONE sentence, from the owner, at the path the compiler names. A
// sentence authored in two places drifts in one of them, and the drift is what
// #1119 and #1145 were.
//
// `suggestKey` below SURVIVES, because it is not a verdict: it is what a
// palette says beside a completion.
// ---------------------------------------------------------------------------

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
