import { describe, expect, it } from 'vitest';
import { itemWordsV237 } from './fixtures/engineReadBack';
import {
  firstRequiredText,
  setWord,
  unknownKeys,
  valueText,
  whenAllowed,
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

  it('whenAllowed: the chosen value’s list wins over the word’s, a value not in the table gives the word’s, neither gives none', () => {
    const word = {
      word: 'w',
      place: 'p',
      shape: 'one of',
      values: [
        { word: 'a', label: 'a', when: ['x'] },
        { word: 'b', label: 'b' },
      ],
      label: 'w',
      holds: '',
      required: false,
      when: ['y', 'z'],
    };
    expect(whenAllowed(word, 'a')).toEqual(['x']);
    expect(whenAllowed(word, 'b')).toEqual(['y', 'z']);
    expect(whenAllowed(word, 'nope')).toEqual(['y', 'z']);
    expect(whenAllowed(word, undefined)).toEqual(['y', 'z']);
    expect(whenAllowed({ ...word, when: undefined }, 'b')).toEqual([]);
  });
});

describe('valueText', () => {
  it('cuts the words the word label already says', () => {
    expect(
      valueText('resistance to {value} damage', 'resistance to acid damage')
    ).toBe('acid');
    expect(valueText('ends when {value}', 'ends when the run ends')).toBe(
      'the run ends'
    );
  });
  it('a label that does not fit is not cut', () => {
    expect(
      valueText(
        'advantage on {value}',
        'attacks against the holder have advantage'
      )
    ).toBe('attacks against the holder have advantage');
  });
  it('a label that fails the ending is not cut', () => {
    expect(
      valueText('resistance to {value} damage', 'resistance to acid armour')
    ).toBe('resistance to acid armour');
  });
  it('a word label with no {value} leaves the value label alone', () => {
    expect(valueText('where it is worn', 'worn as a cloak')).toBe(
      'worn as a cloak'
    );
  });
  it('nothing between prefix and suffix leaves the label whole', () => {
    expect(valueText('a {value} b', 'a  b')).toBe('a  b');
    expect(valueText('a {value} b', 'a b')).toBe('a b');
  });
});
