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
it('keeps the original raw Castle Wall Door01 ref as a configured static section, not a new door alias', () => {
  const original = 'dnd5e:env:fantasy-kingdom:castle_wall_door_01';
  expect(wallSectionOptions().map((row) => row.ref)).toContain(original);
  expect(repeatableWallAssetRefs()).not.toContain(original);
  const placed = addWallSection(makeWall(), {
    id: 'raw-frame',
    assetRef: original,
    position: 6,
  });
  expect(placed.appearance.sections![0]).toMatchObject({
    assetRef: original,
    width: expect.closeTo(3.75, 4),
  });
  expect(placed.openings).toEqual([]);
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
it.each(['castle_wall_doorway_single_02', 'castle_wall_doorway_double_01'])(
  'uses the configured height parts for existing doorway %s without changing its door identity',
  (suffix) => {
    for (const height of [3.75, 6]) {
      const before = makeWall();
      before.appearance.height = height;
      const after = createStudioDoor(before, {
        openingId: 'gap',
        doorId: 'door',
        assetRef: 'dnd5e:env:fantasy-kingdom:' + suffix,
        position: 6,
      });
      expect(() =>
        assertWallHeightEdit({ walls: [after], previousWalls: [before] })
      ).not.toThrow();
      expect(after.openings[0].door?.id).toBe('door');
      expect(after.appearance.sections).toBeUndefined();
    }
  }
);
it('keeps the large gateway minimum instead of scaling its fixed architecture into a short wall', () => {
  const ref = 'dnd5e:env:fantasy-kingdom:castle_gateway_doorway_large_01';
  const short = makeWall();
  const shortDoor = createStudioDoor(short, {
    openingId: 'gap',
    doorId: 'door',
    assetRef: ref,
    position: 6,
  });
  expect(() =>
    assertWallHeightEdit({ walls: [shortDoor], previousWalls: [short] })
  ).toThrow(/fixed region/);
  for (const height of [12, 15]) {
    const tall = makeWall();
    tall.appearance.height = height;
    const placed = createStudioDoor(tall, {
      openingId: 'gap',
      doorId: 'door',
      assetRef: ref,
      position: 6,
    });
    expect(() =>
      assertWallHeightEdit({ walls: [placed], previousWalls: [tall] })
    ).not.toThrow();
    expect(placed.openings[0].door?.id).toBe('door');
  }
});
it('retains the standard gateway fixed-height limit while its masonry is enrolled', () => {
  const ref = 'dnd5e:env:fantasy-kingdom:castle_gateway_doorway_01';
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(ref)!;
  if (entry.source !== 'generated') throw Error('Expected generated gateway.');
  const before = makeWall();
  before.appearance.height = entry.asset.boundsMeters[1];
  const placed = createStudioDoor(before, {
    openingId: 'gap',
    doorId: 'door',
    assetRef: ref,
    position: 6,
  });
  expect(() =>
    assertWallHeightEdit({ walls: [placed], previousWalls: [before] })
  ).not.toThrow();
  const taller = structuredClone(placed);
  taller.appearance.height += 1;
  expect(() =>
    assertWallHeightEdit({ walls: [taller], previousWalls: [placed] })
  ).toThrow(/fixed asset/);
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
