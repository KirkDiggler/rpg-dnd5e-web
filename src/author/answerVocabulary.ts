/**
 * The answer table's sealed vocabulary — ONE declaration, three jobs.
 *
 * The engine owns this vocabulary, not this module: `dungeonspec`'s
 * `AnswerSpec.UnmarshalYAML` allowlists the entry keys and refuses the rest
 * by name, `encounter.AnswerKeys` seals the triggers, and
 * `validate.go`'s `placeOn` enforces the entry rules. Everything here is a
 * transcription of that contract so the builder can read it without
 * re-deriving it, and so there is exactly one place to edit when the
 * engine's vocabulary grows one word per use case.
 *
 * WHAT THIS BUYS (rpg-dnd5e-web#1118). Before this module the parser's
 * allowlist was the UI's subset rather than the spec's vocabulary, so a
 * file carrying `on:`, `intimidate:`, `persuade:` or `actions:` was refused
 * as an unknown key — the front room would not open at all, and the
 * refusal that should have caught a typo was instead reporting valid
 * content. The declaration is read by the PARSER (what may appear), the
 * PANELS (what may be authored) and the REFUSALS (what the author probably
 * meant). A word the engine adds is offerable by adding one row here.
 *
 * WHAT IT DOES NOT DO. It never decides which entry fires, never sums
 * weights, and never reads a `when`. Eligibility and the roll are the
 * engine's; the builder's job ends at a document that means what the author
 * said.
 */

/** One word of the outcome vocabulary. `value` is the shape of what the
 * word carries beside it: `fact` carries an opaque id, `flee` is written
 * `flee: {}` and carries nothing. */
export interface AnswerWordSpec {
  readonly key: string;
  readonly label: string;
  readonly help: string;
  readonly value: 'none' | 'string';
}

/** The entry words the engine accepts today, in the order the panels offer
 * them. `dungeonspec.AnswerSpec.UnmarshalYAML` allowlists exactly these;
 * `laterWords` refuses `alarm`, `lure`, `pretend` and `tell` by name, each
 * pointing at the slice that owns it — so a word appears HERE only once the
 * engine accepts it. */
export const ANSWER_WORDS: readonly AnswerWordSpec[] = Object.freeze([
  {
    key: 'fact',
    label: 'Teaches a fact',
    help: 'Witnesses learn this fact. An id and nothing else — a fact carries no truth bit, so a lie looks exactly like the truth.',
    value: 'string',
  },
  {
    key: 'flee',
    label: 'Bolts',
    help: 'The creature takes flight from whoever it just answered. The engine walks it; the line above is what the party sees.',
    value: 'none',
  },
]);

/** One trigger: the verb and its verdict. Every key is `<verb>` or
 * `<verb>_failed`, so the next social verb adds keys rather than fields. */
export interface AnswerTriggerSpec {
  readonly key: string;
  readonly label: string;
  readonly help: string;
}

/** Sealed to `encounter.AnswerKeys`: four keys, one per verb and verdict.
 * `time` is ruled in rpg-project#465 and is NOT here — the engine does not
 * accept it yet. */
export const ANSWER_TRIGGERS: readonly AnswerTriggerSpec[] = Object.freeze([
  {
    key: 'intimidated',
    label: 'Intimidation landed',
    help: 'The threat worked. What the creature does now.',
  },
  {
    key: 'intimidate_failed',
    label: 'Intimidation failed',
    help: 'The threat did not land. Failure may cost the party something — that is what gives the attempt teeth.',
  },
  {
    key: 'persuaded',
    label: 'Persuasion landed',
    help: 'The appeal worked. What the creature does now.',
  },
  {
    key: 'persuade_failed',
    label: 'Persuasion failed',
    help: 'The appeal did not land. A failed appeal is where a lie or bad directions live.',
  },
]);

export const ANSWER_WORD_KEYS: readonly string[] = Object.freeze(
  ANSWER_WORDS.map((w) => w.key)
);
export const ANSWER_TRIGGER_KEYS: readonly string[] = Object.freeze(
  ANSWER_TRIGGERS.map((t) => t.key)
);

/** The engine's entry rules (`dungeonspec/validate.go` `placeOn`), in one
 * place so the parser and the panel refuse the same things. An entry does
 * AT MOST ONE thing: two words in one entry is an error rather than an
 * ordering the author has to guess. */
export const ANSWER_ENTRY_RULES = Object.freeze({
  /** `weight` is a pointer upstream precisely so that omitted differs from
   * `0`: omitted IS 1, and anything below 1 is refused. An authored 1 is
   * therefore redundant but legal, and must round-trip as written. */
  minimumWeight: 1,
  /** An entry with no word must still say something, or it does nothing. */
  wordRequiredUnlessSaid: true,
});

export function answerWord(key: string): AnswerWordSpec | undefined {
  return ANSWER_WORDS.find((w) => w.key === key);
}

export function answerTrigger(key: string): AnswerTriggerSpec | undefined {
  return ANSWER_TRIGGERS.find((t) => t.key === key);
}

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
