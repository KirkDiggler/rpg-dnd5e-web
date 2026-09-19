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

  it('refuses an orphan binding and carries every other binding key', () => {
    // A binding naming a creature that is gone is REFUSED, not silently
    // dropped — the discipline `propDeclarations` already keeps, and the
    // reason it survives rpg-project#481 R3: a binding hangs off a marker on
    // the canvas, and one whose creature is gone has no marker and no editor
    // that can reach it. "Can't draw", which is this codec's own call.
    expect(() =>
      decodeSingleRoomDungeon(
        `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      long-gone:\n        actions: ['dnd5e:weapons:scimitar']\n`
      )
    ).toThrow(/Monster binding owner does not exist: long-gone/);
    // `temper` is carried as written (rpg-dnd5e-web#1145). Whether one word
    // beats a faction's mix is `RoomMonsterBinding.Temper`'s rule, enforced
    // where that type lives.
    const withTemper = decodeSingleRoomDungeon(
      `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        temper: coward\n`
    );
    expect(withTemper.draft.room.monsterBindings?.['goblin-1'].temper).toBe(
      'coward'
    );
    // `intimidate` is a `PlaceSpec` field this dialect's binding does not
    // model. It travels to the compiler rather than stopping the file, and
    // survives the round trip byte-for-byte.
    const source = `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        intimidate: {dc: 12}\n`;
    const held = decodeSingleRoomDungeon(source);
    expect(held.draft.room.monsterBindings?.['goblin-1'].intimidate).toEqual({
      dc: 12,
    });
    const emitted = encodeSingleRoomDungeon({
      key: held.key,
      draft: held.draft,
    });
    expect(emitted).toContain('intimidate:');
    expect(decodeSingleRoomDungeon(emitted)).toEqual(held);
  });

  it('carries an answer table this build cannot roll, for the engine to grade', () => {
    const withOn = (on: string) =>
      `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        on:\n${on}\n`;
    const on = (source: string) =>
      decodeSingleRoomDungeon(source).draft.room.monsterBindings?.['goblin-1']
        .on;

    // An unknown trigger, an action word on a social key, an entry that does
    // nothing and an empty trigger list: four of `dungeonspec`'s refusals,
    // and `dungeonspec` is where an author now meets them.
    expect(on(withOn('          taunted: [{say: hi}]'))).toEqual({
      taunted: [{ say: 'hi' }],
    });
    expect(on(withOn('          intimidated: [{attack: enemy}]'))).toEqual({
      intimidated: [{ attack: 'enemy' }],
    });
    expect(on(withOn('          intimidated: [{}]'))).toEqual({
      intimidated: [{}],
    });
    expect(on(withOn('          intimidated: []'))).toEqual({
      intimidated: [],
    });
  });

  it('round-trips an unknown answer key through the codec untouched', () => {
    // THE PROPERTY THE WHOLE SLICE RESTS ON (rpg-project#481 R3): a key the
    // builder has never heard of goes in, comes back out, and the bytes it
    // emits are the bytes the compiler grades — which is what lets the
    // compiler name it at its own path instead of the builder guessing.
    const source = `version: 4\nkey: crypt-room\n${PLAY_BLOCK}\n${ROOM_BLOCK}\n    monsterBindings:\n      goblin-1:\n        on:\n          intimidated:\n            - {say: 'Fine.', fcat: goblin-cowed, wibble: 3}\n`;
    const decoded = decodeSingleRoomDungeon(source);
    expect(decoded.draft.room.monsterBindings?.['goblin-1'].on).toEqual({
      intimidated: [{ say: 'Fine.', fcat: 'goblin-cowed', wibble: 3 }],
    });
    const emitted = encodeSingleRoomDungeon({
      key: decoded.key,
      draft: decoded.draft,
    });
    expect(emitted).toContain('fcat: goblin-cowed');
    expect(emitted).toContain('wibble: 3');
    // Settled: a second pass moves nothing.
    expect(decodeSingleRoomDungeon(emitted)).toEqual(decoded);
    expect(
      encodeSingleRoomDungeon({
        key: decoded.key,
        draft: decodeSingleRoomDungeon(emitted).draft,
      })
    ).toBe(emitted);
  });
});
