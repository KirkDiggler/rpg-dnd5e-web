/**
 * The nested table in the studio (rpg-project#670): a `use:` row resolved
 * against the site's bundles exactly as `dungeonspec` resolves it, shown as
 * one line, and every refusal in the engine's own sentence at the engine's
 * own path.
 */
import { GROUP_SENTENCES } from '@/author/answerVocabulary';
import { describe, expect, it } from 'vitest';
import { validateAnswerTable } from './answerTableShape';
import {
  groupRefusals,
  resolveUse,
  scopeLists,
  useLineText,
  wordRowsOf,
} from './bundles';
import type { SiteBundles, SiteScope } from './siteScope';

const bundles: SiteBundles = {
  pursuer: {
    params: { distance: 6, heading: 'went' },
    rows: [
      { when: { enemy: 'remembered' }, toward: 'enemy' },
      {
        when: { enemy: 'lost' },
        search: { distance: '$distance', heading: '$heading' },
      },
    ],
  },
  patrol: {
    params: { path: null },
    rows: [{ when: { enemy: 'none' }, toward: { path: '$path' } }],
  },
};

const loop = [
  { q: -2, r: 0 },
  { q: 0, r: -2 },
];

describe('a use row resolves to the bundle’s rows', () => {
  it('fills the written parameter and the default', () => {
    const resolved = resolveUse(
      bundles,
      { use: 'pursuer', with: { distance: 8 } },
      'time'
    );
    expect(resolved.refusal).toBeUndefined();
    expect(resolved.params).toEqual({ distance: '8', heading: 'went' });
    expect(resolved.rows[1].search).toEqual({ distance: 8, heading: 'went' });
    expect(resolved.rows[0]).toEqual({
      when: { enemy: 'remembered' },
      toward: 'enemy',
    });
  });

  it('takes a whole route as a parameter', () => {
    const resolved = resolveUse(
      bundles,
      { use: 'patrol', with: { path: loop } },
      'time'
    );
    expect(resolved.rows[0].toward).toEqual({ path: loop });
    expect(resolved.params.path).toBe('a route of 2 waypoints');
  });

  it('reads as one line', () => {
    expect(
      useLineText({
        use: 'pursuer',
        with: { distance: 8 },
        weight: 2,
        as: 'toward',
      })
    ).toBe('pursuer · with distance 8 · ×2 · as toward');
    expect(useLineText({ use: 'alarm-reactor' })).toBe('alarm-reactor');
  });

  it('flattens a table to the rows the engine rolls', () => {
    const rows = wordRowsOf(
      bundles,
      [
        { when: { enemy: 'seen' }, toward: 'enemy' },
        { use: 'pursuer' },
        { use: 'patrol', with: { path: loop } },
      ],
      'time'
    );
    expect(rows).toHaveLength(4);
    expect(rows[2].search).toEqual({ distance: 6, heading: 'went' });
  });
});

