/**
 * An `answered` beat's PATH through a nested table, read in the table's own
 * words (rpg-project#670): every level's die and the group it landed on, then
 * the row that fired.
 */
import { describe, expect, it } from 'vitest';
import type { RecordRow } from '../recordFeed';
import { answeredOf, readAnswer, symbolsOf } from './recordSymbols';

const row = (entry: number, when: string[], word: string, extra = {}) => ({
  entry,
  when,
  word,
  selector: word === 'toward' ? 'enemy' : '',
  weight: 1,
  say: '',
  fact: '',
  search: null,
  ...extra,
});

/** gate-1's described table: a word row, then the pursuer group. */
const tableBeat = {
  beat: 'table',
  creature: 'gate-1',
  option: '',
  key: 'time',
  temper: '',
  rows: [
    row(0, ['heard /clang|bell/ within 3'], 'toward', { selector: 'sound' }),
    {
      ...row(1, [], ''),
      weight: 2,
      from: 'pursuer',
      params: { distance: '6', heading: 'went' },
      as: '',
      rows: [
        row(0, ['enemy remembered'], 'toward'),
        row(1, ['enemy lost'], 'search', {
          search: { distance: 6, heading: 'went' },
        }),
      ],
    },
  ],
};

const verdict = (entry: number, loaded: number, extra = {}) => ({
  entry,
  held: loaded > 0,
  affordable: true,
  weight: loaded > 0 ? loaded / 100 : 0,
  percent: loaded > 0 ? 100 : 0,
  loaded,
  ...extra,
});

const answeredBeat = {
  beat: 'answered',
  creature: 'gate-1',
  option: '',
  key: 'time',
  roll: 61,
  of: 200,
  entry: 1,
  path: [1, 1],
  temper: '',
  word: 'search',
  selector: '',
  say: '',
  rows: [
    verdict(0, 0),
    verdict(1, 200, {
      roll: 7,
      of: 100,
      rows: [verdict(0, 0), verdict(1, 100)],
    }),
  ],
};

const feed = (fields: object[]): RecordRow[] =>
  fields.map(
    (f, i) =>
      ({
        id: String(i),
        beat: (f as { beat: string }).beat,
        fields: f,
      }) as unknown as RecordRow
  );

describe('an answer into a group reads level by level', () => {
  it('names each die, the group, and the row that fired', () => {
    const rows = feed([tableBeat, answeredBeat]);
    const table = symbolsOf(rows).get('1');
    const answer = answeredOf(answeredBeat)!;
    expect(answer.path).toEqual([1, 1]);
    const reading = readAnswer(answer, table);
    expect(reading.sentence).toBe(
      'gate-1 · time · rolled 61 of 200 → pursuer (2×100) · rolled 7 of 100 → enemy lost → search 6 went'
    );
    expect(reading.lines).toEqual([
      '✗ heard /clang|bell/ within 3 → toward sound: condition',
      '✓ always → pursuer {distance 6, heading went} · 2 × 100% = 200',
      '↳ ✗ enemy remembered → toward enemy: condition',
      '↳ ✓ enemy lost → search 6 went · 1 × 100% = 100',
    ]);
  });

  it('a beat from before groups reads its entry as a path of one', () => {
    const flat = {
      ...answeredBeat,
      path: undefined,
      entry: 0,
      roll: 3,
      of: 100,
    };
    const answer = answeredOf(flat)!;
    expect(answer.path).toEqual([0]);
    expect(readAnswer(answer, undefined).sentence).toContain('rolled 3 of 100');
  });

  it('a flat pick reads as it always did', () => {
    const flat = { ...answeredBeat, path: [0], entry: 0, roll: 3, of: 100 };
    expect(
      readAnswer(answeredOf(flat)!, symbolsOf(feed([tableBeat, flat])).get('1'))
        .sentence
    ).toBe(
      'gate-1 · time · rolled 3 of 100 · heard /clang|bell/ within 3 → toward sound'
    );
  });
});
