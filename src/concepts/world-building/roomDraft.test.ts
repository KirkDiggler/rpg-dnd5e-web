import { describe, expect, it } from 'vitest';
import {
  createRoomDraft,
  expandRoomWorkspace,
  parseRoomDraftJson,
  reconcileRoomDraft,
  remapRoomDeclarations,
  ROOM_WORKSPACE_STEPS,
  stringifyRoomDraft,
  updateWalkableHexes,
  walkableCellsInWorldRectangle,
} from './roomDraft';
import {
  createEmptyScene,
  duplicateSelection,
  stampArrangement,
} from './sceneState';
import { validateScene } from './serialization';

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

    expect(migrated.version).toBe(2);
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
          version: 2,
          draft: {
            ...draft,
            workspace: { hexRadius: 100, horizontalLimit: 200 },
          },
        })
      )
    ).toThrow(/Unsupported room workspace extent/);
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
