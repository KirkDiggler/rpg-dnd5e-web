import { createMapLabel } from '../../world-building/mapLabelEdits';
import {
  createRegion,
  setRegionLighting,
} from '../../world-building/regionEdits';
import {
  cellsInWorldRectangle,
  paintCells,
  setRoomPartyStart,
  validateRoomDocument,
  type RoomDraftDocument,
} from '../../world-building/roomDraft';
import type { StructuralWall } from '../../world-building/structuralWalls';
import type { WorldProp } from '../../world-building/types';
import { createPopulatedStudioDocument } from './studioDocument';

/** The four lit regions, by name. */
export const LIGHTING_REGIONS = {
  left: 'lighting-left',
  right: 'lighting-right',
  forest: 'lighting-forest',
  meadow: 'lighting-meadow',
} as const;

/** Synthetic complete authoring fixture, not operator data or gameplay lighting.
 * Four painted regions (rpg-project#725): left and right fill the two halves
 * the divider wall splits, forest and meadow are a few cells north. */
export function createRegionLightingDocument(
  configured = false
): RoomDraftDocument {
  const document = createPopulatedStudioDocument();
  // Keep all scope keys, with a provider-registered, explicitly filled scenario.
  document.scope.scenarios = {
    'recover-the-artifact': { artifact: 'table', exit: 'studio-exit' },
  };
  document.draft.room.propBindings!.table.holdable = true;
  const wall = (
    id: string,
    start: { x: number; z: number },
    end: { x: number; z: number }
  ): StructuralWall => ({
    ...structuredClone(document.draft.room.walls![0]),
    id,
    label: id,
    line: { start, end },
    openings: [],
    blocker: {
      footprint: {
        width: Math.hypot(end.x - start.x, end.z - start.z),
        depth: 0.5,
        offsetX: 0,
        offsetZ: 0,
      },
      blocksMovement: true,
      blocksLineOfSight: true,
    },
  });
  document.draft.room.walls!.push(
    wall('lighting-west', { x: -4, z: -3 }, { x: -4, z: 3 }),
    wall('lighting-east', { x: 4, z: -3 }, { x: 4, z: 3 }),
    wall('lighting-south', { x: -4, z: 3 }, { x: 4, z: 3 }),
    wall('lighting-divider', { x: 0, z: -3 }, { x: 0, z: 3 })
  );
  // Move the existing attached door to the divider; retain its ID/state/scope.
  const north = document.draft.room.walls![0];
  const opening = north.openings.find((o) => o.door)!;
  north.openings = [];
  document.draft.room.walls!.at(-1)!.openings = [{ ...opening, position: 3 }];
  const prop = (
    id: string,
    assetRef: string,
    x: number,
    z: number
  ): WorldProp => ({
    id,
    kind: 'prop' as const,
    assetRef,
    label: id,
    transform: { x, y: 0, z, rotationY: 0 },
  });
  document.draft.scene.items.push(
    prop(
      'lighting-left-bush',
      'dnd5e:env:fantasy-kingdom:bush_small_01',
      -2,
      -1
    ),
    prop(
      'lighting-right-bush',
      'dnd5e:env:fantasy-kingdom:bush_small_01',
      2,
      -1
    ),
    prop('lighting-cross', 'dnd5e:env:dark-fortress:45_wall_01', 0, 2),
    prop(
      'lighting-forest-bush',
      'dnd5e:env:fantasy-kingdom:bush_small_01',
      -2,
      -7
    ),
    prop(
      'lighting-meadow-bush',
      'dnd5e:env:fantasy-kingdom:bush_small_01',
      2,
      -7
    ),
    {
      ...prop('lighting-torch', 'dnd5e:props:dark-fortress:torch_06', -2, 1),
      pointLight: {
        enabled: true,
        offset: { x: 0, y: 1.1, z: 0 },
        color: '#ffb866',
        intensity: 3,
        range: 5,
      },
    }
  );
  // Keep the required gameplay start off the relocated attached doorway.
  document.draft = setRoomPartyStart(document.draft, { q: 1, r: 0 });
  let draft = createMapLabel(document.draft, 'lighting-note', 'Plain note', {
    x: 6,
    z: 0,
  });
  const areas = {
    left: cellsInWorldRectangle({ x: -3.6, z: -2.6 }, { x: -0.4, z: 2.6 }),
    right: cellsInWorldRectangle({ x: 0.4, z: -2.6 }, { x: 3.6, z: 2.6 }),
    forest: [
      { q: 1, r: -5 },
      { q: 2, r: -5 },
      { q: -1, r: -5 },
    ],
    meadow: [
      { q: 3, r: -5 },
      { q: 4, r: -5 },
    ],
  } as const;
  for (const name of ['left', 'right', 'forest', 'meadow'] as const) {
    draft = createRegion(draft, LIGHTING_REGIONS[name], name);
    draft = paintCells(draft, areas[name], LIGHTING_REGIONS[name]);
  }
  if (configured) {
    for (const name of ['left', 'right', 'forest', 'meadow'] as const)
      draft = setRegionLighting(
        draft,
        LIGHTING_REGIONS[name],
        name === 'left' || name === 'forest' ? 0.15 : 0.8
      );
  }
  return validateRoomDocument({ draft, scope: document.scope });
}

/** Saved settings on two declared, unpainted regions: their lighting is kept
 * and draws nothing until they own a cell. */
export function createUnresolvedRegionLightingDocument(): RoomDraftDocument {
  const document = createRegionLightingDocument(true);
  let draft = createRegion(document.draft, 'lighting-unbound', 'Unbound');
  draft = setRegionLighting(draft, 'lighting-unbound', 0.3);
  draft = createRegion(draft, 'lighting-empty', 'Empty');
  draft = setRegionLighting(draft, 'lighting-empty', 1);
  return validateRoomDocument({ draft, scope: document.scope });
}

/** Many small separated regions, within current caps. */
export function createSparseRegionLightingDocument(): RoomDraftDocument {
  const document = createPopulatedStudioDocument();
  let draft = document.draft;
  for (let i = 0; i < 240; i++) {
    const q = (i % 16) * 4 - 30;
    const r = Math.floor(i / 16) * 4 - 28;
    const id = `lighting-sparse-${i}`;
    draft = createRegion(draft, id, id);
    draft = paintCells(draft, [{ q, r }], id);
    draft = setRegionLighting(draft, id, 0.2);
  }
  return validateRoomDocument({ draft, scope: document.scope });
}
