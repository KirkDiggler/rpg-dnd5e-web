import { describe, expect, it } from 'vitest';
import {
  ANSWER_SEARCH,
  ANSWER_WHEN,
  answerWordsForTrigger,
} from './answerVocabulary';
import { emitDungeon, parseDungeon } from './dungeonYaml';
import { REFERENCE_FRONT_ROOM_YAML } from './fixtures/referenceFrontRoom';

/**
 * PURSUIT'S TWO WORDS (rpg-project#668): the `enemy: lost` band and
 * `search: { distance }`, read and written as the engine's `dungeonspec`
 * reads them — the web never refuses what the engine accepts (#1119), and
 * refuses what it refuses in its words. Asserted on the real front room, one
 * substitution each.
 */
const LOST_ROW = '{ when: { enemy: lost },             hold: {} }';

function withLost(row: string): string {
  if (!REFERENCE_FRONT_ROOM_YAML.includes(LOST_ROW))
    throw new Error('the front room no longer answers `enemy: lost` with hold');
  return REFERENCE_FRONT_ROOM_YAML.replace(LOST_ROW, row);
}

describe('pursuit words (rpg-project#668)', () => {
  it('seals `lost` between remembered and none, and `search` as a time word', () => {
    expect(ANSWER_WHEN.enemyBands).toEqual([
      'reach',
      'seen',
      'remembered',
      'lost',
      'none',
    ]);
    expect(answerWordsForTrigger('time').map((w) => w.key)).toContain('search');
    expect(answerWordsForTrigger('success').map((w) => w.key)).not.toContain(
      'search'
    );
    expect(ANSWER_SEARCH.defaultDistance).toBe(6);
  });

  it('reads the front room’s `enemy: lost` row and re-emits its own bytes', () => {
    const once = emitDungeon(parseDungeon(REFERENCE_FRONT_ROOM_YAML));
    expect(once).toContain('when: { enemy: lost }');
    expect(emitDungeon(parseDungeon(once))).toBe(once);
  });

  it('carries a search with its distance, or with none, through a save', () => {
    for (const [row, written] of [
      [
        '{ when: { enemy: lost }, search: { distance: 3 } }',
        'search: { distance: 3 }',
      ],
      ['{ when: { enemy: lost }, search: {} }', 'search: {}'],
    ] as const) {
      const once = emitDungeon(parseDungeon(withLost(row)));
      expect(once).toContain(written);
      expect(emitDungeon(parseDungeon(once))).toBe(once);
    }
  });

  it('refuses a search the engine refuses, in its words', () => {
    expect(() =>
      parseDungeon(
        withLost('{ when: { enemy: lost }, search: { distance: 0 } }')
      )
    ).toThrow(/`search` distance 0: a search walks at least one cell/);
    expect(() =>
      parseDungeon(withLost('{ when: { enemy: lost }, search: { cells: 6 } }'))
    ).toThrow(/"cells" is not a key `search` reads: it reads distance/);
    expect(() =>
      parseDungeon(withLost('{ when: { enemy: lost }, search: 6 }'))
    ).toThrow(/`search` is \{ distance: N \}, or \{\} for 6 cells/);
  });
});
