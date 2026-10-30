import {
  implicitRegionOf,
  paintCells,
  regionCells,
  type RoomDraft,
  type RoomRegion,
} from './roomDraft';

/**
 * REGION EDITS (rpg-project#725 R5). A region is an id, a name — its label on
 * the map — a lighting intensity and the cells it owns. Cells move between
 * regions by painting (`paintCells`); these edits create, name, light and
 * remove the regions themselves. Each returns the same draft when nothing
 * changes, so a no-op makes no history entry.
 */

function regionIndex(draft: RoomDraft, id: string): number {
  const index = draft.room.regions.findIndex((region) => region.id === id);
  if (index < 0) throw new Error('Region target no longer exists.');
  return index;
}

function withRegion(
  draft: RoomDraft,
  index: number,
  region: RoomRegion
): RoomDraft {
  return {
    ...draft,
    room: {
      ...draft.room,
      regions: draft.room.regions.map((row, i) => (i === index ? region : row)),
    },
  };
}

function nameOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A region needs a name.');
  return trimmed;
}

/** A new, bright, unpainted region at the end of the list. */
export function createRegion(
  draft: RoomDraft,
  id: string,
  name: string
): RoomDraft {
  if (!id) throw new Error('A region needs a stable id.');
  if (draft.room.regions.some((region) => region.id === id))
    throw new Error(`Region id is already used: ${id}.`);
  return {
    ...draft,
    room: {
      ...draft.room,
      regions: [
        ...draft.room.regions,
        { id, name: nameOf(name), lighting: { intensity: 1 }, cells: [] },
      ],
    },
  };
}

/** The name is the label on the map, so renaming renames the label. */
export function renameRegion(
  draft: RoomDraft,
  id: string,
  name: string
): RoomDraft {
  const index = regionIndex(draft, id);
  const region = draft.room.regions[index];
  const next = nameOf(name);
  if (region.name === next) return draft;
  return withRegion(draft, index, { ...region, name: next });
}

/** Lighting intensity in [0, 1], the encounter's word. */
export function setRegionLighting(
  draft: RoomDraft,
  id: string,
  intensity: number
): RoomDraft {
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1)
    throw new Error('Lighting intensity must be between 0 and 1.');
  const index = regionIndex(draft, id);
  const region = draft.room.regions[index];
  if (region.lighting.intensity === intensity) return draft;
  return withRegion(draft, index, { ...region, lighting: { intensity } });
}

/** Remove a region. Its cells stay floor and fall to the implicit region;
 * its look (`scene.regionPresentation`) goes with it. The implicit region is
 * where unassigned paint lands, so it cannot be removed. */
export function removeRegion(draft: RoomDraft, id: string): RoomDraft {
  if (id === draft.room.implicitRegionId)
    throw new Error('The implicit region cannot be removed.');
  const index = regionIndex(draft, id);
  const cells = regionCells(draft.room.regions[index]);
  // Hand the cells to the implicit region first (listing it if needed), then
  // drop the emptied region.
  const handed = cells.length ? paintCells(draft, cells) : draft;
  const regions = handed.room.regions.filter((region) => region.id !== id);
  const regionPresentation = { ...handed.scene.regionPresentation };
  delete regionPresentation[id];
  const scene: typeof handed.scene = { ...handed.scene, regionPresentation };
  if (Object.keys(regionPresentation).length === 0)
    delete scene.regionPresentation;
  const next = { ...handed, scene, room: { ...handed.room, regions } };
  // The list must not go empty: the implicit region is listed again.
  if (regions.length === 0)
    next.room.regions = [
      implicitRegionOf(draft.room.implicitRegionId, draft.name),
    ];
  return next;
}
