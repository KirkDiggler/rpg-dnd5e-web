import { describe, expect, it } from 'vitest';
import { createRoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';

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
    // The version seam lands BEFORE either wave's keys: the authored door
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
    // and so is a version nobody has agreed on.
    expect(() => decodeSingleRoomDungeon(`${asV4}\nfactions: []\n`)).toThrow(
      /Unsupported single-room field/
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
});
