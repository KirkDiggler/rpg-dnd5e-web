/**
 * THE STATUS TABLE AS FORM WORDS (rpg-project#1219): the engine's
 * `GetStatusWords` answer read into the columns `WordsForm` draws. Nothing is
 * typed here: every word, label, value and bound comes from the table.
 */
import type { StatusWord } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { FormWord } from './wordsForm';

const listOrNone = (list: readonly string[]): readonly string[] | undefined =>
  list.length > 0 ? [...list] : undefined;

export function statusFormWords(words: readonly StatusWord[]): FormWord[] {
  return words.map((w) => ({
    word: w.word,
    // A word written in a place other than the one it is listed under (the
    // status's `again`) is drawn where it is written.
    place: w.writtenIn !== '' ? w.writtenIn : w.place,
    shape: w.shape,
    values: w.values.map((v) => ({
      word: v.word,
      label: v.label,
      ...(v.when.length > 0 ? { when: [...v.when] } : {}),
    })),
    label: w.label,
    holds: w.holds,
    required: w.required,
    ...(w.bounds
      ? { bounds: { min: w.bounds.min, max: w.bounds.max, noMax: false } }
      : {}),
    // In the status table a `list` entry holds one word.
    ...(w.shape === 'list' ? { entry: 'one word' as const } : {}),
    ...(w.narrows ? { narrows: true } : {}),
    ...(listOrNone(w.when) ? { when: listOrNone(w.when) } : {}),
  }));
}
