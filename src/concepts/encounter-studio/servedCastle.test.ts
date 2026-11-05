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
import { setDoorBindingState } from '../world-building/doorBindingEdits';
import {
  normalizeBinding,
  setMonsterFaction,
  setMonsterTemper,
} from '../world-building/monsterOrderEdits';
import { patchOption } from '../world-building/optionEdits';
import {
  parseRoomDocumentJson,
  stringifyRoomDraft,
} from '../world-building/roomDraft';
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
  /** An invented key at each level of the file: where it goes, how, and
   * whether the draft itself holds it (`true`) or only the file splice does
   * (`false`: the fixed play contract, and a region's cell rows, which the
   * studio rebuilds from cells). */
  const LEVELS: [string, string, string, boolean][] = [
    ['the root', 'key: ', 'zz: 1\nkey: ', true],
    ['the play contract', 'play:\n', 'play:\n  zz: 1\n', false],
    [
      'the coordinate frame',
      '  coordinateFrame:\n',
      '  coordinateFrame:\n    zz: 1\n',
      true,
    ],
    [
      'the room',
      '    implicitRegionId: room-1-region\n',
      '    implicitRegionId: room-1-region\n    zz: 1\n',
      true,
    ],
    [
      'a stat block',
      '  guard:\n    base: dnd5e:monsters:human\n',
      '  guard:\n    zz: 1\n    base: dnd5e:monsters:human\n',
      true,
    ],
    ['a bundle', '  pursuer:\n', '  pursuer:\n    zz: 1\n', true],
    [
      'a table row',
      '        toward: { at: { q: 10, r: -19 } }\n',
      '        toward: { at: { q: 10, r: -19 } }\n        zz: 1\n',
      true,
    ],
    [
      'a row’s cell',
      'toward: { at: { q: 10, r: -19 } }',
      'toward: { at: { q: 10, r: -19, zz: 1 } }',
      true,
    ],
    [
      'a faction',
      '  - id: garrison\n    mind: captain\n',
      '  - id: garrison\n    zz: 1\n    mind: captain\n',
      true,
    ],
    ['a disposition', '  - between:\n', '  - zz: 1\n    between:\n', true],
    [
      'an intel record',
      '  - id: cooks-ledger\n',
      '  - id: cooks-ledger\n    zz: 1\n',
      true,
    ],
    [
      'an exit',
      '  - id: postern\n    cell:\n',
      '  - id: postern\n    zz: 1\n    cell:\n',
      true,
    ],
    [
      'an ending',
      '  - id: king-slain\n',
      '  - id: king-slain\n    zz: 1\n',
      true,
    ],
    [
      'a scene item',
      '      - id: altar\n',
      '      - id: altar\n        zz: 1\n',
      true,
    ],
    [
      'a prop declaration',
      '      altar:\n        blocksMovement: true\n',
      '      altar:\n        zz: 1\n        blocksMovement: true\n',
      true,
    ],
    [
      'a wall',
      '      - id: gate-wall\n',
      '      - id: gate-wall\n        zz: 1\n',
      true,
    ],
    [
      'a region',
      '      - id: room-1-region\n',
      '      - id: room-1-region\n        zz: 1\n',
      true,
    ],
    [
      'a placement',
      '      - id: pedlar\n',
      '      - id: pedlar\n        zz: 1\n',
      true,
    ],
    ['a binding', '      gate-1:\n', '      gate-1:\n        zz: 1\n', true],
    [
      'a state',
      '          posted:\n            blocks: true\n',
      '          posted:\n            zz: 1\n            blocks: true\n',
      true,
    ],
    [
      'a transition',
      '              - { on: fact, when: { fact: guards-turned }, to: turned, reason: the garrison turned }\n',
      '              - { on: fact, when: { fact: guards-turned }, to: turned, reason: the garrison turned, zz: 1 }\n',
      true,
    ],
    [
      'a holds.at cell',
      'at: [{ q: -3, r: 7 }, { q: -4, r: 7 }] }',
      'at: [{ q: -3, r: 7, zz: 1 }, { q: -4, r: 7 }] }',
      true,
    ],
    [
      'an option',
      '          - id: troupe\n',
      '          - id: troupe\n            zz: 1\n',
      true,
    ],
    [
      'a door binding',
      '    doorBindings:\n      gate-wall-door:\n',
      '    doorBindings:\n      gate-wall-door:\n        zz: 1\n',
      true,
    ],
  ];

  it.each(LEVELS)(
    'an unknown field on %s imports and is written back byte for byte',
    (_level, anchor, carried, inDraft) => {
      expect(served).toContain(anchor);
      const text = served.replace(anchor, carried);
      const result = read(text);
      expect(exportDraftYaml(result, result.key)).toBe(text);
      if (!inDraft) return;
      // The draft holds it too: with no file to splice into (a draft restored
      // from storage after a reload), the canonical encoding still writes it.
      const restored = parseRoomDocumentJson(
        stringifyRoomDraft(
          { ...result.draft, sourceRef: undefined },
          result.scope
        )
      );
      const canonical = parse(exportDraftYaml(restored, result.key));
      expect(JSON.stringify(canonical)).toContain('"zz":1');
      expect(JSON.stringify(parse(text))).toContain('"zz":1');
    }
  );

  it('an edit through the studio’s own helpers keeps a carried field on what it edits', () => {
    const text = served.replace(
      '      gate-1:\n',
      '      gate-1:\n        zz: 1\n'
    );
    const result = read(text);
    const binding = result.draft.room.monsterBindings!['gate-1'];
    const edited = setMonsterFaction(
      setMonsterTemper(binding, 'coward'),
      'loyalists'
    )!;
    const draft = {
      ...result.draft,
      room: {
        ...result.draft.room,
        monsterBindings: {
          ...result.draft.room.monsterBindings,
          'gate-1': edited,
        },
      },
    };
    const saved = parse(
      exportDraftYaml({ draft, scope: result.scope }, result.key)
    );
    expect(saved.room.room.monsterBindings['gate-1']).toMatchObject({
      zz: 1,
      faction: 'loyalists',
      temper: 'coward',
    });
  });

  it('a door state change and an option edit keep a carried field too', () => {
    const text = served
      .replace(
        '    doorBindings:\n      gate-wall-door:\n',
        '    doorBindings:\n      gate-wall-door:\n        zz: 1\n'
      )
      .replace(
        '          - id: troupe\n',
        '          - id: troupe\n            zz: 2\n'
      );
    const result = read(text);
    const room = result.draft.room;
    const door = setDoorBindingState(
      room.doorBindings!['gate-wall-door'],
      'open'
    )!;
    const captain = room.monsterBindings!.captain;
    const options = captain.options!.map((o) =>
      o.id === 'troupe' ? patchOption(o, { say: 'We play tonight.' }) : o
    );
    const draft = {
      ...result.draft,
      room: {
        ...room,
        doorBindings: { ...room.doorBindings, 'gate-wall-door': door },
        monsterBindings: {
          ...room.monsterBindings,
          captain: normalizeBinding({ ...captain, options })!,
        },
      },
    };
    const saved = parse(
      exportDraftYaml({ draft, scope: result.scope }, result.key)
    );
    const gate = saved.room.room.doorBindings['gate-wall-door'];
    expect(gate).toMatchObject({ zz: 1 });
    expect(gate).not.toHaveProperty('closed');
    expect(
      saved.room.room.monsterBindings.captain.options.find(
        (o: { id: string }) => o.id === 'troupe'
      )
    ).toMatchObject({ zz: 2, say: 'We play tonight.' });
  });

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
