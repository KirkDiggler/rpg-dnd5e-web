import { expect, it } from 'vitest';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import { createRoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import {
  addWallOpening,
  createWall,
  isRepeatableWallAsset,
  repeatableWallAssetRefs,
  rotateWall,
} from './structuralWallEditing';
import { createStudioDoor } from './studioDoorEditing';
import { assertWallHeightEdit } from './wallHeightEdits';
import {
  addWallSection,
  editWallSection,
  removeWallSection,
  wallSectionOptions,
} from './wallSectionEditing';
const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_window_03';
const makeWall = () =>
  createWall({
    id: 'wall',
    start: { x: 0, z: 0 },
    end: { x: 12, z: 0 },
    assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_01',
    height: 6,
    thickness: 0.375,
    elevation: 0,
  });
it('offers only explicitly configured static sections, not leaves or unrelated props', () => {
  const refs = wallSectionOptions().map((row) => row.ref);
  expect(refs).toContain(ref);
  expect(repeatableWallAssetRefs()).not.toContain(ref);
  // Existing documents with the old repeat intent still render; only new choice is constrained.
  expect(isRepeatableWallAsset(WORLD_BUILDING_CATALOG_BY_REF.get(ref)!)).toBe(
    true
  );
  expect(refs).not.toContain(
    'dnd5e:env:fantasy-kingdom:castle_door_leaf_single_01'
  );
  expect(refs).not.toContain('dnd5e:env:fantasy-kingdom:castle_wall_01');
});
it('uses an already configured leafless opening as visual art, without creating a gameplay opening', () => {
  const opening = 'dnd5e:env:fantasy-kingdom:castle_wall_opening_single_01';
  expect(wallSectionOptions().map((row) => row.ref)).toContain(opening);
  expect(repeatableWallAssetRefs()).not.toContain(opening);
  const before = makeWall(),
    after = addWallSection(before, {
      id: 'frame',
      assetRef: opening,
      position: 6,
    });
  expect(after.appearance.sections![0].width).toBeCloseTo(3.75, 4);
  expect(after.openings).toEqual([]);
  expect(after.blocker).toEqual(before.blocker);
  expect(wallSectionOptions().map((row) => row.ref)).not.toContain(
    'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01'
  );
});
it('adds, moves and removes a section as an immutable edit of one wall', () => {
  const original = makeWall(),
    placed = addWallSection(original, {
      id: 'window',
      assetRef: ref,
      position: 6,
    });
  expect(placed.id).toBe(original.id);
  expect(placed.blocker).toEqual(original.blocker);
  expect(placed.openings).toEqual([]);
  expect(placed.appearance.sections).toEqual([
    {
      id: 'window',
      assetRef: ref,
      position: 6,
      width: expect.closeTo(3.75, 4),
    },
  ]);
  expect(original.appearance.sections).toBeUndefined();
  const moved = editWallSection(placed, 'window', { position: 8 });
  expect(moved.appearance.sections![0].position).toBe(8);
  expect(placed.appearance.sections![0].position).toBe(6);
  const turned = rotateWall(moved, { angle: Math.PI / 2 });
  expect(turned.appearance.sections).toEqual(moved.appearance.sections);
  expect(removeWallSection(turned, 'window').appearance.sections).toEqual([]);
});
it('refuses duplicate/outside/unsupported placement and an opening through an existing section', () => {
  const w = addWallSection(makeWall(), {
    id: 'window',
    assetRef: ref,
    position: 6,
  });
  expect(() =>
    addWallSection(w, { id: 'window', assetRef: ref, position: 9 })
  ).toThrow(/duplicate/);
  expect(() => editWallSection(w, 'window', { position: 0 })).toThrow(
    /fit|within/
  );
  expect(() =>
    addWallSection(makeWall(), {
      id: 'x',
      assetRef: makeWall().appearance.assetRef,
      position: 6,
    })
  ).toThrow(/configured/);
  expect(() => addWallOpening(w, { id: 'gap', position: 6, width: 1 })).toThrow(
    /overlap/
  );
});
it('refuses a door surround intersecting a section even when its clear aperture does not', () => {
  const w = addWallSection(makeWall(), {
    id: 'window',
    assetRef: ref,
    position: 6,
  });
  expect(() =>
    createStudioDoor(w, {
      openingId: 'gap',
      doorId: 'door',
      assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01',
      position: 3,
    })
  ).toThrow(/overlap/);
});
it('checks inherited minimum height before placement and before an owning wall height edit', () => {
  const short = makeWall();
  short.appearance.height = 1;
  expect(() =>
    addWallSection(short, { id: 'window', assetRef: ref, position: 6 })
  ).toThrow(/fixed region/);
  const old = addWallSection(makeWall(), {
    id: 'window',
    assetRef: ref,
    position: 6,
  });
  const next = structuredClone(old);
  next.appearance.height = 1;
  expect(() =>
    assertWallHeightEdit({ walls: [next], previousWalls: [old] })
  ).toThrow(/fixed region/);
  expect(() =>
    assertWallHeightEdit({ walls: [next], previousWalls: [next] })
  ).not.toThrow();
});
it('round-trips an owned section through the native file without adding walls/items/openings', () => {
  const draft = createRoomDraft(
    createEmptyScene('section-scene'),
    'section-room'
  );
  draft.room.walls = [
    addWallSection(makeWall(), { id: 'window', assetRef: ref, position: 6 }),
  ];
  const source = encodeSingleRoomDungeon({ key: 'wall-section-test', draft });
  const reopened = decodeSingleRoomDungeon(source);
  expect(reopened.draft.room.walls).toEqual(draft.room.walls);
  expect(reopened.draft.scene.items).toEqual(draft.scene.items);
});
