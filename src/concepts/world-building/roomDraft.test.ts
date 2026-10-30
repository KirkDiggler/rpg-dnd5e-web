import { describe, expect, it } from 'vitest';
import { createPopulatedStudioDocument } from '../encounter-studio/fixtures/studioDocument';
import { createMapLabel } from './mapLabelEdits';
import { createRegion, setRegionLighting } from './regionEdits';
import {
  assertRoomDocumentSize,
  cellOwners,
  cellsInWorldRectangle,
  clearRoomPartyStart,
  createRoomDraft,
  eraseCells,
  floorCellCount,
  floorCells,
  isFloorCell,
  loadRoomDraft,
  MAX_FLOOR_HEXES,
  moveRoomMonster,
  paintCells,
  parseRoomDocumentJson,
  parseRoomDraftJson,
  placeRoomMonster,
  reconcileRoomDraft,
  remapRoomDeclarations,
  removeRoomMonster,
  ROOM_DRAFT_ENVELOPE_VERSION,
  ROOM_DRAFT_STORAGE_KEY,
  saveRoomDraft,
  setRoomMonsterFacing,
  setRoomPartyStart,
  stringifyRoomDraft,
  validateRoomDocument,
  type RoomDraft,
  type RoomPropDeclaration,
} from './roomDraft';
import {
  createEmptyScene,
  duplicateSelection,
  stampArrangement,
} from './sceneState';
import { validateScene } from './serialization';
import type { SiteScope } from './siteScope';
import type { KeyValueStorage } from './types';

describe('room authoring draft', () => {
  it('sets all compass facings and deletes default without altering location or bindings', () => {
    const draft = placeRoomMonster(
      createRoomDraft(createEmptyScene('scene'), 'room'),
      {
        id: 'actor',
        ref: 'dnd5e:monsters:skeleton',
        startingCell: { location: { q: 1, r: 0 } },
      }
    );
    draft.room.monsterBindings = { actor: { faction: 'guards' } };
    expect(setRoomMonsterFacing(draft, 'actor', undefined)).toBe(draft);
    expect(draft.room.monsterDeclarations[0]!.startingCell).not.toHaveProperty(
      'facing'
    );
    for (const facing of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      const next = setRoomMonsterFacing(draft, 'actor', facing);
      expect(next.room.monsterDeclarations[0]!.startingCell).toEqual({
        location: { q: 1, r: 0 },
        facing,
      });
      expect(next.room.monsterBindings).toBe(draft.room.monsterBindings);
      expect(setRoomMonsterFacing(next, 'actor', facing)).toBe(next);
      const defaulted = setRoomMonsterFacing(next, 'actor', undefined);
      expect(defaulted).toEqual(draft);
      expect(
        defaulted.room.monsterDeclarations[0]!.startingCell
      ).not.toHaveProperty('facing');
    }
    expect(() => setRoomMonsterFacing(draft, 'gone', 'n')).toThrow(
      /does not exist/
    );
    for (const invalid of ['', 'default', 'north', 'N'])
      expect(() => setRoomMonsterFacing(draft, 'actor', invalid)).toThrow(
        /facing/
      );
  });
  it('round trips a versioned room envelope separately from composer data', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const painted = paintCells(draft, [{ q: 1, r: -2 }]);
    expect(parseRoomDraftJson(stringifyRoomDraft(painted))).toEqual(painted);
    expect(stringifyRoomDraft(painted)).toContain('rpg-room-authoring-draft');
  });

  // THE CANVAS IS UNBOUNDED (rpg-project#725 R3): the draft carries no
  // workspace, so the old expand/radius-preset tests have nothing to grow.
  // What they guarded — that a stored extent is never invented or clipped —
  // is now that no extent is stored at all, and one sent is refused by name.
  it('carries no workspace, and refuses one by name', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    expect(draft).not.toHaveProperty('workspace');
    expect(JSON.parse(stringifyRoomDraft(draft)).draft).not.toHaveProperty(
      'workspace'
    );
    expect(() =>
      parseRoomDraftJson(
        JSON.stringify({
          kind: 'rpg-room-authoring-draft',
          version: ROOM_DRAFT_ENVELOPE_VERSION,
          draft: { ...draft, workspace: { hexRadius: 6, horizontalLimit: 12 } },
        })
      )
    ).toThrow(
      'room.workspace: the canvas is unbounded and the file carries no workspace (rpg-project#725); remove the key'
    );
  });

  /** THE FRAME STATES ITS SCALE (rpg-dnd5e-web#1311). Before, The Watch
   * Post's `coordinateFrame: {hexRadius: 1}` was refused with "Unsupported
   * room coordinate frame." The engine reads only hexRadius. */
  it('reads a frame that states only its scale, and names a frame word it cannot draw in', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const envelope = (coordinateFrame: unknown) =>
      JSON.stringify({
        kind: 'rpg-room-authoring-draft',
        version: ROOM_DRAFT_ENVELOPE_VERSION,
        draft: { ...draft, coordinateFrame },
      });
    expect(parseRoomDraftJson(envelope({ hexRadius: 1 }))).toEqual(draft);
    expect(() =>
      parseRoomDraftJson(
        envelope({ hexRadius: 1, horizontalPlane: 'world-xy' })
      )
    ).toThrow(
      'Unsupported room coordinate frame: horizontalPlane must be "world-xz", and this file says "world-xy".'
    );
    expect(() => parseRoomDraftJson(envelope({ hexRadius: 2 }))).toThrow(
      'Unsupported room coordinate frame: hexRadius must be 1, and this file says 2.'
    );
    expect(() =>
      parseRoomDraftJson(envelope({ horizontalPlane: 'world-xz' }))
    ).toThrow(
      'Unsupported room coordinate frame: hexRadius is required, and it must be 1.'
    );
  });

  // Envelope 6 is regions-as-floor (rpg-project#725); every earlier envelope
  // stores a walkable list, and is refused by name rather than migrated —
  // the v1/v2 migrations this test used to pin retired with that list.
  it('refuses every envelope before version 6 by name: rebuild, no migration', () => {
    const current = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    for (const version of [1, 2, 3, 4, 5])
      expect(() =>
        parseRoomDraftJson(
          JSON.stringify({
            kind: 'rpg-room-authoring-draft',
            version,
            draft: current,
          })
        )
      ).toThrow(
        `This room authoring draft was saved before regions were the floor (it is a version ${version} envelope, and this build writes version 6), so it stores a walkable list this build no longer reads: rebuild, no migration (rpg-project#725).`
      );
    expect(ROOM_DRAFT_ENVELOPE_VERSION).toBe(6);
  });

  // No extent bounds a room any more (R3): a cell or a prop far from the
  // origin is authored as written. Standalone composer scenes keep +/-12.
  it('accepts far room coordinates and cells while standalone scenes keep +/-12', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft.scene.items.push({
      id: 'table',
      kind: 'prop',
      assetRef: 'dnd5e:props:torture-table',
      label: 'table',
      transform: { x: 1500, y: 0, z: 0, rotationY: 0 },
    });
    const painted = paintCells(draft, [{ q: 800, r: -8 }]);

    expect(parseRoomDraftJson(stringifyRoomDraft(painted))).toEqual(painted);
    expect(floorCells(painted)).toContainEqual({ q: 800, r: -8 });
    expect(() => validateScene(draft.scene)).toThrow(/between -12 and 12/);
  });

  it('keeps duplicate and arrangement stamp paths valid in room space', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft.scene.items.push({
      id: 'table',
      kind: 'prop',
      assetRef: 'dnd5e:props:torture-table',
      label: 'table',
      transform: { x: 15, y: 0, z: 0, rotationY: 0 },
    });
    const duplicated = duplicateSelection(draft.scene, ['table'], () => 'copy');
    const stamped = stampArrangement(
      duplicated.scene,
      {
        version: 1,
        id: 'arrangement',
        name: 'books',
        createdAt: '2026-09-14T00:00:00.000Z',
        groups: [],
        items: [
          {
            id: 'template-book',
            kind: 'prop',
            assetRef: 'dnd5e:props:books',
            label: 'books',
            transform: { x: 0, y: 0, z: 0, rotationY: 0 },
          },
        ],
      },
      { x: -15, z: 0 },
      () => 'stamp'
    );

    const roundTrip = parseRoomDraftJson(
      stringifyRoomDraft({ ...draft, scene: stamped.scene })
    );
    expect(roundTrip.scene.items.map((item) => item.transform.x)).toEqual([
      15, 15.45, -15,
    ]);
  });

  it('returns the same draft for logical no-op paint and erase', () => {
    const draft = paintCells(
      createRoomDraft(createEmptyScene('scene-1'), 'room-1'),
      [{ q: 0, r: 0 }]
    );

    expect(paintCells(draft, [{ q: 0, r: 0 }])).toBe(draft);
    expect(eraseCells(draft, [{ q: 1, r: 0 }])).toBe(draft);
    expect(paintCells(draft, [])).toBe(draft);
  });

  it('remaps declarations by stable identity and never asset ref', () => {
    const draft = createRoomDraft(
      {
        ...createEmptyScene('scene-1'),
        items: [
          {
            id: 'a',
            kind: 'prop',
            assetRef: 'prop:test',
            label: 'Same',
            transform: { x: 0, y: 0, z: 0, rotationY: 0 },
          },
          {
            id: 'b',
            kind: 'prop',
            assetRef: 'prop:test',
            label: 'Same',
            transform: { x: 1, y: 0, z: 0, rotationY: 0 },
          },
        ],
      },
      'room-1'
    );
    draft.room.propDeclarations.a = {
      blocksMovement: true,
      blocksLineOfSight: false,
      footprint: { width: 2, depth: 1, offsetX: 0.2, offsetZ: 0 },
    };
    const remapped = remapRoomDeclarations(
      draft.room,
      new Map([['a', 'copy-a']])
    );
    expect(remapped.propDeclarations['copy-a']).toEqual(
      draft.room.propDeclarations.a
    );
    expect(remapped.propDeclarations.b).toBeUndefined();
  });

  it('selects supported hexes by world-space centre inside a forward or reverse rectangle', () => {
    const forward = cellsInWorldRectangle(
      { x: -0.2, z: -0.2 },
      { x: 2, z: 1.6 }
    );
    const reverse = cellsInWorldRectangle(
      { x: 2, z: 1.6 },
      { x: -0.2, z: -0.2 }
    );
    expect(reverse).toEqual(forward);
    expect(forward).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ]);
  });

  it('uses an axis-aligned world X/Z box rather than an axial parallelogram', () => {
    expect(cellsInWorldRectangle({ x: -1, z: -1.6 }, { x: 1, z: 1.6 })).toEqual(
      [
        { q: 0, r: -1 },
        { q: 1, r: -1 },
        { q: 0, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
      ]
    );
  });

  it('returns the same candidates for preview and release and safely allows an empty box', () => {
    const start = { x: 0.2, z: 0.2 };
    const end = { x: 0.3, z: 0.3 };
    expect(cellsInWorldRectangle(start, end)).toEqual([]);
    expect(cellsInWorldRectangle(start, { x: 3.5, z: 3.1 })).toEqual(
      cellsInWorldRectangle(start, { x: 3.5, z: 3.1 })
    );
  });

  it('prunes deleted identities without resetting surviving declarations', () => {
    const scene = createEmptyScene('scene-1');
    scene.items.push({
      id: 'a',
      kind: 'prop',
      assetRef: 'prop:test',
      label: 'A',
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
    });
    const draft = createRoomDraft(scene, 'room-1');
    draft.room.propDeclarations.a = {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
    };
    expect(
      reconcileRoomDraft(draft, { ...scene, items: [] }).room.propDeclarations
    ).toEqual({});
    expect(
      reconcileRoomDraft(draft, scene).room.propDeclarations.a?.blocksMovement
    ).toBe(true);
  });
});

