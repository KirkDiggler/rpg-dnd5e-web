/**
 * THE STUDIO LOADS WHATEVER THE ENGINE RUNS (rpg-project#857, Kirk: "if it
 * runs, we should load it"). The served castle opens, and Download writes it
 * back byte for byte; a field the studio does not author rides along; the
 * post fields the studio does author edit only their own lines.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { CreatureStates } from '../world-building/creatureStates';
import {
  patchStateHolds,
  setStateBlocks,
} from '../world-building/statePostEdits';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import posts from './fixtures/the-mad-king-posts.yaml?raw';
import served from './fixtures/the-mad-king-served.yaml?raw';

/** The fixture's header names a git blob; the body below it must be it. */
function body(fixture: string): { sha: string; text: string } {
  const lines = fixture.split('\n');
  const sha = /git blob ([0-9a-f]{40})/.exec(lines.slice(0, 3).join('\n'))![1];
  return { sha, text: lines.slice(3).join('\n') };
}
const blobSha = (text: string) =>
  createHash('sha1')
    .update(`blob ${Buffer.byteLength(text)}\0${text}`)
    .digest('hex');

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

/** Every line of `b` that differs from the same line of `a`. */
function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

describe('the served castle opens and writes back (rpg-project#857)', () => {
  it.each([
    ['rpg-api dev', served],
    ['the S1c api branch', posts],
  ])('the %s fixture is the blob its header names', (_name, fixture) => {
    const { sha, text } = body(fixture);
    expect(blobSha(text)).toBe(sha);
  });

  it.each([
    ['rpg-api dev', served],
    ['the S1c api branch', posts],
  ])(
    'the %s castle imports and an unedited download is byte-identical',
    (_name, fixture) => {
      for (const text of [fixture, body(fixture).text]) {
        const result = read(text);
        expect(exportDraftYaml(result, result.key)).toBe(text);
      }
    }
  );

  it('moving the pedlar and saving under your own key changes those two lines only', () => {
    const result = read(served);
    const draft = structuredClone(result.draft);
    const pedlar = draft.room.monsterDeclarations.find(
      (m) => m.id === 'pedlar'
    )!;
    pedlar.startingCell!.location.q += 1;
    const saved = exportDraftYaml({ draft, scope: result.scope }, 'my-castle');
    expect(changedLines(served, saved)).toEqual([
      'key: my-castle',
      '            q: 1',
    ]);
    expect(saved.split('\n')).toHaveLength(served.split('\n').length);
  });

  it('a state with an invented future field imports and round-trips, through an edit too', () => {
    const text = served.replace(
      '          posted:\n            blocks: true\n',
      '          posted:\n            foo: 1\n            blocks: true\n'
    );
    expect(text).not.toBe(served);
    const result = read(text);
    expect(exportDraftYaml(result, result.key)).toBe(text);
    const states = result.draft.room.monsterBindings!['gate-1'].states!;
    expect(states.posted).toMatchObject({ foo: 1, blocks: true });
    const draft = structuredClone(result.draft);
    draft.room.monsterDeclarations.find(
      (m) => m.id === 'pedlar'
    )!.startingCell!.location.q += 1;
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(
      parse(saved).room.room.monsterBindings['gate-1'].states.posted.foo
    ).toBe(1);
    expect(changedLines(text, saved)).toEqual(['            q: 1']);
  });

  /** An invented key at each level of the file: where it goes, and how. */
  const LEVELS: [string, string, string][] = [
    ['the root', 'key: ', 'shelf: castles\nkey: '],
    ['the play contract', 'play:\n', 'play:\n  zz: 1\n'],
    [
      'a stat block',
      '  guard:\n    base: dnd5e:monsters:human\n',
      '  guard:\n    zz: 1\n    base: dnd5e:monsters:human\n',
    ],
    ['a bundle', '  pursuer:\n', '  pursuer:\n    zz: 1\n'],
    [
      'a table row',
      '        toward: { at: { q: 10, r: -19 } }\n',
      '        toward: { at: { q: 10, r: -19 } }\n        zz: 1\n',
    ],
    [
      'a faction',
      '  - id: garrison\n    mind: captain\n',
      '  - id: garrison\n    zz: 1\n    mind: captain\n',
    ],
    ['a disposition', '  - between:\n', '  - zz: 1\n    between:\n'],
    [
      'an intel record',
      '  - id: cooks-ledger\n',
      '  - id: cooks-ledger\n    zz: 1\n',
    ],
    [
      'an exit',
      '  - id: postern\n    cell:\n',
      '  - id: postern\n    zz: 1\n    cell:\n',
    ],
    ['an ending', '  - id: king-slain\n', '  - id: king-slain\n    zz: 1\n'],
    [
      'a scene item',
      '      - id: altar\n',
      '      - id: altar\n        zz: 1\n',
    ],
    [
      'a wall',
      '      - id: gate-wall\n',
      '      - id: gate-wall\n        zz: 1\n',
    ],
    [
      'a region',
      '      - id: room-1-region\n',
      '      - id: room-1-region\n        zz: 1\n',
    ],
    [
      'a placement',
      '      - id: pedlar\n',
      '      - id: pedlar\n        mood: wary\n',
    ],
    [
      'an option',
      '          - id: troupe\n',
      '          - id: troupe\n            zz: 1\n',
    ],
    [
      'a door binding',
      '    doorBindings:\n      gate-wall-door:\n',
      '    doorBindings:\n      gate-wall-door:\n        creaks: true\n',
    ],
  ];

  it.each(LEVELS)(
    'an unknown field on %s imports and is written back byte for byte',
    (_level, anchor, carried) => {
      expect(served).toContain(anchor);
      const text = served.replace(anchor, carried);
      const result = read(text);
      expect(exportDraftYaml(result, result.key)).toBe(text);
    }
  );

  it('the two authored post fields edit and export, and only their lines change', () => {
    const result = read(posts);
    const binding = result.draft.room.monsterBindings!['gate-1'];
    let states: CreatureStates = setStateBlocks(
      binding.states!,
      'alert',
      false
    );
    states = patchStateHolds(states, 'posted', {
      against: 'leaving',
      pass: undefined,
    });
    const draft = {
      ...result.draft,
      room: {
        ...result.draft.room,
        monsterBindings: {
          ...result.draft.room.monsterBindings,
          'gate-1': { ...binding, states },
        },
      },
    };
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    const gate = parse(saved).room.room.monsterBindings['gate-1'].states;
    expect(gate.posted.holds).toEqual({
      door: 'gate-wall-door',
      at: [
        { q: -3, r: 7 },
        { q: -4, r: 7 },
      ],
      against: 'leaving',
    });
    expect(gate.alert).not.toHaveProperty('blocks');
    expect(gate.alert.holds.against).toBe('entering');
    const held =
      '            holds: { door: gate-wall-door, at: [{ q: -3, r: 7 }, { q: -4, r: 7 }], against: entering, pass: troupe-admitted }\n';
    expect(saved).toBe(
      posts
        .replace(
          held,
          '            holds: { door: gate-wall-door, at: [{ q: -3, r: 7 }, { q: -4, r: 7 }], against: leaving }\n'
        )
        .replace(
          '          alert:\n            blocks: true\n',
          '          alert:\n'
        )
    );
    const again = read(saved);
    expect(again.draft.room.monsterBindings!['gate-1'].states).toEqual(states);
  });
});
