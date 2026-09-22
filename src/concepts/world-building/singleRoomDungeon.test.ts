import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRoomDraft, type RoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';

/** The canonical writer's output for a document with NO v4 key, captured from
 * the encoder as it stood before this slice (rpg-dnd5e-web#1136) and committed
 * byte-accurate. This is the one test the issue says not to skip: the file
 * format is the expensive thing to walk back. */
const readV3Golden = () =>
  readFileSync(
    'src/concepts/world-building/fixtures/singleRoomV3.golden.yaml',
    'utf8'
  );

/** The golden's own draft: a room with a prop, a start and one actor, and none
 * of the new keys. */
function goldenDraft(): RoomDraft {
  const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
  draft.scene.items.push({
    id: 'prop-1',
    kind: 'prop',
    assetRef: 'dnd5e:props:torture-table',
    label: 'table',
    transform: { x: -2.25, y: 1.2, z: 1.3, rotationY: 0.37 },
    heightScale: 1.5,
  });
  draft.room.partyStart = { q: 0, r: 0 };
  draft.room.monsters = [
    {
      id: 'skeleton-a',
      ref: 'dnd5e:monsters:skeleton',
      cell: { q: 2, r: -1 },
    },
  ];
  return draft;
}

/** The room block of every hand-written site document below. */
const ROOM_BLOCK = `room:
  version: 3
  id: room-1
  name: Crypt
  coordinateFrame: {horizontalPlane: world-xz, verticalAxis: world-y-up, distanceUnit: world-scene-unit, hexRadius: 1, footprintFrame: owner-local-xz}
  workspace: {hexRadius: 6, horizontalLimit: 12}
  scene: {version: 1, id: scene-1, name: Crypt, items: [], groups: []}
  room:
    implicitRegionId: room-1-region
    walkableHexes: [{q: 0, r: 0}]
    propDeclarations: {}
    arrangementDeclarations: {}
    monsters:
      - {id: goblin-1, ref: 'dnd5e:monsters:goblin', cell: {q: 2, r: -1}, faction: goblins}`;

const PLAY_BLOCK = `play: {void: transparent, lighting: bright, standing: centre-covered}`;