/** A hand-written legacy version 2 envelope, independent of createRoomDraft
 * (which now produces v3): fractional and negative world poses, nested
 * group/support relations, an explicit light, nondefault height, explicit
 * false flags, and complete declaration shapes. */
class RecordingStorage implements KeyValueStorage {
  values = new Map<string, string>();
  writes: Array<{ key: string; value: string }> = [];
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes.push({ key, value });
    this.values.set(key, value);
  }
}

describe('room draft structural exactness', () => {
  // The v1/v2 migrations and the legacy-key recovery retired with the
  // walkable list (rpg-project#725: earlier envelopes are refused by name).
  // What survives is the current key's own discipline: a present but
  // unreadable record keeps the fallback and is never overwritten by a load.
  it('never reinterprets or overwrites a current record that is empty or malformed', () => {
    for (const corrupt of ['', '{bad-v6', JSON.stringify(null)]) {
      const storage = new RecordingStorage();
      storage.values.set(ROOM_DRAFT_STORAGE_KEY, corrupt);
      const fallback = createRoomDraft(
        createEmptyScene('fallback-scene'),
        'fallback-room'
      );

      const result = loadRoomDraft(storage, fallback);
      expect(result.value.id).toBe('fallback-room');
      expect(result.error).toMatch(/Room draft load failed/);
      expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);
      expect(storage.writes).toEqual([]);
    }
  });

  it('writes only the current key, at the current envelope version', () => {
    const storage = new RecordingStorage();
    const painted = paintCells(
      createRoomDraft(createEmptyScene('blank'), 'blank'),
      [{ q: 1, r: 0 }]
    );
    const withActor = placeRoomMonster(painted, {
      id: 'actor-1',
      ref: 'dnd5e:monsters:zombie',
      startingCell: { location: { q: 2, r: -1 } },
    });
    expect(saveRoomDraft(storage, withActor)).toBeNull();
    expect(storage.writes.map((write) => write.key)).toEqual([
      ROOM_DRAFT_STORAGE_KEY,
    ]);
    const written = JSON.parse(
      storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}'
    ) as { version: number; draft: RoomDraft };
    expect(written.version).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
    expect(written.draft.room.monsterDeclarations).toHaveLength(1);
    expect(loadRoomDraft(storage, painted).value).toEqual(withActor);
  });

  it('refuses unknown draft, frame, room and placement fields instead of dropping them', () => {
    const base = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const expectRejected = (mutate: (draft: RoomDraft) => void, re: RegExp) =>
      expect(() => {
        const draft = structuredClone(base);
        mutate(draft);
        stringifyRoomDraft(draft);
      }).toThrow(re);

    expectRejected((draft) => {
      (draft as unknown as Record<string, unknown>).bossPin = { q: 0, r: 0 };
    }, /Room draft has an unsupported field: bossPin/);
    expectRejected((draft) => {
      draft.room.regions[0]!.cells = [{ r: 0, q: [[1, 1]] }];
      (draft.room as unknown as Record<string, unknown>).monstersPerCell = 1;
    }, /Room gameplay data has an unsupported field: monstersPerCell/);
    expectRejected((draft) => {
      (draft.coordinateFrame as unknown as Record<string, unknown>).engineUnit =
        'feet';
    }, /Room coordinate frame has an unsupported field: engineUnit/);
    expectRejected((draft) => {
      draft.room.regions[0]!.cells = [{ r: 0, q: [[0, 0]] }];
      draft.room.monsterDeclarations = [
        {
          id: 'm',
          ref: 'dnd5e:monsters:zombie',
          startingCell: { location: { q: 0, r: 0 } },
          facing: 0,
        },
      ] as unknown as RoomDraft['room']['monsterDeclarations'];
    }, /Monster placement at index 0 has an unsupported field: facing/);
    expectRejected((draft) => {
      draft.scene.items.push({
        id: 'prop-x',
        kind: 'prop',
        assetRef: 'dnd5e:props:books',
        label: 'x',
        transform: { x: 0, y: 0, z: 0, rotationY: 0 },
      });
      draft.room.propDeclarations['prop-x'] = {
        blocksMovement: true,
        blocksLineOfSight: false,
        footprint: {
          width: 1,
          depth: 1,
          offsetX: 0,
          offsetZ: 0,
          area: 1,
        },
      } as unknown as RoomPropDeclaration;
    }, /footprint has an unsupported field: area/);
  });

  it('requires complete declaration shapes and mapping-shaped records', () => {
    const base = createRoomDraft(
      {
        ...createEmptyScene('scene-1'),
        items: [
          {
            id: 'prop-a',
            kind: 'prop',
            assetRef: 'dnd5e:props:books',
            label: 'A',
            transform: { x: 0, y: 0, z: 0, rotationY: 0 },
          },
        ],
      },
      'room-1'
    );
    const expectRejected = (mutate: (draft: RoomDraft) => void, re: RegExp) =>
      expect(() => {
        const draft = structuredClone(base);
        mutate(draft);
        stringifyRoomDraft(draft);
      }).toThrow(re);

    expectRejected((draft) => {
      draft.room.propDeclarations['prop-a'] = {
        blocksMovement: true,
        blocksLineOfSight: false,
        footprint: { width: 1, depth: 1 },
      } as unknown as RoomDraft['room']['propDeclarations'][string];
    }, /footprint is missing offsetX/);
    expectRejected((draft) => {
      draft.room.propDeclarations = [
        {
          blocksMovement: true,
          blocksLineOfSight: false,
          footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
        },
      ] as unknown as RoomDraft['room']['propDeclarations'];
    }, /propDeclarations must be an object|Invalid room gameplay data/);
    expectRejected((draft) => {
      draft.room.arrangementDeclarations['arr-1'] = [
        'not-a-declaration-map',
      ] as unknown as RoomDraft['room']['arrangementDeclarations'][string];
    }, /Arrangement declarations for arr-1 must be an object/);
    expectRejected((draft) => {
      draft.room.arrangementDeclarations['arr-1'] = {
        'prop-a': { blocksMovement: true, footprint: null },
      } as unknown as RoomDraft['room']['arrangementDeclarations'][string];
    }, /Prop flags must be boolean\./);
    expectRejected((draft) => {
      draft.room.arrangementDeclarations['arr-1'] = {
        'prop-a': {
          blocksMovement: true,
          blocksLineOfSight: false,
          footprint: null,
        },
      } as unknown as RoomDraft['room']['arrangementDeclarations'][string];
    }, /footprint must be an object/);
  });

  it('means an actual integral cell for party start and keeps absence absent', () => {
    const base = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const expectRejected = (partyStart: unknown, re: RegExp) =>
      expect(() => {
        const draft = structuredClone(base);
        (draft.room as unknown as Record<string, unknown>).partyStart =
          partyStart;
        stringifyRoomDraft(draft);
      }).toThrow(re);

    expectRejected(null, /Party start must contain integral axial coordinates/);
    expectRejected(
      false,
      /Party start must contain integral axial coordinates/
    );
    expectRejected(0, /Party start must contain integral axial coordinates/);
    expectRejected(
      { q: 0.5, r: 0 },
      /Party start must contain integral axial coordinates/
    );
    expectRejected(
      [0, 0],
      /Party start must contain integral axial coordinates/
    );

    const withStart = setRoomPartyStart(base, { q: 1, r: -2 });
    const json = stringifyRoomDraft(withStart);
    expect(JSON.parse(json).draft.room.partyStart).toEqual({ q: 1, r: -2 });
    const cleared = clearRoomPartyStart(withStart);
    expect('partyStart' in cleared.room).toBe(false);
    expect(stringifyRoomDraft(cleared)).not.toContain('partyStart');
  });

  it('validates monster representation, type and bounds without a local rules catalog', () => {
    const base = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const withMonsters = (monsters: unknown[]): RoomDraft => {
      const draft = structuredClone(base);
      (draft.room as unknown as Record<string, unknown>).monsterDeclarations =
        monsters;
      return draft;
    };
    const expectRejected = (monsters: unknown[], re: RegExp) =>
      expect(() => stringifyRoomDraft(withMonsters(monsters))).toThrow(re);

    // Ref type is a monster reference: arbitrary module/type such as a
    // weapon reference is refused, while a syntactically valid unknown
    // monster id stays editable.
    expectRejected(
      [
        {
          id: 'm1',
          ref: 'dnd5e:weapons:longsword',
          startingCell: { location: { q: 0, r: 0 } },
        },
      ],
      /ref must be a monster reference/
    );
    expectRejected(
      [
        {
          id: 'm1',
          ref: 'dnd5e:monsters',
          startingCell: { location: { q: 0, r: 0 } },
        },
      ],
      /ref must be a monster reference/
    );
    const unknownId = withMonsters([
      {
        id: 'homebrew-1',
        ref: 'dnd5e:monsters:not-yet-modeled',
        startingCell: { location: { q: 0, r: 0 } },
      },
    ]);
    expect(
      parseRoomDraftJson(stringifyRoomDraft(unknownId)).room.monsterDeclarations
    ).toEqual([
      {
        id: 'homebrew-1',
        ref: 'dnd5e:monsters:not-yet-modeled',
        startingCell: { location: { q: 0, r: 0 } },
      },
    ]);

    expectRejected(
      [
        {
          id: 'm1',
          ref: 'dnd5e:monsters:zombie',
          startingCell: { location: { q: 0.5, r: 0 } },
        },
      ],
      /must contain integral axial coordinates/
    );
    // No extent bounds a start any more (rpg-project#725 R3): a far cell is
    // written as authored.
    expect(() =>
      stringifyRoomDraft(
        withMonsters([
          {
            id: 'm1',
            ref: 'dnd5e:monsters:zombie',
            startingCell: { location: { q: 700, r: 0 } },
          },
        ])
      )
    ).not.toThrow();
    expectRejected(
      [
        {
          id: 'm1',
          ref: 'dnd5e:monsters:zombie',
          startingCell: { location: { q: 0, r: 0 } },
        },
        {
          id: 'm1',
          ref: 'dnd5e:monsters:skeleton',
          startingCell: { location: { q: 1, r: 0 } },
        },
      ],
      /stable nonempty unique ids are required/
    );
    expectRejected(
      [{ id: 'm1', ref: 'dnd5e:monsters:zombie', startingCell: null }],
      /must contain integral axial coordinates/
    );
  });

  /**
   * A CREATURE'S START IS A CELL WITH A FACING (rpg-project#501 §6.1), and the
   * two facts travel together.
   *
   * THESE EXIST BECAUSE A MUTATION SURVIVED. Dropping `facing` from
   * `moveRoomMonster` — writing `{ location }` instead of spreading the start —
   * left the WHOLE SUITE GREEN, because no test authored a facing at all. The
   * behaviour was written and nothing held it, which is the same weakness an
   * independent review found in the toolkit's three-layer test.
   */
  it('carries a creature’s authored facing through the round trip', () => {
    const base = createRoomDraft(
      createEmptyScene('scene-facing'),
      'room-facing'
    );
    base.room.regions[0]!.cells = [{ r: 0, q: [[0, 0]] }];
    const placed = placeRoomMonster(base, {
      id: 'guard-1',
      ref: 'dnd5e:monsters:thug',
      startingCell: { location: { q: 0, r: 0 }, facing: 'ne' },
    });
    expect(placed.room.monsterDeclarations[0].startingCell).toEqual({
      location: { q: 0, r: 0 },
      facing: 'ne',
    });
    expect(
      parseRoomDraftJson(stringifyRoomDraft(placed)).room.monsterDeclarations[0]
        .startingCell
    ).toEqual({ location: { q: 0, r: 0 }, facing: 'ne' });
  });

  it('refuses a facing outside the eight compass names', () => {
    // The vocabulary is closed, so a word outside it is refused with the names
    // that ARE legal rather than carried to the engine.
    const base = createRoomDraft(createEmptyScene('scene-bad'), 'room-bad');
    base.room.regions[0]!.cells = [{ r: 0, q: [[0, 0]] }];
    expect(() =>
      stringifyRoomDraft({
        ...base,
        room: {
          ...base.room,
          monsterDeclarations: [
            {
              id: 'guard-1',
              ref: 'dnd5e:monsters:thug',
              startingCell: { location: { q: 0, r: 0 }, facing: 'north' },
            },
          ],
        },
      })
    ).toThrow(/facing must be one of n, ne, e, se, s, sw, w, nw/);
  });

  it('moving a creature keeps the facing it was authored with', () => {
    // THE MOVED CREATURE IS THE SAME CREATURE: a move changes WHERE it stands
    // and must not silently re-aim it at the asset's default, which is exactly
    // what dropping the field would do.
    const base = createRoomDraft(createEmptyScene('scene-move'), 'room-move');
    base.room.regions[0]!.cells = [{ r: 0, q: [[0, 1]] }];
    const placed = placeRoomMonster(base, {
      id: 'guard-1',
      ref: 'dnd5e:monsters:thug',
      startingCell: { location: { q: 0, r: 0 }, facing: 'sw' },
    });
    const moved = moveRoomMonster(placed, 'guard-1', { q: 1, r: 0 });
    expect(moved.room.monsterDeclarations[0].startingCell).toEqual({
      location: { q: 1, r: 0 },
      facing: 'sw',
    });
  });

  it('round trips monster orders, and an unauthored faction stays absent', () => {
    const base = createRoomDraft(
      createEmptyScene('scene-orders'),
      'room-orders'
    );
    const withActors = placeRoomMonster(
      placeRoomMonster(base, {
        id: 'goblin-1',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 1, r: 0 } },
      }),
      {
        id: 'goblin-2',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 2, r: 0 } },
      }
    );
    withActors.room.monsterBindings = {
      'goblin-1': {
        faction: 'goblins',
        on: {
          time: [
            { when: { enemy: 'reach' }, attack: 'enemy' },
            { toward: 'attacker' },
          ],
        },
        temper: 'coward',
        actions: ['dnd5e:weapons:scimitar', 'dnd5e:weapons:shortbow'],
      },
    };

    const json = stringifyRoomDraft(withActors);
    const roundTrip = parseRoomDraftJson(json);
    expect(roundTrip).toEqual(withActors);
    // The authored faction is written; the unauthored one is not written out
    // as `faction: monsters` (rpg-project#477 Decision 4).
    expect(json).toContain('"faction": "goblins"');
    expect(json.match(/"faction"/g)).toHaveLength(1);
    // The order of actions IS the point, so it survives verbatim.
    expect(roundTrip.room.monsterBindings?.['goblin-1'].actions).toEqual([
      'dnd5e:weapons:scimitar',
      'dnd5e:weapons:shortbow',
    ]);
    // One word, and it is the placement's own — it beats the faction's mix.
    expect(roundTrip.room.monsterBindings?.['goblin-1'].temper).toBe('coward');
    expect(roundTrip.room.monsterBindings?.['goblin-2']).toBeUndefined();
  });

  it('round trips the hearing rows: a two-entry `when` with a `not`, `heard`, `fact` on time and `toward: sound` (rpg-project#569)', () => {
    const base = createRoomDraft(createEmptyScene('scene-hear'), 'room-hear');
    const withGuard = placeRoomMonster(base, {
      id: 'gate-1',
      ref: 'dnd5e:monsters:guard',
      startingCell: { location: { q: 1, r: 0 } },
    });
    withGuard.room.monsterBindings = {
      'gate-1': {
        on: {
          time: [
            { when: { enemy: 'none' }, hold: {} },
            { when: { heard: { kind: 'clang', within: 2 } }, toward: 'sound' },
            {
              when: { enemy: 'seen' },
              say: 'To arms!',
              fact: 'alarm-raised',
            },
            {
              when: [{ fact: 'guards-turned' }, { not: { enemy: 'seen' } }],
              toward: 'attacker',
            },
            { when: { enemy: 'reach' }, attack: 'enemy' },
          ],
        },
      },
    };

    const json = stringifyRoomDraft(withGuard);
    const roundTrip = parseRoomDraftJson(json);
    expect(roundTrip).toEqual(withGuard);
    const time = roundTrip.room.monsterBindings?.['gate-1'].on?.time ?? [];
    // THE SPELLING SURVIVES: the list is still a list, and every single
    // mapping is still a mapping.
    expect(Array.isArray(time[3]?.when)).toBe(true);
    expect(Array.isArray(time[0]?.when)).toBe(false);
    expect(time[1]?.toward).toBe('sound');
    expect(time[2]?.fact).toBe('alarm-raised');
  });

  it('refuses the hearing rows the engine refuses, in its words (rpg-project#569)', () => {
    const base = createRoomDraft(createEmptyScene('scene-hear'), 'room-hear');
    const withGuard = placeRoomMonster(base, {
      id: 'gate-1',
      ref: 'dnd5e:monsters:guard',
      startingCell: { location: { q: 1, r: 0 } },
    });
    const refused = (time: unknown[]) => {
      const draft = structuredClone(withGuard);
      draft.room.monsterBindings = {
        'gate-1': { on: { time } as never },
      };
      return () => parseRoomDraftJson(stringifyRoomDraft(draft));
    };
    // A selector-shape fault is the ROW's, reported at `…time[i]` as the
    // engine reports it (rpg-toolkit#2044).
    expect(refused([{ attack: 'sound' }])).toThrow(
      /on\.time\[0\]: `attack` cannot take `sound`: a sound cannot be struck/
    );
    // AN OFFSET ROUTE IS REFUSED IN THE SINGLE ROOM (rpg-toolkit#2063): its
    // cells are written { q, r }, as its walkable hexes are.
    expect(refused([{ toward: { path: [[1, 1]] } }])).toThrow(
      /on\.time\[0\]\.toward\.path: path names a route of this room's cells, each written \{ q, r \} as its walkable hexes are: \[col, row\] is an offset in a document orientation this dialect does not have$/
    );
    // NOR AN OFFSET CELL, for the same reason, whatever word it sits on.
    expect(refused([{ toward: { at: [3, 4] } }])).toThrow(
      /on\.time\[0\]\.toward\.at: at names a cell of this room, written \{ q, r \} as its walkable hexes are: \[col, row\] is an offset in a document orientation this dialect does not have$/
    );
    // The room's own spelling reads.
    expect(refused([{ toward: { at: { q: 1, r: 0 } } }])).not.toThrow();
    expect(
      refused([
        {
          toward: {
            path: [
              { q: 1, r: 0 },
              { q: 0, r: 0 },
            ],
          },
        },
      ])
    ).not.toThrow();
    expect(
      refused([
        {
          when: { not: { heard: { kind: 'clang', within: 2 } } },
          toward: 'sound',
        },
      ])
    ).toThrow(/`sound` needs a `heard` condition on the row/);
    expect(refused([{ patrol: {} }])).toThrow(
      /`patrol` is not a word: a patrol is a route, write toward: \{ path: \[\{ q, r \}, …\] \}$/
    );
    // `heard` faults are mind/behavior's, reported at the ROW.
    expect(refused([{ when: { heard: { within: 2 } }, hold: {} }])).toThrow(
      /on\.time\[0\]: `heard` needs a `kind`, the sound it listens for$/
    );
    expect(refused([{ when: { heard: { kind: 'clang' } }, hold: {} }])).toThrow(
      /on\.time\[0\]: `heard` within 0: a span is counted from 1/
    );
    expect(
      refused([
        { when: { not: { heard: { kind: 'clang', within: 0 } } }, hold: {} },
      ])
    ).toThrow(
      /on\.time\[0\]: inside `not`: `heard` within 0: a span is counted from 1/
    );
    // A mapping naming no target, at the row.
    expect(refused([{ toward: {} }])).toThrow(
      /on\.time\[0\]: `toward` names no target/
    );
    expect(refused([{ when: { enemy: 'seen', fact: 'x' }, hold: {} }])).toThrow(
      /a `when` entry is one condition, and this names 2/
    );
  });

  it("a binding's temper is ONE word — the faction's mix is refused there", () => {
    const draft = createRoomDraft(
      createEmptyScene('scene-temper'),
      'room-temper'
    );
    draft.room.monsterDeclarations = [
      {
        id: 'goblin-1',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 1, r: 0 } },
      },
    ];
    const rejection = (value: unknown) => {
      (draft.room as unknown as Record<string, unknown>).monsterBindings = {
        'goblin-1': value,
      };
      return () => stringifyRoomDraft(structuredClone(draft));
    };

    // One sealed word is the shape. `RoomMonsterBinding.Temper` is a plain
    // `string` where `FactionSpec.Temper` is a `TemperSpec`
    // (`dungeonspec/single_room.go`), so this is the engine's asymmetry.
    expect(rejection({ temper: 'coward' })).not.toThrow();

    // A MIX is the faction's shape, and it is refused here by name.
    expect(rejection({ temper: { coward: 2, soldier: 1 } })).toThrow(
      /a temper mix belongs on the faction/
    );

    // A word outside the sealed three is refused by name, as the engine does.
    expect(rejection({ temper: 'cowardly' })).toThrow(
      /temper "cowardly" is not a temperament this build ships/
    );

    // A non-string scalar reaches the engine as a scalar node and is read as a
    // word, so it is refused BY NAME rather than with the shape sentence.
    expect(rejection({ temper: 5 })).toThrow(
      /temper "5" is not a temperament this build ships/
    );

    // `temper` ALONE is a complete binding: it is an override, not an absence.
    expect(rejection({ temper: 'aggressive' })).not.toThrow();
  });

  it('refuses an orphan binding, an unknown binding key and an empty block', () => {
    const draft = createRoomDraft(
      createEmptyScene('scene-orphan'),
      'room-orphan'
    );
    draft.room.monsterDeclarations = [
      {
        id: 'goblin-1',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 1, r: 0 } },
      },
    ];
    const rejection = (value: unknown) => {
      (draft.room as unknown as Record<string, unknown>).monsterBindings =
        value;
      return () => stringifyRoomDraft(structuredClone(draft));
    };

    expect(
      rejection({ gone: { actions: ['dnd5e:weapons:scimitar'] } })
    ).toThrow(/Monster binding owner does not exist: gone/);
    // A key this dialect's binding does not carry is refused as the unknown
    // key it is.
    expect(rejection({ 'goblin-1': { intimidating: {} } })).toThrow(
      /Monster binding for goblin-1 has an unsupported field: intimidating/
    );
    expect(rejection({ 'goblin-1': {} })).toThrow(
      /Monster binding for goblin-1 declares no bindings/
    );
    expect(rejection({ 'goblin-1': { actions: [] } })).toThrow(
      /Monster binding for goblin-1 actions is empty/
    );
    // THE TWO RETIRED KEYS ARE REFUSED BY NAME (rpg-project#569 R2). They were
    // read-never-offered while the engine still read them; it now refuses
    // them, so the studio says the engine's sentence rather than carrying a
    // file the server will not take.
    expect(
      rejection({
        'goblin-1': { intimidate: [{ ability: 'intimidation', dc: 12 }] },
      })
    ).toThrow(
      'Monster binding for goblin-1 intimidate: `intimidate` is no longer a key: author an option whose check rolls it'
    );
    expect(
      rejection({
        'goblin-1': { persuade: [{ ability: 'persuasion', dc: 10 }] },
      })
    ).toThrow('`persuade` is no longer a key: author an option');
    expect(rejection({ 'goblin-1': { actions: ['dnd5e:weapons'] } })).toThrow(
      /must be a weapon reference/
    );
  });

  it('drops the orders when their creature is removed, leaving no orphan', () => {
    const draft = createRoomDraft(createEmptyScene('scene-drop'), 'room-drop');
    draft.room.monsterDeclarations = [
      {
        id: 'goblin-1',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 1, r: 0 } },
      },
      {
        id: 'goblin-2',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 2, r: 0 } },
      },
    ];
    draft.room.monsterBindings = {
      'goblin-1': { actions: ['dnd5e:weapons:scimitar'] },
      'goblin-2': { actions: ['dnd5e:weapons:shortbow'] },
    };
    const removed = removeRoomMonster(draft, 'goblin-1');
    expect(removed.room.monsterBindings).toEqual({
      'goblin-2': { actions: ['dnd5e:weapons:shortbow'] },
    });
    // The last removal takes the now-empty map with it, so the key never
    // survives as an empty placeholder.
    const emptied = removeRoomMonster(removed, 'goblin-2');
    expect('monsterBindings' in emptied.room).toBe(false);
    expect(() => stringifyRoomDraft(emptied)).not.toThrow();
  });

  it('writes no monsterBindings and no faction when nothing authored them', () => {
    const draft = createRoomDraft(createEmptyScene('scene-none'), 'room-none');
    draft.room.monsterDeclarations = [
      {
        id: 'goblin-1',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 1, r: 0 } },
      },
    ];
    const json = stringifyRoomDraft(draft);
    expect(json).not.toContain('monsterBindings');
    expect(json).not.toContain('"faction"');
  });

  it('round trips a door, its resting state and its lock approaches verbatim', () => {
    const scene = createEmptyScene('scene-doors');
    scene.items.push({
      id: 'cellar-door',
      kind: 'prop',
      assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
      label: 'Cellar door',
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
    });
    scene.items.push({
      id: 'gate',
      kind: 'prop',
      assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
      label: 'Gate',
      transform: { x: 2, y: 0, z: 0, rotationY: 0 },
    });
    const draft = createRoomDraft(scene, 'room-doors');
    // A door's shape IS its prop declaration, and the engine refuses a door
    // without one ("a door needs a footprint").
    draft.room.propDeclarations['cellar-door'] = {
      blocksMovement: false,
      blocksLineOfSight: false,
      footprint: { width: 2, depth: 0.5, offsetX: 0, offsetZ: 0 },
    };
    draft.room.doorBindings = {
      'cellar-door': {
        closed: true,
        locked: [
          { ability: 'str', dc: 20 },
          { ability: 'dex', dc: 15, tool: 'dnd5e:item:thieves-tools' },
        ],
      },
      // An EMPTY binding is a door at rest open — the authored state, not a
      // missing one — so it has to survive the round trip as `{}`.
      gate: {},
    };

    const json = stringifyRoomDraft(draft);
    const roundTrip = parseRoomDraftJson(json);
    expect(roundTrip).toEqual(draft);
    expect(roundTrip.room.doorBindings?.gate).toEqual({});
    // The order of the approaches is the author's, so it is not sorted; any
    // ONE of them beats the lock.
    expect(roundTrip.room.doorBindings?.['cellar-door'].locked).toEqual([
      { ability: 'str', dc: 20 },
      { ability: 'dex', dc: 15, tool: 'dnd5e:item:thieves-tools' },
    ]);
  });

  it('writes no doorBindings when no door was authored', () => {
    const draft = createRoomDraft(createEmptyScene('scene-no-doors'), 'room-0');
    draft.room.regions[0]!.cells = [{ r: 0, q: [[0, 0]] }];
    const json = stringifyRoomDraft(draft);
    expect(json).not.toContain('doorBindings');
  });

  it('drops the door binding when its item is removed, leaving no orphan', () => {
    // A binding can no more outlive its item than a creature's orders can
    // outlive the creature — and here the orphan does not merely go stale:
    // the engine refuses a door whose item declares no footprint, so it would
    // refuse the whole document.
    const scene = createEmptyScene('scene-door-drop');
    scene.items.push({
      id: 'cellar-door',
      kind: 'prop',
      assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
      label: 'Cellar door',
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
    });
    const draft = createRoomDraft(scene, 'room-door-drop');
    draft.room.propDeclarations['cellar-door'] = {
      blocksMovement: false,
      blocksLineOfSight: false,
      footprint: { width: 2, depth: 0.5, offsetX: 0, offsetZ: 0 },
    };
    draft.room.doorBindings = { 'cellar-door': { closed: true } };

    const removed = reconcileRoomDraft(draft, { ...scene, items: [] });
    // The now-empty map goes with it, so the key never survives as `{}`.
    expect('doorBindings' in removed.room).toBe(false);
    expect(() => stringifyRoomDraft(removed)).not.toThrow();

    // And the live item keeps its door.
    expect(reconcileRoomDraft(draft, scene).room.doorBindings).toEqual({
      'cellar-door': { closed: true },
    });
  });

  it('keeps a bound door\u2019s state on unrelated scene edits and drops it with its opening', () => {
    const draft = createRoomDraft(
      createEmptyScene('scene-bound-door'),
      'room-bound-door'
    );
    draft.room.walls = [
      {
        id: 'wall-1',
        label: 'North wall',
        line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
        openings: [
          {
            id: 'opening-1',
            position: 7,
            width: 2,
            door: {
              id: 'door-1',
              assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
            },
          },
        ],
        appearance: {
          assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
          height: 3,
          thickness: 0.3,
          elevation: 0,
        },
        blocker: {
          footprint: { width: 12, depth: 0.5, offsetX: 0, offsetZ: 0 },
          blocksMovement: false,
          blocksLineOfSight: false,
        },
      },
    ];
    draft.room.doorBindings = { 'door-1': { closed: true } };

    // An unrelated scene edit (no items) must NOT delete the bound door's
    // state; the door has no scene item, but its OPENING owns it.
    const kept = reconcileRoomDraft(draft, draft.scene);
    expect(kept.room.doorBindings).toEqual({ 'door-1': { closed: true } });
    // A bound door is never a prop declaration; declarations follow scene
    // items only.
    expect(kept.room.propDeclarations).toEqual({});

    // Removing the opening removes the door, and its binding in the same
    // reconcile pass.
    const walls = kept.room.walls!;
    const withoutOpening = {
      ...kept,
      room: {
        ...kept.room,
        walls: [{ ...walls[0]!, openings: [] }],
      },
    };
    expect(
      'doorBindings' in
        reconcileRoomDraft(withoutOpening, withoutOpening.scene).room
    ).toBe(false);
  });

  it('refuses a faction id that is not a faction id', () => {
    const draft = createRoomDraft(
      createEmptyScene('scene-bad-faction'),
      'room-bad-faction'
    );
    (draft.room as unknown as Record<string, unknown>).monsterDeclarations = [
      {
        id: 'goblin-1',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 1, r: 0 } },
      },
    ];
    draft.room.monsterBindings = { 'goblin-1': { faction: 'The Goblins' } };
    expect(() => stringifyRoomDraft(draft)).toThrow(
      /faction must be a faction id such as goblins/
    );
  });

  it('retains structurally valid actor arrangements that are merely game-illegal', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft.room.regions[0]!.cells = [{ r: 0, q: [[0, 0]] }];
    // Off painted floor and overlapping the party start: the encounter owns
    // legality, so this draft must stay retainable verbatim.
    const withActor = placeRoomMonster(draft, {
      id: 'skeleton-a',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: 5, r: -5 } },
    });
    const withStart = setRoomPartyStart(withActor, { q: 5, r: -5 });
    const roundTrip = parseRoomDraftJson(stringifyRoomDraft(withStart));
    expect(roundTrip.room.monsterDeclarations).toEqual([
      {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:skeleton',
        startingCell: { location: { q: 5, r: -5 } },
      },
    ]);
    expect(roundTrip.room.partyStart).toEqual({ q: 5, r: -5 });
  });

  it('refuses oversize writes symmetrically and keeps prior stored bytes', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft.name = 'x'.repeat(500_001);
    expect(() => stringifyRoomDraft(draft)).toThrow(
      'Room draft is too large (maximum 500000 characters).'
    );

    const storage = new RecordingStorage();
    const priorBytes = stringifyRoomDraft(
      createRoomDraft(createEmptyScene('scene-1'), 'room-1')
    );
    storage.values.set(ROOM_DRAFT_STORAGE_KEY, priorBytes);
    expect(saveRoomDraft(storage, draft)).toMatch(/Room draft is too large/);
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(priorBytes);
  });

  it('shapes actor edits for one whole-room transaction with stable ids', () => {
    let draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft = setRoomPartyStart(draft, { q: 0, r: 0 });
    draft = placeRoomMonster(draft, {
      id: 'skeleton-a',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: 1, r: -1 } },
    });
    // A move retains the minted identity and only changes the cell.
    const moved = moveRoomMonster(draft, 'skeleton-a', { q: 2, r: -2 });
    expect(moved.room.monsterDeclarations[0]).toEqual({
      id: 'skeleton-a',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: 2, r: -2 } },
    });
    // No-op mutations return the same draft so the editor commits nothing.
    expect(moveRoomMonster(draft, 'absent', { q: 0, r: 0 })).toBe(draft);
    expect(setRoomPartyStart(draft, { q: 0, r: 0 })).toBe(draft);
    expect(clearRoomPartyStart(moved).room.partyStart).toBeUndefined();
    const cleared = clearRoomPartyStart(moved);
    expect(clearRoomPartyStart(cleared)).toBe(cleared);
    // The canvas is unbounded (rpg-project#725 R3): a far cell is a cell,
    // and only a cell that is not whole is refused.
    expect(
      moveRoomMonster(draft, 'skeleton-a', { q: 900, r: 0 }).room
        .monsterDeclarations[0]!.startingCell.location
    ).toEqual({ q: 900, r: 0 });
    expect(() =>
      moveRoomMonster(draft, 'skeleton-a', { q: 9.5, r: 0 })
    ).toThrow('Monster placement must be a whole hex.');
    expect(() => setRoomPartyStart(draft, { q: 0, r: 0.5 })).toThrow(
      'Party start must be a whole hex.'
    );
    expect(() =>
      placeRoomMonster(draft, {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:zombie',
        startingCell: { location: { q: 0, r: 0 } },
      })
    ).toThrow(/already placed/);
    const removed = removeRoomMonster(moved, 'skeleton-a');
    expect(removed.room.monsterDeclarations).toEqual([]);
    expect(removed.room.partyStart).toEqual({ q: 0, r: 0 });
  });

  // Workspace membership retired with the workspace (R3); what a cell is
  // now asked is whether it is floor — whether some region lists it.
  it('answers floor membership from the regions for any axial cell', () => {
    const draft = paintCells(
      createRoomDraft(createEmptyScene('scene-1'), 'room-1'),
      [
        { q: 0, r: 0 },
        { q: 6, r: -3 },
      ]
    );
    expect(isFloorCell(draft, { q: 0, r: 0 })).toBe(true);
    expect(isFloorCell(draft, { q: 6, r: -3 })).toBe(true);
    expect(isFloorCell(draft, { q: 7, r: -3 })).toBe(false);
    expect(isFloorCell(draft, { q: 0.5, r: 0 })).toBe(false);
  });
});

