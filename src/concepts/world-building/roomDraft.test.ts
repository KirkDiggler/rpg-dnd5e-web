import { describe, expect, it } from 'vitest';
import {
  createRoomDraft,
  parseRoomDraftJson,
  reconcileRoomDraft,
  remapRoomDeclarations,
  stringifyRoomDraft,
  updateWalkableHexes,
  walkableCellsInWorldRectangle,
} from './roomDraft';
import { createEmptyScene } from './sceneState';

describe('room authoring draft', () => {
  it('round trips a versioned room envelope separately from composer data', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    const painted = updateWalkableHexes(draft, [{ q: 1, r: -2 }], 'paint');
    expect(parseRoomDraftJson(stringifyRoomDraft(painted))).toEqual(painted);
    expect(stringifyRoomDraft(painted)).toContain('rpg-room-authoring-draft');
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
