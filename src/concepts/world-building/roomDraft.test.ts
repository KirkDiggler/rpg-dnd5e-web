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
  parseRoomDocumentJson,
  parseRoomDraftJson,
  placeRoomMonster,
  reconcileRoomDraft,
  remapRoomDeclarations,
  removeRoomMonster,
  ROOM_DRAFT_ENVELOPE_VERSION,
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
import type { SiteScope } from './siteScope';
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
          // THE CURRENT VERSION, because this probes WORKSPACE bounds
          // (rpg-project#501 §6.1). A v3 envelope is refused earlier and by
          // name — it stored the old monster shape — so pinning 3 here would
          // test the wrong refusal.
          version: ROOM_DRAFT_ENVELOPE_VERSION,
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
      startingCell: { location: { q: 2, r: -1 } },
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
    // The CURRENT envelope version, whatever it is this build — this test is
    // about which KEY is written and that legacy bytes are left alone, not
    // about the number (rpg-project#501 §6.1 moved it to 5).
    expect(written.version).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
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
          startingCell: { location: { q: 0, r: 0 } },
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
      parseRoomDraftJson(stringifyRoomDraft(unknownId)).room.monsters
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
    expectRejected(
      [
        {
          id: 'm1',
          ref: 'dnd5e:monsters:zombie',
          startingCell: { location: { q: 7, r: 0 } },
        },
      ],
      /outside the authoring floor/
    );
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
    base.room.walkableHexes = [{ q: 0, r: 0 }];
    const placed = placeRoomMonster(base, {
      id: 'guard-1',
      ref: 'dnd5e:monsters:thug',
      startingCell: { location: { q: 0, r: 0 }, facing: 'ne' },
    });
    expect(placed.room.monsters[0].startingCell).toEqual({
      location: { q: 0, r: 0 },
      facing: 'ne',
    });
    expect(
      parseRoomDraftJson(stringifyRoomDraft(placed)).room.monsters[0]
        .startingCell
    ).toEqual({ location: { q: 0, r: 0 }, facing: 'ne' });
  });

  it('refuses a facing outside the eight compass names', () => {
    // The vocabulary is closed, so a word outside it is refused with the names
    // that ARE legal rather than carried to the engine.
    const base = createRoomDraft(createEmptyScene('scene-bad'), 'room-bad');
    base.room.walkableHexes = [{ q: 0, r: 0 }];
    expect(() =>
      stringifyRoomDraft({
        ...base,
        room: {
          ...base.room,
          monsters: [
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
    base.room.walkableHexes = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    const placed = placeRoomMonster(base, {
      id: 'guard-1',
      ref: 'dnd5e:monsters:thug',
      startingCell: { location: { q: 0, r: 0 }, facing: 'sw' },
    });
    const moved = moveRoomMonster(placed, 'guard-1', { q: 1, r: 0 });
    expect(moved.room.monsters[0].startingCell).toEqual({
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
        faction: 'goblins',
      }),
      {
        id: 'goblin-2',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 2, r: 0 } },
      }
    );
    withActors.room.monsterBindings = {
      'goblin-1': {
        on: {
          intimidated: [
            { weight: 70, say: 'Fine!', fact: 'goblin-cowed' },
            { weight: 30, flee: {} },
          ],
          time: [
            { when: { enemy: 'reach' }, attack: 'enemy' },
            { toward: { at: [3, 4] } },
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

  it("a binding's temper is ONE word — the faction's mix is refused there", () => {
    const draft = createRoomDraft(
      createEmptyScene('scene-temper'),
      'room-temper'
    );
    draft.room.monsters = [
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
    draft.room.monsters = [
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
    // A key this dialect's binding does not carry is still refused as the
    // unknown key it is — the boundary `intimidate` sits INSIDE of, because it
    // is read even though no control offers it (rpg-dnd5e-web#1201).
    expect(rejection({ 'goblin-1': { intimidating: {} } })).toThrow(
      /Monster binding for goblin-1 has an unsupported field: intimidating/
    );
    expect(rejection({ 'goblin-1': {} })).toThrow(
      /Monster binding for goblin-1 declares no orders/
    );
    expect(rejection({ 'goblin-1': { actions: [] } })).toThrow(
      /Monster binding for goblin-1 actions is empty/
    );
    // READ, NEVER OFFERED (rpg-dnd5e-web#1201). Kirk removed the priced checks
    // from the builder — a check is a property of INTERACTING WITH AN NPC, and
    // a hostile monster is not one — but a document authored before that still
    // carries them and the ENGINE still reads them. So they must still open and
    // still round-trip; refusing them here would make an editable file
    // unopenable while the server accepts it.
    const withChecks = {
      'goblin-1': { intimidate: [{ ability: 'intimidation', dc: 12 }] },
    };
    expect(rejection(withChecks)).not.toThrow();
    (draft.room as unknown as Record<string, unknown>).monsterBindings =
      withChecks;
    expect(
      parseRoomDraftJson(stringifyRoomDraft(structuredClone(draft))).room
        .monsterBindings?.['goblin-1'].intimidate
    ).toEqual([{ ability: 'intimidation', dc: 12 }]);
    expect(rejection({ 'goblin-1': { actions: ['dnd5e:weapons'] } })).toThrow(
      /must be a weapon reference/
    );
  });

  it('drops the orders when their creature is removed, leaving no orphan', () => {
    const draft = createRoomDraft(createEmptyScene('scene-drop'), 'room-drop');
    draft.room.monsters = [
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
    draft.room.monsters = [
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
    draft.room.walkableHexes = [{ q: 0, r: 0 }];
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

  it('refuses a faction id that is not a faction id', () => {
    const draft = createRoomDraft(
      createEmptyScene('scene-bad-faction'),
      'room-bad-faction'
    );
    (draft.room as unknown as Record<string, unknown>).monsters = [
      {
        id: 'goblin-1',
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 1, r: 0 } },
        faction: 'The Goblins',
      },
    ];
    expect(() => stringifyRoomDraft(draft)).toThrow(
      /faction must be a faction id such as goblins/
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
      startingCell: { location: { q: 5, r: -5 } },
    });
    const withStart = setRoomPartyStart(withActor, { q: 5, r: -5 });
    const roundTrip = parseRoomDraftJson(stringifyRoomDraft(withStart));
    expect(roundTrip.room.monsters).toEqual([
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
    expect(moved.room.monsters[0]).toEqual({
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
    expect(() =>
      moveRoomMonster(draft, 'skeleton-a', { q: 9.5, r: 0 })
    ).toThrow(/outside the authoring floor/);
    expect(() =>
      placeRoomMonster(draft, {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:zombie',
        startingCell: { location: { q: 0, r: 0 } },
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
    // A PRE-`startingCell` ENVELOPE IS REFUSED BY NAME (rpg-project#501 §6.1),
    // which is now what a v3 envelope means — it stored `monsters[].cell`, a
    // shape this build no longer reads. The sentence names the change and says
    // to rebuild, because Kirk ruled migration out (there is one custom
    // dungeon). A scope riding along does not change that: the shape is the
    // older one either way.
    const v3 = JSON.stringify({
      kind: 'rpg-room-authoring-draft',
      version: 3,
      draft: JSON.parse(stringifyRoomDraft(draft)).draft,
      scope,
    });
    expect(() => parseRoomDocumentJson(v3)).toThrow(
      /saved before monsters carried a `startingCell`/
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
