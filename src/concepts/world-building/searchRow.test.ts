import { describe, expect, it } from 'vitest';
import { validateAnswerTable } from './answerTableShape';
import { enemyBandPhrase, wordPhrase, wordShorthand } from './answerVocabulary';

/** Pursuit's row in the studio's codec and its words on screen
 * (rpg-project#668): a `search` is carried as written, refused as the engine
 * refuses it, and said as the creature does it. */
const table = (on: unknown) => () => validateAnswerTable(on, 'on');

describe('the search row', () => {
  it('carries `enemy: lost` and a search verbatim, distance or none', () => {
    const authored = {
      time: [
        { when: { enemy: 'remembered' }, toward: 'enemy' },
        { when: { enemy: 'lost' }, search: { distance: 6 } },
        { when: { enemy: 'none' }, search: {} },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('carries each of the four headings verbatim, beside a distance or alone (rpg-project#679)', () => {
    for (const heading of ['went', 'faced', 'left', 'right']) {
      const authored = {
        time: [
          { when: { enemy: 'lost' }, search: { distance: 6, heading } },
          { when: { enemy: 'lost' }, search: { heading } },
        ],
      };
      expect(validateAnswerTable(authored, 'on')).toEqual(authored);
    }
  });

  it('refuses a fifth heading in the engine’s sentence', () => {
    expect(table({ time: [{ search: { heading: 'backwards' } }] })).toThrow(
      'on.time[0].search: `search` heading "backwards": a search follows went, faced, left or right'
    );
    expect(table({ time: [{ search: { heading: 3 } }] })).toThrow(
      'on.time[0].search: `search` heading "3": a search follows went, faced, left or right'
    );
  });

  it('refuses what the engine refuses, at the row', () => {
    expect(table({ time: [{ search: { distance: 0 } }] })).toThrow(
      'on.time[0].search: `search` distance 0: a search walks at least one cell'
    );
    expect(table({ time: [{ search: { distance: 2.5 } }] })).toThrow(
      'on.time[0].search.distance: expected a whole number'
    );
    expect(table({ time: [{ search: { cells: 6 } }] })).toThrow(
      'on.time[0].search: "cells" is not a key `search` reads: it reads distance and heading'
    );
    expect(table({ time: [{ search: 6 }] })).toThrow(
      'on.time[0].search: `search` is { distance: N, heading: went }, or {} for 6 cells the way they went'
    );
    expect(table({ time: [{ search: {}, toward: 'enemy' }] })).toThrow(
      /an entry does one thing/
    );
  });

  it('says the search and the band', () => {
    expect(wordPhrase({ search: { distance: 4 } }, 'it')).toBe(
      'searches 4 cells on, the way they went, then gives up'
    );
    expect(wordPhrase({ search: {} }, 'I')).toBe(
      'search 6 cells on, the way they went, then give up'
    );
    expect(wordPhrase({ search: { heading: 'faced' } }, 'it')).toBe(
      'searches 6 cells on, the way they faced, then gives up'
    );
    expect(wordPhrase({ search: { heading: 'left' } }, 'it')).toBe(
      'searches 6 cells on, a quarter left of the way they went, then gives up'
    );
    expect(
      wordShorthand({ search: { distance: 6, heading: 'went' } }, 'search')
    ).toBe('search 6 went');
    expect(wordShorthand({ search: { distance: 4 } }, 'search')).toBe(
      'search 4'
    );
    expect(wordShorthand({ search: {} }, 'search')).toBe('search');
    expect(enemyBandPhrase('lost')).toBe(
      'an enemy is lost where it was last seen'
    );
  });
});