describe('the engine’s refusals, in its words, at its paths', () => {
  const at = 'tables.gate.on.time[0]';
  const refusalsOf = (scope: SiteScope) =>
    groupRefusals(scope, scopeLists(scope));
  const withRow = (row: object, extra: SiteBundles = {}): SiteScope => ({
    bundles: { ...bundles, ...extra },
    tables: { gate: { time: [row as never] } },
  });

  it.each([
    [
      'a bundle nobody declared',
      withRow({ use: 'hunter' }),
      `${at}.use`,
      GROUP_SENTENCES.unknownBundle('hunter', ['patrol', 'pursuer']),
    ],
    [
      'a parameter the bundle does not take',
      withRow({ use: 'pursuer', with: { range: 3 } }),
      `${at}.with.range`,
      'bundle "pursuer" takes no parameter `range`: it takes distance, heading',
    ],
    [
      'a parameter with no default, not given',
      withRow({ use: 'patrol' }),
      `${at}.with`,
      'bundle "patrol" needs `path`: it has no default, so the use gives one',
    ],
    [
      'a bundle that uses itself',
      withRow({ use: 'loop' }, { loop: { rows: [{ use: 'loop' }] } }),
      `${at}.rows[0].use`,
      'bundle "loop" uses itself: loop → loop; a group cannot hold the table it is in',
    ],
    [
      'a bundle with no rows',
      withRow({ use: 'pursuer' }, { empty: { rows: [] } }),
      'bundles.empty.rows',
      'a bundle holds no rows; a group is a table, and a table with no rows can never be picked',
    ],
    [
      'a $name the bundle does not declare',
      withRow(
        { use: 'pursuer' },
        {
          sloppy: {
            rows: [{ when: { enemy: 'lost' }, search: { distance: '$range' } }],
          },
        }
      ),
      'bundles.sloppy.rows',
      '`$range` is not a parameter bundle "sloppy" declares: it takes none',
    ],
    [
      'a fact pattern matching no fact the file sets',
      withRow({ when: { fact: '/king-.*/' }, hold: {} }),
      `${at}.when`,
      '`fact` /king-.*/ matches no fact this file sets',
    ],
  ])('%s', (_name, scope, path, message) => {
    expect(refusalsOf(scope)).toContainEqual({ path, message });
  });

  it('nests no deeper than eight', () => {
    const chain: SiteBundles = {};
    for (let i = 1; i <= 9; i++)
      chain[`b${i}`] = { rows: [i < 9 ? { use: `b${i + 1}` } : { hold: {} }] };
    const refusals = refusalsOf({
      bundles: chain,
      tables: { gate: { time: [{ use: 'b1' }] } },
    });
    expect(refusals.map((r) => r.message)).toContain(
      '`use: b9` is a group nested 9 deep; groups nest at most 8 deep'
    );
  });

  it('a fact pattern matching a fact a row teaches, even one group down, is read', () => {
    expect(
      refusalsOf({
        bundles: {
          crier: {
            rows: [{ when: { enemy: 'seen' }, fact: 'guards-alarmed' }],
          },
        },
        tables: {
          gate: {
            time: [
              { use: 'crier' },
              { when: { fact: '/guards-.*/' }, hold: {} },
            ],
          },
        },
      })
    ).toEqual([]);
  });
});

describe('the decoder refuses what a row alone shows', () => {
  const decode = (row: object) => () =>
    validateAnswerTable({ time: [row] }, 'Site table gate');

  it.each([
    [{ use: 'pursuer', hold: {} }, GROUP_SENTENCES.carries(['hold'])],
    [{ use: 'pursuer', say: 'Halt!' }, GROUP_SENTENCES.carries(['say'])],
    [{ use: 'pursuer', search: {} }, GROUP_SENTENCES.carries(['search'])],
    [{ use: 'pursuer', as: 'search' }, GROUP_SENTENCES.asWord('search')],
    [{ hold: {}, with: { x: 1 } }, GROUP_SENTENCES.withWithoutUse()],
    [{ hold: {}, as: 'toward' }, GROUP_SENTENCES.asWithoutUse()],
    [
      { when: { enemy: 'lost' }, fact: '/guards-.*/' },
      GROUP_SENTENCES.patternTaught('/guards-.*/'),
    ],
    [
      { when: { heard: { kind: '/bell|gong/', within: 2 } }, toward: 'sound' },
      '`heard` kind /bell|gong/ matches no sound this file makes: they are boom, crash, clang, voice',
    ],
  ])('%j', (row, sentence) => {
    expect(decode(row)).toThrow(sentence);
  });

  it('reads a use row and a heard pattern that matches a sound', () => {
    const table = validateAnswerTable(
      {
        time: [
          { use: 'pursuer', with: { distance: 8 }, weight: 2, as: 'toward' },
          {
            when: { heard: { kind: '/clang|bell/', within: 2 } },
            toward: 'sound',
          },
        ],
      },
      'Site table gate'
    );
    expect(table.time[0]).toEqual({
      use: 'pursuer',
      with: { distance: 8 },
      weight: 2,
      as: 'toward',
    });
    expect(table.time[1].when).toEqual({
      heard: { kind: '/clang|bell/', within: 2 },
    });
  });
});
