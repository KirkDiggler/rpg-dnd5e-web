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
  dungeonSourceLost,
  forgetDungeonSources,
} from '../world-building/dungeonSources';
import {
  interactionApproach,
  setInteractionApproach,
} from '../world-building/interactionApproach';
import {
  normalizeBinding,
  setMonsterFaction,
  setMonsterTemper,
} from '../world-building/monsterOrderEdits';
import { patchOption } from '../world-building/optionEdits';
import type { RoomDraft } from '../world-building/roomDraft';
import {
  loadRoomDraft,
  parseRoomDocumentJson,
  saveRoomDraft,
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

  // The served castle's gate now holds by `posts:` (rpg-api#1218); the S1c
  // fixture still carries the `states:` shape this case covers.
  it('a state with an invented future field imports and round-trips, through an edit too', () => {
    const text = posts.replace(
      '          posted:\n            blocks: true\n',
      '          posted:\n            foo: 1\n            blocks: true\n'
    );
    expect(text).not.toBe(posts);
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
  const LEVELS: [string, string, string, boolean, string][] = [
    ['the root', 'key: ', 'zz: 1\nkey: ', true, served],
    ['the play contract', 'play:\n', 'play:\n  zz: 1\n', false, served],
    [
      'the coordinate frame',
      '  coordinateFrame:\n',
      '  coordinateFrame:\n    zz: 1\n',
      true,
      served,
    ],
    [
      'the room',
      '    implicitRegionId: room-1-region\n',
      '    implicitRegionId: room-1-region\n    zz: 1\n',
      true,
      served,
    ],
    [
      'a stat block',
      '  guard:\n    base: dnd5e:monsters:human\n',
      '  guard:\n    zz: 1\n    base: dnd5e:monsters:human\n',
      true,
      served,
    ],
    ['a bundle', '  pursuer:\n', '  pursuer:\n    zz: 1\n', true, served],
    [
      'a table row',
      '        toward: { at: { q: 10, r: -19 } }\n',
      '        toward: { at: { q: 10, r: -19 } }\n        zz: 1\n',
      true,
      posts,
    ],
    [
      'a row’s cell',
      'toward: { at: { q: 10, r: -19 } }',
      'toward: { at: { q: 10, r: -19, zz: 1 } }',
      true,
      posts,
    ],
    [
      'a faction',
      '  - id: garrison\n    mind: captain\n',
      '  - id: garrison\n    zz: 1\n    mind: captain\n',
      true,
      served,
    ],
    [
      'a disposition',
      '  - between:\n',
      '  - zz: 1\n    between:\n',
      true,
      served,
    ],
    [
      'an intel record',
      '  - id: cooks-ledger\n',
      '  - id: cooks-ledger\n    zz: 1\n',
      true,
      served,
    ],
    [
      'an exit',
      '  - id: postern\n    cell:\n',
      '  - id: postern\n    zz: 1\n    cell:\n',
      true,
      served,
    ],
    [
      'an ending',
      '  - id: king-slain\n',
      '  - id: king-slain\n    zz: 1\n',
      true,
      served,
    ],
    [
      'a scene item',
      '      - id: altar\n',
      '      - id: altar\n        zz: 1\n',
      true,
      served,
    ],
    [
      'a prop declaration',
      '      altar:\n        blocksMovement: true\n',
      '      altar:\n        zz: 1\n        blocksMovement: true\n',
      true,
      served,
    ],
    [
      'a wall',
      '      - id: gate-wall\n',
      '      - id: gate-wall\n        zz: 1\n',
      true,
      served,
    ],
    [
      'a region',
      '      - id: room-1-region\n',
      '      - id: room-1-region\n        zz: 1\n',
      true,
      served,
    ],
    [
      'a placement',
      '      - id: pedlar\n',
      '      - id: pedlar\n        zz: 1\n',
      true,
      served,
    ],
    [
      'a binding',
      '      gate-1:\n',
      '      gate-1:\n        zz: 1\n',
      true,
      served,
    ],
    [
      'a state',
      '          posted:\n            blocks: true\n',
      '          posted:\n            zz: 1\n            blocks: true\n',
      true,
      posts,
    ],
    [
      'a transition',
      '              - { on: fact, when: { fact: guards-turned }, to: turned, reason: the garrison turned }\n',
      '              - { on: fact, when: { fact: guards-turned }, to: turned, reason: the garrison turned, zz: 1 }\n',
      true,
      posts,
    ],
    [
      'a holds.at cell',
      'at: [{ q: -3, r: 7 }, { q: -4, r: 7 }]',
      'at: [{ q: -3, r: 7, zz: 1 }, { q: -4, r: 7 }]',
      true,
      posts,
    ],
    [
      'an option',
      '          - id: troupe\n',
      '          - id: troupe\n            zz: 1\n',
      true,
      served,
    ],
    [
      'a door binding',
      '    doorBindings:\n      gate-wall-door:\n',
      '    doorBindings:\n      gate-wall-door:\n        zz: 1\n',
      true,
      served,
    ],
    // The served castle's own shapes since rpg-api#1218.
    [
      'a post',
      '          posted:\n            door: gate-wall-door\n',
      '          posted:\n            zz: 1\n            door: gate-wall-door\n',
      true,
      served,
    ],
    [
      'an interaction state',
      '        warned-guest:\n          transitions:\n',
      '        warned-guest:\n          zz: 1\n          transitions:\n',
      true,
      served,
    ],
    [
      'an option’s advance',
      '              failure: guest-failed\n',
      '              failure: guest-failed\n              zz: 1\n',
      true,
      served,
    ],
  ];

  it.each(LEVELS)(
    'an unknown field on %s imports and is written back byte for byte',
    (_level, anchor, carried, inDraft, fixture) => {
      expect(fixture).toContain(anchor);
      const text = fixture.replace(anchor, carried);
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
    const gate1 = room.monsterBindings!['gate-1'];
    const options = gate1.options!.map((o) =>
      o.id === 'troupe' ? patchOption(o, { say: 'We play tonight.' }) : o
    );
    const draft = {
      ...result.draft,
      room: {
        ...room,
        doorBindings: { ...room.doorBindings, 'gate-wall-door': door },
        monsterBindings: {
          ...room.monsterBindings,
          'gate-1': normalizeBinding({ ...gate1, options })!,
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
      saved.room.room.monsterBindings['gate-1'].options.find(
        (o: { id: string }) => o.id === 'troupe'
      )
    ).toMatchObject({ zz: 2, say: 'We play tonight.' });
  });

  describe('a placement list edit keeps each placement’s own fields (the review’s probe)', () => {
    const moods = served
      .replace(
        '      - id: prisoner-3\n',
        '      - id: prisoner-3\n        mood: three\n'
      )
      .replace(
        '      - id: prisoner-4\n',
        '      - id: prisoner-4\n        mood: four\n'
      );
    type Declared = RoomDraft['room']['monsterDeclarations'];
    const exportWith = (edit: (declared: Declared) => Declared) => {
      const result = read(moods);
      const room = result.draft.room;
      const declared = edit([...room.monsterDeclarations]);
      const ids = new Set(declared.map((m) => m.id));
      const bindings = Object.fromEntries(
        Object.entries(room.monsterBindings ?? {}).filter(([id]) => ids.has(id))
      );
      const draft = {
        ...result.draft,
        room: {
          ...room,
          monsterDeclarations: declared,
          monsterBindings: bindings,
        },
      };
      const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
      const placed = (
        parse(saved).room.room.monsterDeclarations as {
          id: string;
          mood?: string;
        }[]
      ).filter((m) => m.id.startsWith('prisoner'));
      return { saved, moods: placed.map((m) => `${m.id}:${m.mood ?? '-'}`) };
    };

    it('deleting prisoner-2 leaves prisoner-3 and prisoner-4 their own moods', () => {
      const { saved, moods: placed } = exportWith((d) =>
        d.filter((m) => m.id !== 'prisoner-2')
      );
      expect(placed).toEqual([
        'prisoner-1:-',
        'prisoner-3:three',
        'prisoner-4:four',
      ]);
      expect(saved).not.toContain('id: prisoner-2\n');
    });

    it('a placement added at the front leaves every other its own fields', () => {
      const { moods: placed } = exportWith((d) => [
        { ...d.find((m) => m.id === 'prisoner-1')!, id: 'prisoner-0' },
        ...d,
      ]);
      expect(placed).toEqual([
        'prisoner-0:-',
        'prisoner-1:-',
        'prisoner-2:-',
        'prisoner-3:three',
        'prisoner-4:four',
      ]);
    });

    it('reversing the placements moves each with its own fields', () => {
      const { moods: placed } = exportWith((d) => [...d].reverse());
      expect(placed).toEqual([
        'prisoner-4:four',
        'prisoner-3:three',
        'prisoner-2:-',
        'prisoner-1:-',
      ]);
    });
  });

  it('after a reload the draft finds its file in storage and still writes it back byte for byte', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const result = read(served);
    expect(saveRoomDraft(storage, result.draft, result.scope)).toBeNull();
    forgetDungeonSources();
    expect(dungeonSourceLost(result.draft)).toBe(true);
    const loaded = loadRoomDraft(storage, result.draft);
    expect(loaded.error).toBeFalsy();
    expect(dungeonSourceLost(loaded.value)).toBe(false);
    expect(
      exportDraftYaml({ draft: loaded.value, scope: loaded.scope }, result.key)
    ).toBe(served);
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

/**
 * THE ENTRANCE REMEMBERS (rpg-project#922, Gate S2 of #769): the compiler now
 * reads a `requires` LIST, an `{ interaction: { id, in } }` requirement, an
 * option's `advance`, and a root `interactions:` map, and the served castle
 * (rpg-api#1218) authors all four. The studio loads it, edits around it, and
 * writes it back as written.
 */
describe('the entrance-remembers grammar loads and writes back (rpg-project#922)', () => {
  /** The castle's own text for each new form, cut from the fixture. */
  const between = (from: string, to: string) => {
    const start = served.indexOf(from);
    return served.slice(start, served.indexOf(to, start));
  };
  const ROOT_INTERACTIONS = between(
    '\ninteractions:\n',
    '\nbehaviorDefinitions:\n'
  );
  const TROUPE_REQUIRES = `            requires:
              - fact: feast-tonight
              - interaction:
                  id: front-gate
                  in: [fresh, warned-guest]
            advance:
              interaction: front-gate
              success: admitted
              failure: troupe-failed
`;
  // The castle authors no `not` of an interaction; the captain's stand-aside
  // gets one here, withheld once the party is arrested.
  const STAND_ASIDE_REQUIRES = `            requires:
              not:
                interaction: { id: front-gate, in: [arrested] }
`;
  const gate = served.replace(
    '            say: Stand aside or bleed.\n',
    `            say: Stand aside or bleed.\n${STAND_ASIDE_REQUIRES}`
  );

  type Parsed = {
    interactions: unknown;
    room: {
      room: {
        monsterBindings: Record<
          string,
          { options?: { id: string; requires?: unknown; advance?: unknown }[] }
        >;
      };
    };
  };
  /** The parts of a parsed file this grammar touches, on every gate speaker. */
  const grammarOf = (doc: Parsed) => ({
    interactions: doc.interactions,
    speakers: ['gate-1', 'gate-2', 'captain'].map((speaker) =>
      doc.room.room.monsterBindings[speaker].options!.map((o) => ({
        id: o.id,
        requires: o.requires,
        advance: o.advance,
      }))
    ),
  });

  it('the served castle carries every new form', () => {
    expect(ROOT_INTERACTIONS).toContain('  front-gate:\n');
    expect(served.split(TROUPE_REQUIRES)).toHaveLength(4);
    expect(gate).toContain(STAND_ASIDE_REQUIRES);
    const captain = parse(gate).room.room.monsterBindings.captain.options;
    const option = (id: string) =>
      captain.find((o: { id: string }) => o.id === id);
    expect(option('troupe')).toMatchObject({
      requires: [
        { fact: 'feast-tonight' },
        { interaction: { id: 'front-gate', in: ['fresh', 'warned-guest'] } },
      ],
      advance: {
        interaction: 'front-gate',
        success: 'admitted',
        failure: 'troupe-failed',
      },
    });
    expect(option('guest').requires).toEqual([
      { interaction: { id: 'front-gate', in: ['fresh', 'warned-troupe'] } },
    ]);
    expect(option('stand-aside').requires).toEqual({
      not: { interaction: { id: 'front-gate', in: ['arrested'] } },
    });
  });

  it('imports, keeps each list as a list, and an unedited download is byte-identical', () => {
    for (const text of [served, gate]) {
      const result = read(text);
      expect(exportDraftYaml(result, result.key)).toBe(text);
    }
    const result = read(gate);
    const options = result.draft.room.monsterBindings!.captain.options!;
    const troupe = options.find((o) => o.id === 'troupe')!;
    expect(troupe.requires).toEqual([
      { fact: 'feast-tonight' },
      { interaction: { id: 'front-gate', in: ['fresh', 'warned-guest'] } },
    ]);
    expect(troupe).toHaveProperty('advance', {
      interaction: 'front-gate',
      success: 'admitted',
      failure: 'troupe-failed',
    });
    expect(options.find((o) => o.id === 'guest')!.requires).toEqual([
      { interaction: { id: 'front-gate', in: ['fresh', 'warned-troupe'] } },
    ]);
  });

  it('an unrelated edit and an edit of the gated line keep requires, interaction, advance and interactions byte for byte', () => {
    const result = read(gate);
    const room = result.draft.room;
    const captain = room.monsterBindings!.captain;
    const options = captain.options!.map((o) =>
      o.id === 'troupe' ? patchOption(o, { say: 'We play tonight.' }) : o
    );
    const draft = structuredClone({
      ...result.draft,
      room: {
        ...room,
        monsterBindings: {
          ...room.monsterBindings,
          captain: normalizeBinding({ ...captain, options })!,
        },
      },
    });
    draft.room.monsterDeclarations.find(
      (m) => m.id === 'pedlar'
    )!.startingCell!.location.q += 1;
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(changedLines(gate, saved)).toEqual([
      '            q: 1',
      '            say: We play tonight.',
    ]);
    expect(saved).toContain(ROOT_INTERACTIONS);
    expect(saved.split(TROUPE_REQUIRES)).toHaveLength(4);
    expect(saved).toContain(STAND_ASIDE_REQUIRES);
    // It re-parses, and re-imports with the same grammar.
    expect(grammarOf(parse(saved))).toEqual(grammarOf(parse(gate)));
    const again = read(saved);
    expect(exportDraftYaml(again, again.key)).toBe(saved);
  });

  it('a draft restored from storage (no file to splice into) still writes the grammar', () => {
    const result = read(gate);
    const restored = parseRoomDocumentJson(
      stringifyRoomDraft(
        { ...result.draft, sourceRef: undefined },
        result.scope
      )
    );
    const canonical = exportDraftYaml(restored, result.key);
    expect(grammarOf(parse(canonical))).toEqual(grammarOf(parse(gate)));
  });

  // Each edit lands on gate-1's troupe, its options[1], the first in the file.
  it.each([
    [
      'a two-key predicate in the list',
      '              - fact: feast-tonight\n',
      '              - { fact: feast-tonight, holds: lute }\n',
      'gate-1 options[1].requires[0]: an option requires one or a list of',
    ],
    [
      'an interaction naming no state',
      '                  in: [fresh, warned-guest]\n',
      '                  in: []\n',
      'gate-1 options[1].requires[1].interaction: an interaction predicate lists no state',
    ],
    [
      'an interaction naming no id',
      '                  id: front-gate\n                  in: [fresh, warned-guest]\n',
      '                  in: [fresh, warned-guest]\n',
      'gate-1 options[1].requires[1].interaction: an interaction predicate does not say which interaction',
    ],
    [
      'an interaction with an unknown key',
      '                  id: front-gate\n                  in: [fresh, warned-guest]\n',
      '                  id: front-gate\n                  at: gate\n                  in: [fresh, warned-guest]\n',
      'gate-1 options[1].requires[1].interaction.at: field at not found',
    ],
    [
      'an empty requires list',
      TROUPE_REQUIRES,
      '            requires: []\n',
      'gate-1 options[1].requires: this requires lists nothing — write a predicate, or drop the requires',
    ],
  ])('%s is refused as the compiler refuses it', (_name, from, to, refusal) => {
    expect(served).toContain(from);
    const result = readDraftYaml(served.replace(from, to));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toContain(refusal);
  });

  it('a list of one is named as the engine names it, without an index', () => {
    const result = readDraftYaml(
      served.replace(
        '                  in: [fresh, warned-troupe]\n',
        '                  in: []\n'
      )
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.refusal).toContain(
        'gate-1 options[0].requires.interaction: an interaction predicate lists no state'
      );
  });
});

/**
 * THE GUARD OPENS THE CONVERSATION (rpg-project#923, Gate S3 of #769): an
 * interaction's `approach: { within: N }` and a machine's `on: approached`
 * row, as the served castle (rpg-api 83a487a8) authors them: the distance on
 * `front-gate`, a hail row on each gate guard's and the captain's machine.
 */
describe('the hail grammar loads, edits and writes back (rpg-project#923)', () => {
  const APPROACH = '    approach: { within: 2 }\n';
  const HAIL_ROW = `            - on: approached
              do:
                - pick: approached
`;
  const hailed = served;

  type Parsed = {
    interactions: Record<string, { approach?: unknown; recipe: unknown }>;
    behaviorDefinitions: unknown;
  };

  it('the served castle carries both new forms', () => {
    expect(hailed.split(APPROACH)).toHaveLength(2);
    // gate-1, gate-2, the captain, and the post that shares his machine.
    expect(hailed.split(HAIL_ROW).length - 1).toBeGreaterThanOrEqual(3);
    const doc = parse(hailed) as Parsed;
    expect(doc.interactions['front-gate'].approach).toEqual({ within: 2 });
  });

  it('imports, reads the distance, and an unedited download is byte-identical', () => {
    const result = read(hailed);
    expect(interactionApproach(result.scope, 'front-gate')).toBe(2);
    expect(exportDraftYaml(result, result.key)).toBe(hailed);
  });

  it('changing the distance rewrites its own line and nothing else', () => {
    const result = read(hailed);
    const scope = setInteractionApproach(result.scope, 'front-gate', 1);
    const saved = exportDraftYaml({ draft: result.draft, scope }, result.key);
    expect(changedLines(hailed, saved)).toEqual([
      '    approach: { within: 1 }',
    ]);
    expect(saved).toContain(HAIL_ROW);
    const again = read(saved);
    expect(interactionApproach(again.scope, 'front-gate')).toBe(1);
    expect(exportDraftYaml(again, again.key)).toBe(saved);
  });

  it('a distance authored where there was none keeps the recipe and the hail row', () => {
    const plain = hailed.replace(APPROACH, '');
    const result = read(plain);
    expect(interactionApproach(result.scope, 'front-gate')).toBeUndefined();
    const scope = setInteractionApproach(result.scope, 'front-gate', 2);
    const saved = exportDraftYaml({ draft: result.draft, scope }, result.key);
    const before = parse(plain) as Parsed;
    const after = parse(saved) as Parsed;
    expect(after.interactions['front-gate']).toEqual({
      ...before.interactions['front-gate'],
      approach: { within: 2 },
    });
    expect(after.behaviorDefinitions).toEqual(before.behaviorDefinitions);
    expect(saved).toContain(HAIL_ROW);
  });

  it('clearing the distance drops the approach and keeps the interaction', () => {
    const result = read(hailed);
    const scope = setInteractionApproach(result.scope, 'front-gate', null);
    const saved = exportDraftYaml({ draft: result.draft, scope }, result.key);
    const after = parse(saved) as Parsed;
    expect(after.interactions['front-gate']).not.toHaveProperty('approach');
    expect(after.interactions['front-gate'].recipe).toEqual(
      (parse(hailed) as Parsed).interactions['front-gate'].recipe
    );
  });

  it('a draft restored from storage still writes the distance and the hail row', () => {
    const result = read(hailed);
    const restored = parseRoomDocumentJson(
      stringifyRoomDraft(
        { ...result.draft, sourceRef: undefined },
        result.scope
      )
    );
    const canonical = parse(exportDraftYaml(restored, result.key)) as Parsed;
    const original = parse(hailed) as Parsed;
    expect(canonical.interactions).toEqual(original.interactions);
    expect(canonical.behaviorDefinitions).toEqual(original.behaviorDefinitions);
  });

  it.each([0, 4, 1.5])('refuses a distance of %s', (within) => {
    const result = read(hailed);
    expect(() =>
      setInteractionApproach(result.scope, 'front-gate', within)
    ).toThrow(
      'interactions.front-gate.approach.within: A hail distance is a whole number of cells from 1 to 3'
    );
  });
});
