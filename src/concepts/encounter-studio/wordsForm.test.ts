import { describe, expect, it } from 'vitest';
import { itemWordsV237 } from './fixtures/engineReadBack';
import {
  firstRequiredText,
  setWord,
  unknownKeys,
  withWordsOf,
  wordsAt,
} from './wordsForm';

const words = itemWordsV237().words;

describe('wordsForm', () => {
  it('wordsAt gives the words of a place in the table’s order', () => {
    expect(wordsAt(words, 'item').map((w) => w.word)).toEqual([
      'name',
      'slot',
      'unique',
      'charges',
      'lets',
    ]);
    expect(wordsAt(words, 'nowhere')).toEqual([]);
  });

  it('withWordsOf gives the with words of the chosen value, else none', () => {
    expect(
      withWordsOf(words, 'lets entry', { use: 'second wind' }).map(
        (w) => w.word
      )
    ).toEqual(['level']);
    expect(withWordsOf(words, 'lets entry', {})).toEqual([]);
    expect(withWordsOf(words, 'lets entry', { use: 'nothing' })).toEqual([]);
  });

  it('setWord keeps key order, appends a new key, removes on undefined, never mutates', () => {
    const value = { a: 1, b: 2, c: 3 };
    expect(Object.keys(setWord(value, 'b', 9))).toEqual(['a', 'b', 'c']);
    expect(setWord(value, 'b', 9).b).toBe(9);
    expect(Object.keys(setWord(value, 'z', 1))).toEqual(['a', 'b', 'c', 'z']);
    expect(Object.keys(setWord(value, 'b', undefined))).toEqual(['a', 'c']);
    expect(value).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('unknownKeys names a key the table does not have', () => {
    expect(
      unknownKeys(wordsAt(words, 'item'), {
        name: 'x',
        slot: 'y',
        weight: 3,
      })
    ).toEqual(['weight']);
  });
});

describe('firstRequiredText', () => {
  it('is the first required word of the place whose shape is text', () => {
    const word = firstRequiredText(words, 'item');
    expect(word).not.toBeNull();
    expect(word!.shape).toBe('text');
    expect(word!.required).toBe(true);
    expect(word!.label).toBe(
      words.find((w) => w.place === 'item' && w.shape === 'text' && w.required)!
        .label
    );
  });
  it('skips an optional text word that comes first', () => {
    const text = words.find(
      (w) => w.place === 'item' && w.shape === 'text' && w.required
    )!;
    const optional = {
      ...text,
      word: 'aside',
      label: 'aside',
      required: false,
    };
    expect(firstRequiredText([optional, text], 'item')).toBe(text);
  });
  it('is null for a place with none', () => {
    expect(firstRequiredText(words, 'no-such-place')).toBeNull();
  });
});