describe('the site scope persists beside the draft (rpg-dnd5e-web#1160)', () => {
  const scope: SiteScope = {
    factions: [
      { id: 'goblins', temper: { coward: 2, soldier: 1 } },
      {
        id: 'bandits',
        mind: 'bandit-1',
        on: { time: [{ when: { enemy: 'reach' }, attack: 'enemy' }] },
      },
    ],
    dispositions: [{ between: ['goblins', 'party'], stance: 'hostile' }],
  };

  it('writes the CURRENT envelope version, and no scope key when there is none', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const bare = stringifyRoomDraft(draft);
    // No scope, or an explicitly empty one, is the same document.
    expect(stringifyRoomDraft(draft, {})).toBe(bare);
    expect(stringifyRoomDraft(draft, { factions: [], dispositions: [] })).toBe(
      bare
    );
    const envelope = JSON.parse(bare) as { version: number; scope?: unknown };
    // THE VERSION IS NO LONGER CONDITIONAL (rpg-project#501 §6.1). It used to
    // be `carriesScope ? 4 : 3`, because its only job was to say whether a
    // scope could be present. It now also says which MONSTER SHAPE the draft
    // stores — `startingCell` — and that is true of every draft this build
    // writes. So the version is constant and the SCOPE key is what comes and
    // goes, which is the part this test is really about.
    expect(envelope.version).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
    expect('scope' in envelope).toBe(false);
  });

  it('writes an envelope carrying the scope and reads it back', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const json = stringifyRoomDraft(draft, scope);
    const envelope = JSON.parse(json) as {
      version: number;
      scope: typeof scope;
    };
    expect(envelope.version).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
    expect(envelope.scope).toEqual(scope);
    expect(parseRoomDocumentJson(json)).toEqual({ draft, scope });
  });

  it('loads the stored scope beside the stored draft', () => {
    const storage = new RecordingStorage();
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    expect(saveRoomDraft(storage, draft, scope)).toBeNull();
    const loaded = loadRoomDraft(storage, draft);
    expect(loaded.error).toBeUndefined();
    expect(loaded.value.id).toBe('room-1');
    expect(loaded.scope).toEqual(scope);
    // A document saved with no scope reloads as one that authors none.
    expect(saveRoomDraft(storage, draft)).toBeNull();
    expect(loadRoomDraft(storage, draft).scope).toEqual({});
  });

  it('refuses a scope-carrying envelope to the draft-only reader instead of dropping it', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    expect(() => parseRoomDraftJson(stringifyRoomDraft(draft, scope))).toThrow(
      /carries a site scope/
    );
    // AN EARLIER ENVELOPE IS REFUSED BY NAME: a v3 envelope predates both
    // `startingCell` (rpg-project#501 §6.1) and regions as the floor
    // (rpg-project#725), and the sentence now names the later change and says
    // to rebuild. A scope riding along does not change that.
    const v3 = JSON.stringify({
      kind: 'rpg-room-authoring-draft',
      version: 3,
      draft: JSON.parse(stringifyRoomDraft(draft)).draft,
      scope,
    });
    expect(() => parseRoomDocumentJson(v3)).toThrow(
      /saved before regions were the floor .*rebuild, no migration/
    );
  });

  it('refuses an invalid scope on the way out and keeps the prior stored bytes', () => {
    const storage = new RecordingStorage();
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    expect(saveRoomDraft(storage, draft, scope)).toBeNull();
    const prior = storage.values.get(ROOM_DRAFT_STORAGE_KEY);

    // A share below the minimum can never be dealt — the strict decoder's own
    // sentence, refused before the bytes are replaced.
    const error = saveRoomDraft(storage, draft, {
      factions: [{ id: 'goblins', temper: { coward: 0 } }],
    });
    expect(error).toMatch(/can never be dealt/);
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(prior);

    expect(() =>
      stringifyRoomDraft(draft, {
        factions: [{ id: 'party' }],
      })
    ).toThrow(/players' side/);
  });
});

