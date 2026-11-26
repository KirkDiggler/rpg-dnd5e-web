import { describe, expect, it } from 'vitest';
import { statusWordsV240 } from './fixtures/engineReadBack';
import { statusFormWords } from './statusWords';

const words = statusFormWords(statusWordsV240().words);
const find = (name: string) => words.find((w) => w.word === name)!;

describe('statusFormWords', () => {
  it('again is drawn on the status, where it is written, not where it is listed', () => {
    expect(find('again').place).toBe('status');
    // the other words keep the place they are written in
    expect(find('advantage').place).toBe('change');
    expect(find('ability').place).toBe('when');
  });

  it('every list word holds one word per entry, and no other word does', () => {
    const lists = words.filter((w) => w.shape === 'list').map((w) => w.word);
    expect(lists).toEqual(['changes', 'maintenance', 'when_given']);
    for (const w of words)
      expect(w.entry).toBe(w.shape === 'list' ? 'one word' : undefined);
  });

  it('when is the word that narrows, and only it', () => {
    expect(words.filter((w) => w.narrows).map((w) => w.word)).toEqual(['when']);
  });

  it('a value carries the when words it allows; a word carries its own; initiative carries none', () => {
    const advantage = find('advantage');
    expect(advantage.values.find((v) => v.word === 'checks')?.when).toEqual([
      'ability',
    ]);
    expect(advantage.values.find((v) => v.word === 'attacks')?.when).toEqual([
      'ability',
      'attack',
    ]);
    expect(advantage.when).toBeUndefined();
    expect(find('damage').when).toEqual(['ability', 'attack']);
    expect(find('initiative').when).toBeUndefined();
    expect(find('initiative').values).toEqual([]);
  });

  it('bounds are carried, with no open top', () => {
    expect(find('max_hit_points').bounds).toEqual({
      min: 1,
      max: 1000,
      noMax: false,
    });
    expect(find('name').bounds).toBeUndefined();
  });
});
