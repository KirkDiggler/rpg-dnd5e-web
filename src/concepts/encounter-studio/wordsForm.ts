/**
 * THE ENGINE'S WORDS AS A FORM (rpg-project#1201): the pure half. A table of
 * words (an item's, later a status effect's) says, per word, where it sits
 * (`place`), what shape its value has and what it may be. Nothing here names
 * a word; it only reads the table's own columns.
 */

export interface FormWordValue {
  word: string;
  label: string;
  with?: readonly FormWord[];
  /** The `when` words that may sit beside a change carrying this value. */
  when?: readonly string[];
}

export interface FormWord {
  word: string;
  place: string;
  shape: string;
  values: readonly FormWordValue[];
  label: string;
  holds: string;
  required: boolean;
  bounds?: {
    min: number;
    max: number;
    noMax: boolean;
    /** The engine's own flag; the form does not act on it. */
    zeroAllowed?: boolean;
  };
  /** `one word`: a `list` entry holds exactly one word of the `holds` place
   * (a status's change), not every word of it (an item's `lets` entry). */
  entry?: 'one word';
  /** Written beside another word of its entry, narrowing it. */
  narrows?: boolean;
  /** The `when` words that may sit beside this word. */
  when?: readonly string[];
}

/** The words of one place, in the table's order. */
export function wordsAt(words: readonly FormWord[], place: string): FormWord[] {
  return words.filter((word) => word.place === place);
}

/** The first word of `place` that is required and whose shape is `text`. */
export function firstRequiredText(
  words: readonly FormWord[],
  place: string
): FormWord | null {
  return (
    wordsAt(words, place).find(
      (word) => word.required && word.shape === 'text'
    ) ?? null
  );
}

/** The `with` words of the chosen value of the first `one of` word of
 * `place` whose chosen value has any; none otherwise. */
export function withWordsOf(
  words: readonly FormWord[],
  place: string,
  value: Readonly<Record<string, unknown>>
): FormWord[] {
  for (const word of wordsAt(words, place)) {
    if (word.shape !== 'one of') continue;
    const chosen = value[word.word];
    const found = word.values.find((v) => v.word === chosen);
    if (found?.with && found.with.length > 0) return [...found.with];
  }
  return [];
}

/** The value with one word set (`undefined` removes it). An existing key
 * keeps its place; a new key goes last. Never mutates. */
export function setWord(
  value: Readonly<Record<string, unknown>>,
  word: string,
  next: unknown
): Record<string, unknown> {
  if (next === undefined) {
    const { [word]: _removed, ...rest } = value;
    void _removed;
    return rest;
  }
  return { ...value, [word]: next };
}

/** The keys of `value` that no word of the list names. */
export function unknownKeys(
  words: readonly FormWord[],
  value: Readonly<Record<string, unknown>>
): string[] {
  const named = new Set(words.map((word) => word.word));
  return Object.keys(value).filter((key) => !named.has(key));
}

/** The `when` words that may sit beside `word` written as `current`: the
 * chosen value's own list if that value has one, else the word's, else none. */
export function whenAllowed(
  word: FormWord,
  current: unknown
): readonly string[] {
  const chosen = word.values.find((v) => v.word === current);
  if (chosen?.when !== undefined) return chosen.when;
  return word.when ?? [];
}

/**
 * A value's label as the word's own label leaves room for it. A word label
 * `resistance to {value} damage` already says the words around the value, so
 * a value label `resistance to acid damage` shows as `acid`. A value label
 * that does not wear those words, or has nothing between them, shows whole.
 */
export function valueText(wordLabel: string, valueLabel: string): string {
  const mark = '{value}';
  const at = wordLabel.indexOf(mark);
  if (at < 0) return valueLabel;
  const before = wordLabel.slice(0, at);
  const after = wordLabel.slice(at + mark.length);
  if (!valueLabel.startsWith(before) || !valueLabel.endsWith(after))
    return valueLabel;
  const between = valueLabel
    .slice(before.length, valueLabel.length - after.length)
    .trim();
  return between === '' ? valueLabel : between;
}