describe('complete document gate', () => {
  it('normalizes the full scope and keeps the bytes of a valid document unchanged', () => {
    const original = createRoomDraft(createEmptyScene('scene'), 'room');
    const bytes = stringifyRoomDraft(original);
    expect(
      stringifyRoomDraft(
        validateRoomDocument({ draft: original, scope: {} }).draft
      )
    ).toBe(bytes);
    expect(original.scene.version).toBe(1);
  });
  // Rectangle membership retired with the workspace (rpg-project#725 R3):
  // a rectangle selects every cell whose centre it holds, anywhere, and the
  // paint cap — not a stored extent — is what bounds one gesture.
  it('selects a rectangle anywhere on the canvas and refuses one past the paint cap', () => {
    expect(
      cellsInWorldRectangle({ x: 999, z: 999 }, { x: 1001.5, z: 1000.6 })
    ).toEqual(
      cellsInWorldRectangle({ x: 1001.5, z: 1000.6 }, { x: 999, z: 999 })
    );
    expect(
      cellsInWorldRectangle({ x: 999, z: 999 }, { x: 1001.5, z: 1000.6 }).length
    ).toBeGreaterThan(0);
    expect(() =>
      cellsInWorldRectangle({ x: -400, z: -400 }, { x: 400, z: 400 })
    ).toThrow('A rectangle selects at most 65536 cells.');
  });
  it('refuses a label on a version 1 scene, and the retired envelopes by name', () => {
    const labeled = createMapLabel(
      createRoomDraft(createEmptyScene('scene'), 'room'),
      'label',
      'Kitchen',
      { x: 0, z: 0 }
    );
    expect(() =>
      stringifyRoomDraft({
        ...labeled,
        scene: { ...labeled.scene, version: 1 },
      })
    ).toThrow(/version 1 cannot carry/);
    for (const version of [3, 4, 5])
      expect(() =>
        parseRoomDocumentJson(
          JSON.stringify({
            kind: 'rpg-room-authoring-draft',
            version,
            draft: labeled,
          })
        )
      ).toThrow(/rebuild, no migration \(rpg-project#725\)/);
  });
  it('allows an unfinished intel row through size checking without making it persistable', () => {
    const document = {
      draft: createRoomDraft(createEmptyScene('scene'), 'room'),
      scope: { intel: [{ id: 'draft-intel', reveals: { fact: '' } }] },
    };
    const before = structuredClone(document);
    expect(() => assertRoomDocumentSize(document)).not.toThrow();
    expect(document).toEqual(before);
    expect(() => validateRoomDocument(document)).toThrow(/must name a fact/);
    expect(() => stringifyRoomDraft(document.draft, document.scope)).toThrow(
      /must name a fact/
    );
  });
  it('checks the same full envelope size even when a policy row is incomplete', () => {
    const document = {
      draft: createRoomDraft(createEmptyScene('scene'), 'room'),
      scope: {
        intel: [{ id: 'draft-intel', reveals: { fact: '' } }],
        scenarios: { test: { custom: 'x'.repeat(500001) } },
      },
    };
    const before = structuredClone(document);
    expect(() => assertRoomDocumentSize(document)).toThrow(
      'Room draft is too large (maximum 500000 characters).'
    );
    expect(document).toEqual(before);
  });
  // The floor is capped by MAX_FLOOR_HEXES, not by a workspace; a paint that
  // would pass it is refused before any transaction, with no mutation.
  it('refuses oversized full scope and a floor past the paint cap, without mutation', () => {
    const draft = createRoomDraft(createEmptyScene('scene'), 'room');
    const before = structuredClone(draft);
    const tooMany = Array.from({ length: MAX_FLOOR_HEXES + 1 }, (_, i) => ({
      q: i % 512,
      r: Math.floor(i / 512),
    }));
    expect(() => paintCells(draft, tooMany)).toThrow(
      'The floor holds at most 65536 cells (rpg-project#725).'
    );
    expect(draft).toEqual(before);
    const hugeScope = { scenarios: { test: { custom: 'x'.repeat(500001) } } };
    expect(() => validateRoomDocument({ draft, scope: hugeScope })).toThrow(
      /too large/
    );
  });
});

// The scene3/4 authoring-intent tests (automatic witnesses, explicit areas,
// label links) retired with `scene.authoringRegions` (rpg-project#725 G4).
// What they guarded — that authored regions, their look and their identities
// survive reload byte for byte, that unreadable stored bytes are protected,
// and that a region id cannot collide with another owner — is pinned here
// against `room.room.regions` and `scene.regionPresentation`.
type RawDraft = {
  scene: Record<string, unknown>;
  room: Record<string, unknown> & { regions: Array<Record<string, unknown>> };
};

describe('regions are the floor: codec and identity boundary (rpg-project#725)', () => {
  function regionDraft(): RoomDraft {
    let draft = createRoomDraft(createEmptyScene('scene'), 'room');
    draft.scene.version = 3;
    draft = createRegion(draft, 'region', 'Kitchen');
    draft = paintCells(
      draft,
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      'region'
    );
    draft = paintCells(draft, [{ q: 3, r: 1 }]);
    draft = setRegionLighting(draft, 'region', 0.3);
    draft = createRegion(draft, 'unpainted', 'Cellar');
    return draft;
  }
  it('round trips named, lit, painted and unpainted regions and a verbatim construction', () => {
    const draft = regionDraft();
    draft.scene.regionPresentation = {
      region: { construction: { rectangles: [[0, 0, 2, 1]], tool: 'drag' } },
    };
    const before = structuredClone(draft);
    const bytes = stringifyRoomDraft(draft);
    expect(JSON.parse(bytes).version).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
    const reopened = parseRoomDocumentJson(bytes);
    expect(reopened.draft).toEqual(before);
    expect(stringifyRoomDraft(reopened.draft)).toBe(bytes);
    expect(reopened.draft.room.regions).toEqual([
      {
        id: 'room-region',
        name: 'Untitled room',
        lighting: { intensity: 1 },
        cells: [{ r: 1, q: [[3, 3]] }],
      },
      {
        id: 'region',
        name: 'Kitchen',
        lighting: { intensity: 0.3 },
        cells: [{ r: 0, q: [[0, 1]] }],
      },
      {
        id: 'unpainted',
        name: 'Cellar',
        lighting: { intensity: 1 },
        cells: [],
      },
    ]);
    expect(reopened.draft.scene.version).toBe(3);
  });
  it('protects current stored bytes the regions refuse; an unpainted region remains valid', () => {
    const draft = regionDraft();
    const valid = JSON.parse(stringifyRoomDraft(draft));
    const storage = new RecordingStorage();
    for (const mutate of [
      (d: RawDraft) => {
        d.scene.futureIntent = true;
      },
      (d: RawDraft) => {
        d.scene.authoringRegions = [];
      },
      (d: RawDraft) => {
        d.scene.regionPresentation = { missing: { construction: 1 } };
      },
      (d: RawDraft) => {
        d.room.walkableHexes = [{ q: 0, r: 0 }];
      },
      (d: RawDraft) => {
        d.room.regions[0].cells = [{ r: 0, q: [[0, 0]] }];
      },
    ]) {
      const invalid = structuredClone(valid);
      mutate(invalid.draft);
      const bytes = JSON.stringify(invalid);
      storage.values.set(ROOM_DRAFT_STORAGE_KEY, bytes);
      const result = loadRoomDraft(storage, draft);
      expect(result.value).toBe(draft);
      expect(result.error).toMatch(/load failed/);
      expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
      expect(storage.writes).toEqual([]);
    }
    expect(() => validateRoomDocument({ draft, scope: {} })).not.toThrow();
  });
  it('refuses a region id colliding with an actual document owner, in its own words', () => {
    for (const collision of [
      'room',
      'scene',
      'room-region',
      'actor',
      'wall',
      'opening',
      'door',
    ]) {
      const draft = regionDraft();
      draft.room.walls = [
        {
          id: 'wall',
          label: 'Wall',
          line: { start: { x: -3, z: 0 }, end: { x: 3, z: 0 } },
          appearance: {
            assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
            height: 3,
            thickness: 0.3,
            elevation: 0,
          },
          blocker: {
            footprint: { width: 6, depth: 0.3, offsetX: 0, offsetZ: 0 },
            blocksMovement: true,
            blocksLineOfSight: true,
          },
          openings: [
            {
              id: 'opening',
              position: 3,
              width: 2,
              door: {
                id: 'door',
                assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
              },
            },
          ],
        },
      ];
      draft.room.doorBindings = { door: { closed: true } };
      draft.room.monsterDeclarations = [
        {
          id: 'actor',
          ref: 'dnd5e:monsters:skeleton',
          startingCell: { location: { q: 0, r: 0 } },
        },
      ];
      draft.room.regions[1]!.id = collision;
      expect(() => stringifyRoomDraft(draft)).toThrow(
        `room.room.regions[1].id: duplicate identity ${collision}.`
      );
    }
  });
  it('charges a carried construction to the existing 500000-character document budget', () => {
    const draft = regionDraft();
    draft.scene.regionPresentation = {
      region: { construction: { notes: 'x'.repeat(500001) } },
    };
    const storage = new RecordingStorage();
    const prior = stringifyRoomDraft(regionDraft());
    storage.values.set(ROOM_DRAFT_STORAGE_KEY, prior);
    expect(() => validateRoomDocument({ draft, scope: {} })).toThrow(
      /too large.*500000/
    );
    expect(saveRoomDraft(storage, draft)).toMatch(/too large/);
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(prior);
    expect(storage.writes).toEqual([]);
  });
});

it('full document JSON/reload retains region lighting, scope and independent version axes', () => {
  const document = createPopulatedStudioDocument();
  document.draft = setRegionLighting(
    createRegion(document.draft, 'lighting-region', 'Room'),
    'lighting-region',
    0.153728
  );
  const bytes = stringifyRoomDraft(document.draft, document.scope);
  expect(JSON.parse(bytes).version).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
  const loaded = parseRoomDocumentJson(bytes);
  expect(loaded).toEqual(document);
  expect(stringifyRoomDraft(loaded.draft, loaded.scope)).toBe(bytes);
  for (const draft of [
    document.draft,
    paintCells(document.draft, [{ q: 0, r: 0 }], 'lighting-region'),
    setRegionLighting(document.draft, 'lighting-region', 1),
  ]) {
    expect(parseRoomDraftJson(stringifyRoomDraft(draft))).toEqual(draft);
    expect(draft.scene.version).toBe(document.draft.scene.version);
  }
});

describe('options on a binding (rpg-project#569)', () => {
  /** A room with one goblin, one altar and one purse — the purse holdable,
   * so a line may require carrying it. */
  function optionsDraft(): RoomDraft {
    const scene = createEmptyScene('scene-options');
    for (const [id, x] of [
      ['altar', 0],
      ['purse', 2],
    ] as const) {
      scene.items.push({
        id,
        kind: 'prop',
        assetRef: 'dnd5e:props:torture-table',
        label: id,
        transform: { x, y: 0, z: 0, rotationY: 0 },
      });
    }
    const draft = createRoomDraft(scene, 'room-options');
    for (const id of ['altar', 'purse'])
      draft.room.propDeclarations[id] = {
        blocksMovement: false,
        blocksLineOfSight: false,
        footprint: { width: 0.5, depth: 0.5, offsetX: 0, offsetZ: 0 },
      };
    draft.room.monsterDeclarations = [
      {
        id: 'goblin-1',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 1, r: 0 } },
      },
    ];
    draft.room.monsterBindings = {
      'goblin-1': {
        faction: 'goblins',
        options: [
          {
            id: 'lean-on-it',
            say: "Where's the cellar?",
            check: [{ ability: 'intimidation', dc: 12 }],
            success: [
              {
                weight: 70,
                say: 'Behind the barrels.',
                fact: 'goblin-cowed',
              },
              { weight: 30, say: 'Boss! BOSS!', flee: {} },
            ],
            failure: [{ say: 'Big talk.' }],
          },
          {
            id: 'bribe',
            say: 'Ten gold says you never saw us.',
            requires: { holds: 'purse' },
            check: [
              { ability: 'persuasion', dc: 8 },
              { ability: 'deception', dc: 10, tool: 'dnd5e:items:dice' },
            ],
            success: [{ say: 'Saw who?', fact: 'party-unseen' }],
          },
        ],
      },
    };
    draft.room.propBindings = {
      purse: { holdable: true },
      altar: {
        options: [
          {
            id: 'examine',
            say: 'Examine the altar.',
            requires: { fact: 'altar-noticed' },
            check: [{ ability: 'religion', dc: 12 }],
            success: [{ say: 'The Pale One.', fact: 'king-is-cultist' }],
            failure: [{ say: 'Old stone, old candles.' }],
          },
        ],
      },
    };
    return draft;
  }

  it('round-trips a binding with two options and a prop with one', () => {
    const draft = optionsDraft();
    const roundTrip = parseRoomDraftJson(stringifyRoomDraft(draft));
    expect(roundTrip).toEqual(draft);
    expect(
      roundTrip.room.monsterBindings?.['goblin-1'].options?.map((o) => o.id)
    ).toEqual(['lean-on-it', 'bribe']);
    expect(roundTrip.room.propBindings?.altar.options?.[0].requires).toEqual({
      fact: 'altar-noticed',
    });
  });

  it('refuses each defect of a line in the engine’s own words', () => {
    const refusal = (mutate: (draft: RoomDraft) => void): (() => string) => {
      const draft = optionsDraft();
      mutate(draft);
      return () => stringifyRoomDraft(draft);
    };
    const goblin = (draft: RoomDraft) =>
      draft.room.monsterBindings!['goblin-1'].options!;
    const altar = (draft: RoomDraft) => draft.room.propBindings!.altar.options!;

    expect(refusal((d) => (goblin(d)[0].id = ''))).toThrow(
      'Monster binding for goblin-1 options[0].id: the option has no id'
    );
    expect(refusal((d) => (goblin(d)[1].id = 'lean-on-it'))).toThrow(
      'options[1].id: option "lean-on-it" is already declared at options[0]'
    );
    expect(refusal((d) => (goblin(d)[0].say = ''))).toThrow(
      'options[0].say: the option does not say what the character says'
    );
    expect(refusal((d) => (goblin(d)[0].check = []))).toThrow(
      'options[0].check: this option needs at least one way to make its check — an ability and a DC'
    );
    expect(refusal((d) => (goblin(d)[0].check[0].ability = ''))).toThrow(
      'options[0].check[0].ability: the approach does not say which ability it rolls'
    );
    expect(refusal((d) => (goblin(d)[0].check[0].dc = 0))).toThrow(
      'options[0].check[0].dc: an approach with dc 0 has nothing to beat'
    );
    expect(
      refusal(
        (d) =>
          ((goblin(d)[0] as unknown as Record<string, unknown>).requires = {
            round: 2,
          })
      )
    ).toThrow(
      'options[0].requires: an option requires { fact: <id> }, { holds: <prop id> }, or { not: } one of them, and `round` is none of them'
    );
    expect(refusal((d) => (goblin(d)[0].failure = []))).toThrow(
      'options[0].failure: `failure` lists nothing — omit it, or write what is answered'
    );
    // A verdict row is judged by the table's own grammar, under the verdict.
    expect(
      refusal(
        (d) =>
          (goblin(d)[0].failure = [
            { say: 'Get out.', attack: 'enemy' } as never,
          ])
      )
    ).toThrow(
      'options[0].failure[0].attack: `attack` is what a creature does with time, and `failure` is an outcome'
    );
    expect(
      refusal(
        (d) =>
          (goblin(d)[0].success = [
            { when: { enemy: 'seen' }, say: 'Fine.' } as never,
          ])
      )
    ).toThrow(
      'options[0].success[0].when: `success` is already the condition — a `when` under it asks when a thing that just happened happened'
    );
    // A prop cannot run.
    expect(
      refusal((d) => (altar(d)[0].success = [{ say: 'Wobble.', flee: {} }]))
    ).toThrow(
      "Prop binding for altar options[0].success[0].flee: a prop cannot run: `flee` is a creature's answer"
    );
    // `requires: { holds }` names a placed prop somebody can pick up.
    expect(
      refusal((d) => (goblin(d)[1].requires = { holds: 'crown' }))
    ).toThrow(
      'Monster binding for goblin-1 options[1].requires.holds: "crown" is not a prop in this dungeon, so nobody can hold it'
    );
    expect(
      refusal((d) => (goblin(d)[1].requires = { holds: 'altar' }))
    ).toThrow('"altar" is a prop nobody can pick up, so nobody can hold it');
    // A `not` of a holding names its prop one level down (rpg-project#719).
    expect(
      refusal((d) => (goblin(d)[1].requires = { not: { holds: 'crown' } }))
    ).toThrow(
      'Monster binding for goblin-1 options[1].requires.not.holds: "crown" is not a prop in this dungeon, so nobody can hold it'
    );
    expect(
      refusal(
        (d) =>
          ((goblin(d)[0] as unknown as Record<string, unknown>).intimidate = [])
      )
    ).toThrow('field intimidate not found in type dungeonspec.OptionSpec');
  });
});