describe('single-room dungeon source', () => {
  it('round trips the complete v3 draft and fixed play contract', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft.scene.items.push({
      id: 'prop-1',
      kind: 'prop',
      assetRef: 'dnd5e:props:torture-table',
      label: 'table',
      transform: { x: -2.25, y: 1.2, z: 1.3, rotationY: 0.37 },
      heightScale: 1.5,
    });
    draft.room.partyStart = { q: 0, r: 0 };
    draft.room.monsters = [
      {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:skeleton',
        cell: { q: 2, r: -1 },
      },
    ];
    const decoded = decodeSingleRoomDungeon(
      encodeSingleRoomDungeon({ key: 'crypt-room', draft })
    );
    expect(decoded.key).toBe('crypt-room');
    expect(decoded.draft).toEqual(draft);
  });

  it('refuses a malformed or legacy root without substituting a draft', () => {
    expect(() => decodeSingleRoomDungeon('version: 2\nkey: old')).toThrow(
      /Unsupported single-room source envelope/
    );
    expect(() =>
      decodeSingleRoomDungeon('version: 3\nkey: room\nplay: {}\nroom: {}')
    ).toThrow();
  });

  it('accepts the v4 root ahead of its keys, without loosening strictness', () => {
    // The version seam landed BEFORE either wave's keys: the authored door
    // wants `doorBindings` at v4 (rpg-project#468) and this slice wants the
    // site scope and `monsterBindings` (rpg-project#477). Landing the bump
    // once is what stops them both bumping, so a v4 root carrying only v3
    // keys is a valid document and must decode.
    const draft = createRoomDraft(createEmptyScene('scene-v4'), 'room-v4');
    const asV4 = encodeSingleRoomDungeon({ key: 'crypt-room', draft }).replace(
      'version: 3',
      'version: 4'
    );
    expect(decodeSingleRoomDungeon(asV4).key).toBe('crypt-room');

    // The version does not buy leniency: an unknown root key is still refused,
    // and so is a version nobody has agreed on. `factions` is no longer the
    // probe — it is a key this slice lands — so the probe is a key the design
    // explicitly does NOT have yet.
    expect(() => decodeSingleRoomDungeon(`${asV4}\nkind: dungeon\n`)).toThrow(
      /Unsupported single-room field: kind/
    );
    expect(() => decodeSingleRoomDungeon('version: 5\nkey: room')).toThrow(
      /Unsupported single-room source envelope/
    );
  });

  it('decodes the fixed play contract in any YAML mapping order', () => {
    const reordered = `version: 3
room:
  version: 3
  id: room-1
  name: Workshop
  coordinateFrame:
    horizontalPlane: world-xz
    verticalAxis: world-y-up
    distanceUnit: world-scene-unit
    hexRadius: 1
    footprintFrame: owner-local-xz
  workspace: {hexRadius: 6, horizontalLimit: 12}
  scene:
    version: 1
    id: scene-1
    name: Workshop
    items: []
    groups: []
  room:
    implicitRegionId: room-1-region
    monsters:
      - {id: skeleton-a, ref: 'dnd5e:monsters:skeleton', cell: {q: 2, r: -1}}
    walkableHexes: [{q: 0, r: 0}, {q: 1, r: 0}]
    propDeclarations: {}
    arrangementDeclarations: {}
    partyStart: {r: 0, q: 0}
key: crypt-room
play:
  standing: centre-covered
  lighting: bright
  void: transparent
`;
    const decoded = decodeSingleRoomDungeon(reordered);
    expect(decoded.key).toBe('crypt-room');
    expect(decoded.draft.version).toBe(3);
    expect(decoded.draft.room.partyStart).toEqual({ q: 0, r: 0 });
    expect(decoded.draft.room.monsters).toEqual([
      {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:skeleton',
        cell: { q: 2, r: -1 },
      },
    ]);

    // Re-encoding the decoded draft and re-decoding stays byte-stable in
    // meaning: the canonical writer's field order is not load-bearing.
    const reencoded = encodeSingleRoomDungeon({
      key: 'crypt-room',
      draft: decoded.draft,
    });
    expect(decodeSingleRoomDungeon(reencoded)).toEqual(decoded);
  });

  it('refuses unknown root and play fields instead of accepting them', () => {
    expect(() =>
      decodeSingleRoomDungeon(
        'version: 3\nkey: room\nboss: null\nplay: {void: transparent, lighting: bright, standing: centre-covered}\nroom: {version: 3}'
      )
    ).toThrow(/Unsupported single-room field: boss/);
    expect(() =>
      decodeSingleRoomDungeon(
        'version: 3\nkey: room\nplay: {void: transparent, lighting: bright, standing: centre-covered, seating: 4}\nroom: {version: 3}'
      )
    ).toThrow(/Unsupported single-room play field: seating/);
    expect(() =>
      decodeSingleRoomDungeon(
        'version: 3\nkey: room\nplay: {void: opaque, lighting: bright, standing: centre-covered}\nroom: {version: 3}'
      )
    ).toThrow(
      /Unsupported single-room play contract: void must be transparent/
    );
  });

  it('retains structurally valid game-illegal rooms through the round trip', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft.room.walkableHexes = [{ q: 0, r: 0 }];
    draft.room.partyStart = { q: 3, r: -3 };
    draft.room.monsters = [
      {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:skeleton',
        // Off painted floor and overlapping the start: encounter legality is
        // not a client question, so this source stays retainable verbatim.
        cell: { q: 3, r: -3 },
      },
      {
        id: 'not-yet-modeled',
        ref: 'dnd5e:monsters:unknown-thing',
        cell: { q: -2, r: 1 },
      },
    ];
    const decoded = decodeSingleRoomDungeon(
      encodeSingleRoomDungeon({ key: 'crypt-room', draft })
    );
    expect(decoded.draft.room.monsters).toEqual(draft.room.monsters);
    expect(decoded.draft.room.partyStart).toEqual({ q: 3, r: -3 });
  });

  it('emits exactly the bytes it emitted before the v4 keys existed', () => {
    // THE PROOF THE ISSUE SAYS NOT TO SKIP. `singleRoomV3.golden.yaml` is the
    // pre-slice encoder's own output, committed byte-accurate. A site with no
    // `factions`, no `dispositions`, no `faction` and no `monsterBindings`
    // must reproduce it exactly — not "equivalently".
    const emitted = encodeSingleRoomDungeon({
      key: 'crypt-room',
      draft: goldenDraft(),
    });
    expect(emitted).toBe(readV3Golden());
    // The version is the LOWEST that carries the document, and none of the v4
    // keys is present as an empty placeholder.
    expect(emitted.startsWith('version: 3\n')).toBe(true);
    expect(emitted).not.toContain('factions');
    expect(emitted).not.toContain('dispositions');
    expect(emitted).not.toContain('faction');
    expect(emitted).not.toContain('monsterBindings');
  });

  it('treats an empty site scope and empty bindings as absence, not as bytes', () => {
    // "Omitted means none" cuts both ways: an explicitly empty list is the
    // authored state "no factions", so it is neither refused nor written.
    const emitted = encodeSingleRoomDungeon({
      key: 'crypt-room',
      draft: goldenDraft(),
      factions: [],
      dispositions: [],
    });
    expect(emitted).toBe(readV3Golden());

    const decoded = decodeSingleRoomDungeon(
      `${readV3Golden()}factions: []\ndispositions: []\n`
    );
    expect(decoded.factions).toBeUndefined();
    expect(decoded.dispositions).toBeUndefined();
    expect(
      encodeSingleRoomDungeon({ key: decoded.key, draft: decoded.draft })
    ).toBe(readV3Golden());
  });

  it('round trips hand-written monster orders and a creature faction at v4', () => {
    const source = `version: 4
key: crypt-room
${PLAY_BLOCK}
${ROOM_BLOCK}
    monsterBindings:
      goblin-1:
        on:
          intimidated:
            - {weight: 70, say: 'Fine! The cellar door is behind the barrels.', fact: goblin-cowed}
            - {weight: 30, say: 'Boss! BOSS!', flee: {}}
          time:
            - {when: {enemy: reach}, attack: enemy}
        actions: ['dnd5e:weapons:scimitar', 'dnd5e:weapons:shortbow']
`;
    const decoded = decodeSingleRoomDungeon(source);
    expect(decoded.draft.room.monsters[0].faction).toBe('goblins');
    expect(decoded.draft.room.monsterBindings).toEqual({
      'goblin-1': {
        on: {
          intimidated: [
            {
              weight: 70,
              say: 'Fine! The cellar door is behind the barrels.',
              fact: 'goblin-cowed',
            },
            { weight: 30, say: 'Boss! BOSS!', flee: {} },
          ],
          time: [{ when: { enemy: 'reach' }, attack: 'enemy' }],
        },
        actions: ['dnd5e:weapons:scimitar', 'dnd5e:weapons:shortbow'],
      },
    });

    const emitted = encodeSingleRoomDungeon({
      key: decoded.key,
      draft: decoded.draft,
    });
    // A v4 key was present, so the document claims v4 — and it carries the
    // authored values, in the author's own order.
    expect(emitted.startsWith('version: 4\n')).toBe(true);
    expect(emitted).toContain('monsterBindings:');
    expect(emitted).toContain('dnd5e:weapons:shortbow');
    expect(emitted).toContain('faction: goblins');
    // Parse -> emit -> parse is idempotent: the canonical writer's second pass
    // changes nothing.
    expect(decodeSingleRoomDungeon(emitted)).toEqual(decoded);
    expect(
      encodeSingleRoomDungeon({
        key: decoded.key,
        draft: decodeSingleRoomDungeon(emitted).draft,
      })
    ).toBe(emitted);
  });

  it('round trips a hand-written site scope and claims v4 for it alone', () => {
    const source = `version: 4
key: front-room
${PLAY_BLOCK}
factions:
  - id: goblins
    on:
      intimidated:
        - {say: 'Fine!', fact: goblin-cowed}
    temper: {coward: 2, soldier: 1, aggressive: 1}
  - id: bandits
    mind: bandit-chief
dispositions:
  - {between: [goblins, party], stance: hostile, until: {fact: saved-wiseman}}
  - {between: [bandits, party], stance: neutral}
${ROOM_BLOCK}
`;
    const decoded = decodeSingleRoomDungeon(source);
    expect(decoded.factions).toEqual([
      {
        id: 'goblins',
        on: { intimidated: [{ say: 'Fine!', fact: 'goblin-cowed' }] },
        temper: { coward: 2, soldier: 1, aggressive: 1 },
      },
      { id: 'bandits', mind: 'bandit-chief' },
    ]);
    expect(decoded.dispositions).toEqual([
      {
        between: ['goblins', 'party'],
        stance: 'hostile',
        until: { fact: 'saved-wiseman' },
      },
      { between: ['bandits', 'party'], stance: 'neutral' },
    ]);

    const emitted = encodeSingleRoomDungeon({
      key: decoded.key,
      draft: decoded.draft,
      factions: decoded.factions,
      dispositions: decoded.dispositions,
    });
    expect(emitted.startsWith('version: 4\n')).toBe(true);
    expect(emitted).toContain('dispositions:');
    expect(emitted).toContain('temper:');
    expect(decodeSingleRoomDungeon(emitted)).toEqual(decoded);
  });

  it('round trips the front room: intel records, priced checks and a creature in reserve (web#1176)', () => {
    // The driving case: a failed persuasion teaches a fact, and a thug held in
    // reserve by that fact is called in. Every field here is CARRIED — the web
    // keeps the shape and the engine grades it at PutDungeon.
    const source = `version: 4
key: front-room
${PLAY_BLOCK}
factions:
  - {id: goblins}
  - {id: bandits}
dispositions:
  - {between: [goblins, party], stance: neutral}
  - {between: [bandits, party], stance: hostile}
intel:
  - {id: cellar-lie, reveals: {fact: cellar-is-clear}}
${ROOM_BLOCK}
    monsterBindings:
      goblin-1:
        intimidate: [{ability: intimidation, dc: 12}]
        persuade: [{ability: persuasion, dc: 10}]
        holds: [cellar-lie]
        on:
          persuade_failed:
            - {weight: 100, say: "Cellar's empty, friend.", fact: cellar-is-clear}
`;

    const decoded = decodeSingleRoomDungeon(source);
    expect(decoded.intel).toEqual([
      { id: 'cellar-lie', reveals: { fact: 'cellar-is-clear' } },
    ]);
    expect(decoded.draft.room.monsterBindings).toEqual({
      'goblin-1': {
        intimidate: [{ ability: 'intimidation', dc: 12 }],
        persuade: [{ ability: 'persuasion', dc: 10 }],
        holds: ['cellar-lie'],
        on: {
          persuade_failed: [
            {
              weight: 100,
              say: "Cellar's empty, friend.",
              fact: 'cellar-is-clear',
            },
          ],
        },
      },
    });

    const emitted = encodeSingleRoomDungeon({
      key: decoded.key,
      draft: decoded.draft,
      factions: decoded.factions,
      dispositions: decoded.dispositions,
      intel: decoded.intel,
    });
    expect(emitted.startsWith('version: 4\n')).toBe(true);
    expect(emitted).toContain('intel:');
    expect(emitted).toContain('reveals:');
    expect(emitted).toContain('intimidate:');
    expect(emitted).toContain('dc: 12');
    expect(emitted).toContain('holds:');
    // Parse -> emit -> parse is idempotent.
    expect(decodeSingleRoomDungeon(emitted)).toEqual(decoded);
  });

  it('carries a reserve predicate on a creature, in all four forms', () => {
    const withArrives = (predicate: string) =>
      decodeSingleRoomDungeon(
        `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        arrives: ${predicate}\n`
      );
    expect(
      withArrives('{fact: cellar-is-clear}').draft.room.monsterBindings?.[
        'goblin-1'
      ].arrives
    ).toEqual({ fact: 'cellar-is-clear' });
    expect(
      withArrives('{round: 6}').draft.room.monsterBindings?.['goblin-1'].arrives
    ).toEqual({ round: 6 });
    expect(
      withArrives('{down: chief}').draft.room.monsterBindings?.['goblin-1']
        .arrives
    ).toEqual({ down: 'chief' });
    expect(
      withArrives('{stance: {between: [raiders, party], is: neutral}}').draft
        .room.monsterBindings?.['goblin-1'].arrives
    ).toEqual({ stance: { between: ['raiders', 'party'], is: 'neutral' } });
    // Exactly one form, in the predicate's own sentence.
    expect(() => withArrives('{fact: a, round: 2}')).toThrow(/exactly one/);
  });

  it('carries propBindings verbatim, and a prop-only room claims v4', () => {
    // The FOURTH declaration kind (rpg-project#488 R1, rpg-toolkit#1855). The
    // engine DECODES it and REFUSES it at compile until rpg-toolkit#1854, so
    // the web carries it rather than refusing the key: the author must be able
    // to write the block to receive the engine's sentence about it.
    const source = `version: 4
key: tomb-heirloom
${PLAY_BLOCK}
${ROOM_BLOCK}
    propBindings:
      heirloom: {holdable: true}
      letter: {holdable: true, holds: [wisemans-letter], arrives: {round: 6}}
`;
    const decoded = decodeSingleRoomDungeon(source);
    expect(decoded.draft.room.propBindings).toEqual({
      heirloom: { holdable: true },
      letter: {
        holdable: true,
        holds: ['wisemans-letter'],
        arrives: { round: 6 },
      },
    });
    const emitted = encodeSingleRoomDungeon({
      key: decoded.key,
      draft: decoded.draft,
    });
    expect(emitted).toContain('propBindings:');
    expect(decodeSingleRoomDungeon(emitted)).toEqual(decoded);
  });

  it('a room whose only v4 fact is a door still claims v4', () => {
    // The version is a statement about what a file MAY contain. `doorBindings`
    // was missed when the door wave landed, so this emitted `version: 3` while
    // carrying a key v3 has no place for.
    const withDoor = createRoomDraft(
      createEmptyScene('scene-door'),
      'room-door'
    );
    withDoor.scene.items.push({
      id: 'vault-door',
      kind: 'prop',
      assetRef: 'dnd5e:props:books',
      label: 'door',
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
      heightScale: 1,
    });
    withDoor.room.propDeclarations['vault-door'] = {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: { width: 1, depth: 0.2, offsetX: 0, offsetZ: 0 },
    };
    withDoor.room.doorBindings = { 'vault-door': { closed: true } };
    const emitted = encodeSingleRoomDungeon({
      key: 'door-only',
      draft: withDoor,
    });
    expect(emitted.startsWith('version: 4\n')).toBe(true);
    expect(emitted).toContain('doorBindings:');
  });

  it('refuses a malformed intel record and a door reveal, without inventing a target', () => {
    const withIntel = (records: string) =>
      decodeSingleRoomDungeon(
        `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\nintel:\n${records}\n${ROOM_BLOCK}\n`
      );
    expect(() => withIntel('  - {id: vault-map}')).toThrow(/reveals/);
    expect(() => withIntel('  - {id: vault-map, reveals: {}}')).toThrow(
      /reveals nothing/
    );
    // `door` is REFUSED outright in this dialect (rpg-project#488 R3, corrected
    // by rpg-toolkit#1855): the word means something, it needs a crossing to
    // mean it. A record naming a door AND a fact gets the door sentence, because
    // the forbidden word is the thing worth saying.
    expect(() =>
      withIntel('  - {id: vault-map, reveals: {door: vault}}')
    ).toThrow(/concealed door on a crossing/);
    expect(() =>
      withIntel('  - {id: vault-map, reveals: {door: a, fact: b}}')
    ).toThrow(/concealed door on a crossing/);
    expect(() =>
      withIntel(
        '  - {id: vault-map, reveals: {fact: a}}\n  - {id: vault-map, reveals: {fact: b}}'
      )
    ).toThrow(/duplicate intel id/);
  });

  it('refuses an orphan binding and an unknown binding key inside the document', () => {
    // A binding naming a creature that is gone is REFUSED, not silently
    // dropped — the discipline `propDeclarations` already keeps.
    expect(() =>
      decodeSingleRoomDungeon(
        `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      long-gone:\n        actions: ['dnd5e:weapons:scimitar']\n`
      )
    ).toThrow(/Monster binding owner does not exist: long-gone/);
    // `temper` IS accepted, and it is ONE word: the placement's own word wins
    // over its faction's mix (`RoomMonsterBinding.Temper` is a plain string
    // where `FactionSpec.Temper` is a `TemperSpec`).
    const withTemper = decodeSingleRoomDungeon(
      `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        temper: coward\n`
    );
    expect(withTemper.draft.room.monsterBindings?.['goblin-1'].temper).toBe(
      'coward'
    );
    // `intimidate` IS carried since web#1176, so it decodes rather than being
    // refused — and an actually-unknown key is still refused by name.
    const withCheck = decodeSingleRoomDungeon(
      `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        intimidate: [{ ability: intimidation, dc: 12 }]\n`
    );
    expect(
      withCheck.draft.room.monsterBindings?.['goblin-1'].intimidate
    ).toEqual([{ ability: 'intimidation', dc: 12 }]);
    expect(() =>
      decodeSingleRoomDungeon(
        `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        intimidating: {dc: 12}\n`
      )
    ).toThrow(
      /Monster binding for goblin-1 has an unsupported field: intimidating/
    );
  });

  it('refuses an answer table this build cannot roll, in the engine’s own words', () => {
    const withOn = (on: string) =>
      `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        on:\n${on}\n`;
    // An unknown trigger, an action word on a social key, and a missing say on
    // an entry with no word: all three are the vocabulary's sentences.
    expect(() =>
      decodeSingleRoomDungeon(withOn('          taunted: [{say: hi}]'))
    ).toThrow(/"taunted" is not a trigger this build rolls/);
    expect(() =>
      decodeSingleRoomDungeon(
        withOn('          intimidated: [{attack: enemy}]')
      )
    ).toThrow(
      /`attack` is what a creature does with time, and `intimidated` is an outcome/
    );
    expect(() =>
      decodeSingleRoomDungeon(withOn('          intimidated: [{}]'))
    ).toThrow(/this entry does nothing and says nothing/);
    expect(() =>
      decodeSingleRoomDungeon(withOn('          intimidated: []'))
    ).toThrow(/this names a trigger and lists nothing that happens on it/);
  });

  it('round trips the four root keys — exits, endings, scenarios, concealments — verbatim (web#1184)', () => {
    // The carry: a hand-written v4 room whose purpose and secrets are declared
    // at the root. None of them is a thing standing on the floor, so each lives
    // beside `intel`/`factions`, and all four round-trip byte-verbatim with the
    // engine grading them at PutDungeon.
    const source = `version: 4
key: tomb-heirloom
${PLAY_BLOCK}
exits:
  - {id: entrance, cell: {q: 1, r: 3}}
endings:
  - id: held-out
    when: {round: 6}
  - id: turned
    when: {stance: {between: [raiders, party], is: neutral}}
scenarios:
  recover-the-artifact: {artifact: heirloom, exit: entrance}
  hold-out: {convince: raiders}
concealments:
  vault:
    checks: [{ability: perception, dc: 15}]
    cells: [{q: 4, r: 1}]
    props: [vault-door]
intel:
  - {id: vault-map, reveals: {concealment: vault}}
  - {id: wisemans-letter, reveals: {fact: saved-wiseman}}
${ROOM_BLOCK}
`;
    const decoded = decodeSingleRoomDungeon(source);
    expect(decoded.exits).toEqual([{ id: 'entrance', cell: { q: 1, r: 3 } }]);
    expect(decoded.endings).toEqual([
      { id: 'held-out', when: { round: 6 } },
      {
        id: 'turned',
        when: { stance: { between: ['raiders', 'party'], is: 'neutral' } },
      },
    ]);
    expect(decoded.scenarios).toEqual({
      'recover-the-artifact': { artifact: 'heirloom', exit: 'entrance' },
      'hold-out': { convince: 'raiders' },
    });
    expect(decoded.concealments).toEqual({
      vault: {
        checks: [{ ability: 'perception', dc: 15 }],
        cells: [{ q: 4, r: 1 }],
        props: ['vault-door'],
      },
    });
    // A record reveals a CONCEALMENT now (rpg-project#490 R7), not a door.
    expect(decoded.intel).toEqual([
      { id: 'vault-map', reveals: { concealment: 'vault' } },
      { id: 'wisemans-letter', reveals: { fact: 'saved-wiseman' } },
    ]);

    // Re-emitting preserves everything, claims v4, and round-trips identically.
    const emitted = encodeSingleRoomDungeon({
      key: decoded.key,
      draft: decoded.draft,
      intel: decoded.intel,
      exits: decoded.exits,
      endings: decoded.endings,
      scenarios: decoded.scenarios,
      concealments: decoded.concealments,
    });
    expect(emitted.startsWith('version: 4\n')).toBe(true);
    expect(emitted).toContain('exits:');
    expect(emitted).toContain('endings:');
    expect(emitted).toContain('scenarios:');
    expect(emitted).toContain('concealments:');
    expect(decodeSingleRoomDungeon(emitted)).toEqual(decoded);
  });

  it('claims v4 for a room whose only v4 fact is one of the four root keys', () => {
    // The version is a statement about what a file MAY contain. A room whose
    // ONLY new fact is a single exit must claim v4, the same argument a
    // doorBindings-only room makes.
    const onlyExit = `version: 3\nkey: crypt\n${PLAY_BLOCK}\n${ROOM_BLOCK}\nexits:\n  - {id: way-out, cell: {q: 0, r: 0}}\n`;
    const onlyEnding = `version: 3\nkey: crypt\n${PLAY_BLOCK}\n${ROOM_BLOCK}\nendings:\n  - {id: done, when: {down: goblin-1}}\n`;
    const onlyScenario = `version: 3\nkey: crypt\n${PLAY_BLOCK}\n${ROOM_BLOCK}\nscenarios:\n  hold-out: {convince: goblins}\n`;
    const onlyConcealment = `version: 3\nkey: crypt\n${PLAY_BLOCK}\n${ROOM_BLOCK}\nconcealments:\n  vault:\n    checks: [{ability: perception, dc: 15}]\n`;
    for (const source of [
      onlyExit,
      onlyEnding,
      onlyScenario,
      onlyConcealment,
    ]) {
      const decoded = decodeSingleRoomDungeon(source);
      const emitted = encodeSingleRoomDungeon({
        key: decoded.key,
        draft: decoded.draft,
        exits: decoded.exits,
        endings: decoded.endings,
        scenarios: decoded.scenarios,
        concealments: decoded.concealments,
      });
      expect(emitted.startsWith('version: 4\n')).toBe(true);
    }
  });
});
