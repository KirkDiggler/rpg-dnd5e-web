import { describe, expect, it } from 'vitest';
import {
  clearRoomPartyStart,
  createRoomDraft,
  expandRoomWorkspace,
  isCellWithinWorkspace,
  LEGACY_ROOM_DRAFT_STORAGE_KEY,
  LEGACY_V1_ROOM_DRAFT_STORAGE_KEY,
  loadRoomDraft,
  moveRoomMonster,
  parseRoomDraftJson,
  placeRoomMonster,
  reconcileRoomDraft,
  remapRoomDeclarations,
  removeRoomMonster,
  ROOM_DRAFT_STORAGE_KEY,
  ROOM_WORKSPACE_STEPS,
  saveRoomDraft,
  setRoomPartyStart,
  stringifyRoomDraft,
  updateWalkableHexes,
  walkableCellsInWorldRectangle,
  type RoomDraft,
  type RoomPropDeclaration,
} from './roomDraft';
import {
  createEmptyScene,
  duplicateSelection,
  stampArrangement,
} from './sceneState';
import { validateScene } from './serialization';
import type { KeyValueStorage } from './types';

describe('room authoring draft', () => {
  it('round trips a versioned room envelope separately from composer data', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const painted = updateWalkableHexes(draft, [{ q: 1, r: -2 }], 'paint');
    expect(parseRoomDraftJson(stringifyRoomDraft(painted))).toEqual(painted);
    expect(stringifyRoomDraft(painted)).toContain('rpg-room-authoring-draft');
  });

  it('expands only workspace metadata by a bounded deterministic step', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const before = structuredClone(draft);
    const expanded = expandRoomWorkspace(draft);

    expect(expanded.workspace).toEqual(ROOM_WORKSPACE_STEPS[1]);
    expect({ ...expanded, workspace: before.workspace }).toEqual(before);
    expect(
      expandRoomWorkspace(expandRoomWorkspace(expanded)).workspace
    ).toEqual(ROOM_WORKSPACE_STEPS[2]);
  });

  it('migrates a version 1 small draft without moving or clipping authored data', () => {
    const current = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const legacyDraft = {
      ...current,
      version: 1,
      workspace: undefined,
      room: { ...current.room, walkableHexes: [{ q: 6, r: -6 }] },
    };
    const migrated = parseRoomDraftJson(
      JSON.stringify({
        kind: 'rpg-room-authoring-draft',
        version: 1,
        draft: legacyDraft,
      })
    );

    expect(migrated.version).toBe(3);
    expect(migrated.workspace).toEqual(ROOM_WORKSPACE_STEPS[0]);
    expect(migrated.room.walkableHexes).toEqual([{ q: 6, r: -6 }]);
    expect(migrated.scene).toEqual(current.scene);
  });

  it('accepts expanded room coordinates and cells while standalone scenes keep +/-12', () => {
    const draft = expandRoomWorkspace(
      createRoomDraft(createEmptyScene('scene-1'), 'room-1')
    );
    draft.scene.items.push({
      id: 'table',
      kind: 'prop',
      assetRef: 'dnd5e:props:torture-table',
      label: 'table',
      transform: { x: 15, y: 0, z: 0, rotationY: 0 },
    });
    const painted = updateWalkableHexes(draft, [{ q: 8, r: -8 }], 'paint');

    expect(parseRoomDraftJson(stringifyRoomDraft(painted))).toEqual(painted);
    expect(painted.room.walkableHexes).toContainEqual({ q: 8, r: -8 });
    expect(() => validateScene(draft.scene)).toThrow(/between -12 and 12/);
  });

  it('keeps duplicate and arrangement stamp paths valid in expanded room space', () => {
    const draft = expandRoomWorkspace(
      createRoomDraft(createEmptyScene('scene-1'), 'room-1')
    );
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

  it('rejects unsupported or excessive workspace input without clipping', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    expect(() =>
      parseRoomDraftJson(
        JSON.stringify({
          kind: 'rpg-room-authoring-draft',
          version: 3,
          draft: {
            ...draft,
            workspace: { hexRadius: 100, horizontalLimit: 200 },
          },
        })
      )
    ).toThrow(/Unsupported room workspace extent/);
  });

  it('returns the same draft for logical no-op paint and erase', () => {
    const draft = updateWalkableHexes(
      createRoomDraft(createEmptyScene('scene-1'), 'room-1'),
      [{ q: 0, r: 0 }],
      'paint'
    );

    expect(updateWalkableHexes(draft, [{ q: 0, r: 0 }], 'paint')).toBe(draft);
    expect(updateWalkableHexes(draft, [{ q: 1, r: 0 }], 'erase')).toBe(draft);
    expect(updateWalkableHexes(draft, [{ q: 99, r: 0 }], 'paint')).toBe(draft);
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
    const forward = walkableCellsInWorldRectangle(
      { x: -0.2, z: -0.2 },
      { x: 2, z: 1.6 }
    );
    const reverse = walkableCellsInWorldRectangle(
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
    expect(
      walkableCellsInWorldRectangle({ x: -1, z: -1.6 }, { x: 1, z: 1.6 })
    ).toEqual([
      { q: 0, r: -1 },
      { q: 1, r: -1 },
      { q: 0, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
  });

  it('returns the same candidates for preview and release and safely allows an empty box', () => {
    const start = { x: 0.2, z: 0.2 };
    const end = { x: 0.3, z: 0.3 };
    expect(walkableCellsInWorldRectangle(start, end)).toEqual([]);
    expect(walkableCellsInWorldRectangle(start, { x: 3.5, z: 3.1 })).toEqual(
      walkableCellsInWorldRectangle(start, { x: 3.5, z: 3.1 })
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
function legacyV2Envelope(): Record<string, unknown> {
  return {
    kind: 'rpg-room-authoring-draft',
    version: 2,
    draft: {
      version: 2,
      id: 'legacy-room',
      name: 'Legacy cellar',
      coordinateFrame: {
        horizontalPlane: 'world-xz',
        verticalAxis: 'world-y-up',
        distanceUnit: 'world-scene-unit',
        hexRadius: 1,
        footprintFrame: 'owner-local-xz',
      },
      workspace: { hexRadius: 10, horizontalLimit: 20 },
      scene: {
        version: 1,
        id: 'legacy-scene',
        name: 'Legacy cellar scene',
        items: [
          {
            id: 'prop-table',
            kind: 'prop',
            assetRef: 'dnd5e:props:torture-table',
            label: 'Long table',
            transform: { x: -2.25, y: 1.2, z: 1.3, rotationY: 0.37 },
            heightScale: 1.5,
          },
          {
            id: 'prop-candles',
            kind: 'prop',
            assetRef: 'dnd5e:props:candles',
            label: 'Candles',
            transform: { x: -2.1, y: 1.17, z: 1.25, rotationY: -0.41 },
            parentId: 'group-1',
            supportId: 'prop-table',
            pointLight: {
              enabled: true,
              offset: { x: 0, y: 0.5, z: 0 },
              color: '#ff9d52',
              intensity: 1.1,
              range: 2.6,
            },
          },
        ],
        groups: [
          {
            id: 'group-1',
            kind: 'group',
            label: 'Cluster',
            transform: { x: -2.175, y: 0.6, z: 1.275, rotationY: 0.37 },
          },
        ],
      },
      room: {
        implicitRegionId: 'legacy-room-region',
        walkableHexes: [
          { q: 0, r: 0 },
          { q: 2, r: -1 },
          { q: -3, r: 1 },
        ],
        propDeclarations: {
          'prop-table': {
            blocksMovement: true,
            blocksLineOfSight: false,
            footprint: {
              width: 1.2,
              depth: 0.5,
              offsetX: 0.1,
              offsetZ: -0.2,
            },
          },
        },
        arrangementDeclarations: {
          'arrangement-1': {
            'prop-table': {
              blocksMovement: false,
              blocksLineOfSight: false,
              footprint: {
                width: 0.6,
                depth: 0.5,
                offsetX: 0,
                offsetZ: 0,
              },
            },
          },
        },
      },
    },
  };
}

function legacyV1Envelope(): Record<string, unknown> {
  const envelope = legacyV2Envelope();
  envelope.version = 1;
  const draft = envelope.draft as Record<string, unknown>;
  draft.version = 1;
  delete draft.workspace;
  return envelope;
}

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

function draftOfEnvelope(envelope: Record<string, unknown>): RoomDraft {
  return parseRoomDraftJson(JSON.stringify(envelope));
}

describe('room draft v3 migration and structural exactness', () => {
  it('upgrades a fixed legacy version 2 envelope losslessly into v3', () => {
    const legacy = legacyV2Envelope();
    const migrated = draftOfEnvelope(legacy);

    expect(migrated.version).toBe(3);
    expect(migrated.id).toBe('legacy-room');
    expect(migrated.name).toBe('Legacy cellar');
    expect(migrated.workspace).toEqual({
      hexRadius: 10,
      horizontalLimit: 20,
    });
    expect(migrated.scene.items[0]?.transform).toEqual({
      x: -2.25,
      y: 1.2,
      z: 1.3,
      rotationY: 0.37,
    });
    expect(migrated.scene.items[1]?.heightScale).toBeUndefined();
    expect(migrated.room.walkableHexes).toEqual([
      { q: 0, r: 0 },
      { q: 2, r: -1 },
      { q: -3, r: 1 },
    ]);
    expect(migrated.room.propDeclarations['prop-table']).toEqual({
      blocksMovement: true,
      blocksLineOfSight: false,
      footprint: { width: 1.2, depth: 0.5, offsetX: 0.1, offsetZ: -0.2 },
    });
    expect(
      migrated.room.arrangementDeclarations['arrangement-1']['prop-table']
        .blocksMovement
    ).toBe(false);
    // Lossless v2 -> v3: monsters arrive empty and no start is invented.
    expect(migrated.room.monsters).toEqual([]);
    expect('partyStart' in migrated.room).toBe(false);
  });

  it('migrates a fixed legacy version 1 envelope through its default workspace', () => {
    const migrated = draftOfEnvelope(legacyV1Envelope());
    expect(migrated.version).toBe(3);
    expect(migrated.workspace).toEqual(ROOM_WORKSPACE_STEPS[0]);
    expect(migrated.room.walkableHexes).toContainEqual({ q: -3, r: 1 });
    expect(migrated.room.monsters).toEqual([]);
  });

  it('keeps legacy stored bytes byte-identical and writes only v3 to the current key', () => {
    const storage = new RecordingStorage();
    const legacyRaw = JSON.stringify(legacyV2Envelope());
    storage.values.set(LEGACY_ROOM_DRAFT_STORAGE_KEY, legacyRaw);

    const loaded = loadRoomDraft(
      storage,
      createRoomDraft(createEmptyScene('blank'), 'blank')
    );
    expect(loaded.error).toBeUndefined();
    const painted = updateWalkableHexes(
      loaded.value,
      [{ q: 1, r: 0 }],
      'paint'
    );
    const withActor = placeRoomMonster(painted, {
      id: 'actor-1',
      ref: 'dnd5e:monsters:zombie',
      cell: { q: 2, r: -1 },
    });
    expect(saveRoomDraft(storage, withActor)).toBeNull();

    // Old local bytes are never removed or rewritten during load or save.
    expect(storage.values.get(LEGACY_ROOM_DRAFT_STORAGE_KEY)).toBe(legacyRaw);
    expect(storage.writes.map((write) => write.key)).toEqual([
      ROOM_DRAFT_STORAGE_KEY,
    ]);
    const written = JSON.parse(
      storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}'
    ) as { version: number; draft: RoomDraft };
    expect(written.version).toBe(3);
    expect(written.draft.room.monsters).toHaveLength(1);
  });

  it('never recovers older keys when the current v3 record is empty or malformed', () => {
    const legacyV2 = JSON.stringify(legacyV2Envelope());
    const legacyV1 = JSON.stringify(legacyV1Envelope());
    for (const corrupt of ['', '{bad-v3', JSON.stringify(null)]) {
      const storage = new RecordingStorage();
      storage.values.set(ROOM_DRAFT_STORAGE_KEY, corrupt);
      storage.values.set(LEGACY_ROOM_DRAFT_STORAGE_KEY, legacyV2);
      storage.values.set(LEGACY_V1_ROOM_DRAFT_STORAGE_KEY, legacyV1);
      const fallback = createRoomDraft(
        createEmptyScene('fallback-scene'),
        'fallback-room'
      );

      const result = loadRoomDraft(storage, fallback);
      expect(result.value.id).toBe('fallback-room');
      expect(result.error).toMatch(/Room draft load failed/);
      // The present-but-invalid record is not reinterpreted, not recovered
      // from older bytes, and not overwritten by this load.
      expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);
      expect(storage.values.get(LEGACY_ROOM_DRAFT_STORAGE_KEY)).toBe(legacyV2);
      expect(storage.values.get(LEGACY_V1_ROOM_DRAFT_STORAGE_KEY)).toBe(
        legacyV1
      );
      expect(storage.writes).toEqual([]);
    }
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
      draft.room.walkableHexes.push({ q: 1, r: 0 });
      (draft.room as unknown as Record<string, unknown>).monstersPerCell = 1;
    }, /Room gameplay data has an unsupported field: monstersPerCell/);
    expectRejected((draft) => {
      (draft.coordinateFrame as unknown as Record<string, unknown>).engineUnit =
        'feet';
    }, /Room coordinate frame has an unsupported field: engineUnit/);
    expectRejected((draft) => {
      draft.room.walkableHexes = [{ q: 0, r: 0 }];
      draft.room.monsters = [
        {
          id: 'm',
          ref: 'dnd5e:monsters:zombie',
          cell: { q: 0, r: 0 },
          facing: 0,
        },
      ] as unknown as RoomDraft['room']['monsters'];
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
      (draft.room as unknown as Record<string, unknown>).monsters = monsters;
      return draft;
    };
    const expectRejected = (monsters: unknown[], re: RegExp) =>
      expect(() => stringifyRoomDraft(withMonsters(monsters))).toThrow(re);

    // Ref type is a monster reference: arbitrary module/type such as a
    // weapon reference is refused, while a syntactically valid unknown
    // monster id stays editable.
    expectRejected(
      [{ id: 'm1', ref: 'dnd5e:weapons:longsword', cell: { q: 0, r: 0 } }],
      /ref must be a monster reference/
    );
    expectRejected(
      [{ id: 'm1', ref: 'dnd5e:monsters', cell: { q: 0, r: 0 } }],
      /ref must be a monster reference/
    );
    const unknownId = withMonsters([
      {
        id: 'homebrew-1',
        ref: 'dnd5e:monsters:not-yet-modeled',
        cell: { q: 0, r: 0 },
      },
    ]);
    expect(
      parseRoomDraftJson(stringifyRoomDraft(unknownId)).room.monsters
    ).toEqual([
      {
        id: 'homebrew-1',
        ref: 'dnd5e:monsters:not-yet-modeled',
        cell: { q: 0, r: 0 },
      },
    ]);

    expectRejected(
      [{ id: 'm1', ref: 'dnd5e:monsters:zombie', cell: { q: 0.5, r: 0 } }],
      /must contain integral axial coordinates/
    );
    expectRejected(
      [{ id: 'm1', ref: 'dnd5e:monsters:zombie', cell: { q: 7, r: 0 } }],
      /outside the authoring floor/
    );
    expectRejected(
      [
        { id: 'm1', ref: 'dnd5e:monsters:zombie', cell: { q: 0, r: 0 } },
        { id: 'm1', ref: 'dnd5e:monsters:skeleton', cell: { q: 1, r: 0 } },
      ],
      /stable nonempty unique ids are required/
    );
    expectRejected(
      [{ id: 'm1', ref: 'dnd5e:monsters:zombie', cell: null }],
      /must contain integral axial coordinates/
    );
  });

  it('retains structurally valid actor arrangements that are merely game-illegal', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft.room.walkableHexes = [{ q: 0, r: 0 }];
    // Off painted floor and overlapping the party start: the encounter owns
    // legality, so this draft must stay retainable verbatim.
    const withActor = placeRoomMonster(draft, {
      id: 'skeleton-a',
      ref: 'dnd5e:monsters:skeleton',
      cell: { q: 5, r: -5 },
    });
    const withStart = setRoomPartyStart(withActor, { q: 5, r: -5 });
    const roundTrip = parseRoomDraftJson(stringifyRoomDraft(withStart));
    expect(roundTrip.room.monsters).toEqual([
      {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:skeleton',
        cell: { q: 5, r: -5 },
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
      cell: { q: 1, r: -1 },
    });
    // A move retains the minted identity and only changes the cell.
    const moved = moveRoomMonster(draft, 'skeleton-a', { q: 2, r: -2 });
    expect(moved.room.monsters[0]).toEqual({
      id: 'skeleton-a',
      ref: 'dnd5e:monsters:skeleton',
      cell: { q: 2, r: -2 },
    });
    // No-op mutations return the same draft so the editor commits nothing.
    expect(moveRoomMonster(draft, 'absent', { q: 0, r: 0 })).toBe(draft);
    expect(setRoomPartyStart(draft, { q: 0, r: 0 })).toBe(draft);
    expect(clearRoomPartyStart(moved).room.partyStart).toBeUndefined();
    const cleared = clearRoomPartyStart(moved);
    expect(clearRoomPartyStart(cleared)).toBe(cleared);
    expect(() =>
      moveRoomMonster(draft, 'skeleton-a', { q: 9.5, r: 0 })
    ).toThrow(/outside the authoring floor/);
    expect(() =>
      placeRoomMonster(draft, {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:zombie',
        cell: { q: 0, r: 0 },
      })
    ).toThrow(/already placed/);
    const removed = removeRoomMonster(moved, 'skeleton-a');
    expect(removed.room.monsters).toEqual([]);
    expect(removed.room.partyStart).toEqual({ q: 0, r: 0 });
  });

  it('checks workspace membership structurally for any axial cell', () => {
    expect(isCellWithinWorkspace({ q: 0, r: 0 }, 6)).toBe(true);
    expect(isCellWithinWorkspace({ q: 6, r: -3 }, 6)).toBe(true);
    expect(isCellWithinWorkspace({ q: 7, r: -3 }, 6)).toBe(false);
    expect(isCellWithinWorkspace({ q: 0.5, r: 0 }, 6)).toBe(false);
    expect(isCellWithinWorkspace({ q: NaN, r: 0 }, 6)).toBe(false);
  });
});