describe('painting into regions (rpg-project#725 R5)', () => {
  const blank = () => createRoomDraft(createEmptyScene('scene'), 'room');

  it('paints into the implicit region by default, and the floor is the union', () => {
    const draft = paintCells(blank(), [
      { q: 2, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: -1 },
    ]);
    expect(draft.room.regions).toEqual([
      {
        id: 'room-region',
        name: 'Untitled room',
        lighting: { intensity: 1 },
        cells: [
          { r: -1, q: [[0, 0]] },
          { r: 0, q: [[0, 2]] },
        ],
      },
    ]);
    expect(floorCells(draft)).toEqual([
      { q: 0, r: -1 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
    expect(floorCellCount(draft)).toBe(4);
  });

  it('lists the implicit region again when paint lands in it after it was dropped', () => {
    const draft = createRegion(blank(), 'hall', 'Hall');
    draft.room.regions = draft.room.regions.filter((r) => r.id === 'hall');
    const painted = paintCells(draft, [{ q: 0, r: 0 }]);
    expect(painted.room.regions.map((r) => r.id)).toEqual([
      'room-region',
      'hall',
    ]);
    expect(() => paintCells(draft, [{ q: 0, r: 0 }], 'nowhere')).toThrow(
      'Region does not exist: nowhere.'
    );
  });

  it('reassigns a cell another region held: brushing with a region active moves it, the floor does not change', () => {
    let draft = paintCells(blank(), [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
    draft = createRegion(draft, 'gatehouse', 'Gatehouse');
    const floor = floorCells(draft);
    const moved = paintCells(draft, [{ q: 1, r: 0 }], 'gatehouse');
    expect(floorCells(moved)).toEqual(floor);
    expect(cellOwners(moved).get('1,0')).toBe('gatehouse');
    expect(moved.room.regions[0]!.cells).toEqual([
      {
        r: 0,
        q: [
          [0, 0],
          [2, 2],
        ],
      },
    ]);
    expect(moved.room.regions[1]!.cells).toEqual([{ r: 0, q: [[1, 1]] }]);
    expect(paintCells(moved, [{ q: 1, r: 0 }], 'gatehouse')).toBe(moved);
  });

  it('erases to no region: the cell stops being floor, its region stays listed', () => {
    let draft = createRegion(blank(), 'cellar', 'Cellar');
    draft = paintCells(draft, [{ q: 4, r: 4 }], 'cellar');
    const erased = eraseCells(draft, [{ q: 4, r: 4 }]);
    expect(isFloorCell(erased, { q: 4, r: 4 })).toBe(false);
    expect(erased.room.regions.find((r) => r.id === 'cellar')).toEqual({
      id: 'cellar',
      name: 'Cellar',
      lighting: { intensity: 1 },
      cells: [],
    });
  });

  it('refuses a cell in two regions at the later listing, naming the first owner, as the engine does', () => {
    const draft = createRegion(blank(), 'yard', 'Yard');
    draft.room.regions[0]!.cells = [{ r: 0, q: [[-3, 0]] }];
    draft.room.regions[1]!.cells = [{ r: 0, q: [[0, 2]] }];
    expect(() => stringifyRoomDraft(draft)).toThrow(
      'room.room.regions[1].cells[0].q[0]: already belongs to region "room-region"'
    );
  });

  it('judges each region in the engine words: id, lighting, rows', () => {
    const reject = (mutate: (draft: RoomDraft) => void) => {
      const draft = paintCells(blank(), [{ q: 0, r: 0 }]);
      mutate(draft);
      return () => stringifyRoomDraft(draft);
    };
    expect(
      reject((d) => {
        d.room.regions[0]!.lighting = { intensity: 1.5 };
      })
    ).toThrow(
      'room.room.regions[0].lighting.intensity: must be between 0 and 1'
    );
    expect(
      reject((d) => {
        d.room.regions[0]!.cells = [
          {
            r: 0,
            q: [
              [1, 3],
              [4, 6],
            ],
          },
        ];
      })
    ).toThrow(
      'room.room.regions[0].cells[0].q[1]: spans must be ascending and merged'
    );
    expect(
      reject((d) => {
        d.room.regions = [];
      })
    ).toThrow('room.room.regions: must not be empty');
    expect(
      reject((d) => {
        d.room.regions.push({ ...d.room.regions[0]!, cells: [] });
      })
    ).toThrow('room.room.regions[1].id: duplicate identity room-region.');
    expect(
      reject((d) => {
        (d.room as unknown as Record<string, unknown>).walkableHexes = [];
      })
    ).toThrow(
      'room.room.walkableHexes: regions are the floor (rpg-project#725); a cell is floor when a region lists it'
    );
  });
});
