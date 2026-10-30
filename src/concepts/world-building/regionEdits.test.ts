import { describe, expect, it } from 'vitest';
import { createPopulatedStudioDocument } from '../encounter-studio/fixtures/studioDocument';
import {
  createRegion,
  removeRegion,
  renameRegion,
  setRegionLighting,
} from './regionEdits';
import {
  cellOwners,
  floorCells,
  paintCells,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';

/**
 * REGION EDITS (rpg-project#725 R5). The label-linked region transactions —
 * room labels, enclosure binding, explicit areas, overlap and polygon
 * certification — retired with `scene.authoringRegions`: a region is now what
 * it lists, and cells move between regions by painting. What those tests
 * guarded and still holds is pinned here: an edit touches only its region,
 * an equal edit returns the same draft (no history entry), an invalid edit
 * refuses without mutation, and identities never collide.
 */
function room(): RoomDraft {
  let draft = createPopulatedStudioDocument().draft;
  draft = paintCells(draft, [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 2, r: 0 },
  ]);
  draft = createRegion(draft, 'hall', 'Hall');
  return paintCells(draft, [{ q: 2, r: 0 }], 'hall');
}

describe('creating, naming and lighting a region', () => {
  it('creates a bright, unpainted region at the end, leaving everything else as it was', () => {
    const before = room();
    const next = createRegion(before, 'cellar', '  Cellar  ');
    expect(next.room.regions.at(-1)).toEqual({
      id: 'cellar',
      name: 'Cellar',
      lighting: { intensity: 1 },
      cells: [],
    });
    expect({
      ...next,
      room: { ...next.room, regions: next.room.regions.slice(0, -1) },
    }).toEqual(before);
    expect(() => stringifyRoomDraft(next)).not.toThrow();
  });

  it('refuses a duplicate id, a blank id and a blank name without mutation', () => {
    const before = room();
    const copy = structuredClone(before);
    expect(() => createRegion(before, 'hall', 'Again')).toThrow(
      'Region id is already used: hall.'
    );
    expect(() => createRegion(before, '', 'Nameless')).toThrow(
      'A region needs a stable id.'
    );
    expect(() => createRegion(before, 'cellar', '   ')).toThrow(
      'A region needs a name.'
    );
    expect(before).toEqual(copy);
  });

  it('renames: the name is the label on the map; an equal name is no edit', () => {
    const before = room();
    const renamed = renameRegion(before, 'hall', 'Great hall');
    expect(renamed.room.regions.find((r) => r.id === 'hall')!.name).toBe(
      'Great hall'
    );
    expect(renameRegion(renamed, 'hall', ' Great hall ')).toBe(renamed);
    expect(() => renameRegion(before, 'gone', 'X')).toThrow(
      'Region target no longer exists.'
    );
  });

  it('sets lighting in [0, 1]; equal lighting is no edit; out of range refuses without mutation', () => {
    const before = room();
    const dim = setRegionLighting(before, 'hall', 0.3);
    expect(dim.room.regions.find((r) => r.id === 'hall')!.lighting).toEqual({
      intensity: 0.3,
    });
    expect(setRegionLighting(dim, 'hall', 0.3)).toBe(dim);
    for (const bad of [-0.1, 1.5, Number.NaN])
      expect(() => setRegionLighting(before, 'hall', bad)).toThrow(
        'Lighting intensity must be between 0 and 1.'
      );
    expect(() => setRegionLighting(before, 'gone', 0.5)).toThrow(
      'Region target no longer exists.'
    );
  });
});

describe('removing a region', () => {
  it('its cells fall to the implicit region; the floor is unchanged; its look goes with it', () => {
    const before = room();
    before.scene.version = 3;
    before.scene.regionPresentation = { hall: { construction: [1] } };
    const floor = floorCells(before);
    const removed = removeRegion(before, 'hall');
    expect(removed.room.regions.some((r) => r.id === 'hall')).toBe(false);
    expect(floorCells(removed)).toEqual(floor);
    expect(cellOwners(removed).get('2,0')).toBe(removed.room.implicitRegionId);
    expect(removed.scene).not.toHaveProperty('regionPresentation');
    expect(() => stringifyRoomDraft(removed)).not.toThrow();
  });

  it('refuses the implicit region, where unassigned paint lands', () => {
    const before = room();
    expect(() => removeRegion(before, before.room.implicitRegionId)).toThrow(
      'The implicit region cannot be removed.'
    );
    expect(() => removeRegion(before, 'gone')).toThrow(
      'Region target no longer exists.'
    );
  });
});
