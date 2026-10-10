import { createMapLabel } from '../../world-building/mapLabelEdits';
import {
  createRoomLabel,
  setExplicitRegionArea,
  setRegionLighting,
} from '../../world-building/regionEdits';
import {
  resizeRoomWorkspace,
  setRoomPartyStart,
  validateRoomDocument,
  type RoomDraftDocument,
} from '../../world-building/roomDraft';
import type { StructuralWall } from '../../world-building/structuralWalls';
import type { WorldProp } from '../../world-building/types';
import { createPopulatedStudioDocument } from './studioDocument';

export const LIGHTING_LABELS = {
  left: 'lighting-left-label',
  right: 'lighting-right-label',
  forest: 'lighting-forest-label',
  meadow: 'lighting-meadow-label',
} as const;

/** Synthetic complete authoring fixture, not operator data or gameplay lighting.
 * The actual helpers certify automatic witnesses and normalize optional intent. */
export function createRegionLightingDocument(
  configured = false
): RoomDraftDocument {
  const document = resizeRoomWorkspace(createPopulatedStudioDocument(), 24, 24);
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
  for (const [name, location] of [
    ['left', { x: -2, z: 0 }],
    ['right', { x: 2, z: 0 }],
    ['forest', { x: -2, z: -7 }],
    ['meadow', { x: 2, z: -7 }],
  ] as const) {
    draft = createRoomLabel(
      draft,
      `lighting-${name}`,
      LIGHTING_LABELS[name],
      name,
      location
    );
  }
  draft = setExplicitRegionArea(draft, 'lighting-forest', [
    { q: 1, r: -5 },
    { q: 2, r: -5 },
    { q: -1, r: -5 },
  ]);
  draft = setExplicitRegionArea(draft, 'lighting-meadow', [
    { q: 3, r: -5 },
    { q: 4, r: -5 },
  ]);
  if (configured) {
    for (const name of ['left', 'right', 'forest', 'meadow'] as const)
      draft = setRegionLighting(draft, `lighting-${name}`, {
        background: name === 'left' || name === 'forest' ? 0.15 : 0.8,
      });
  }
  return validateRoomDocument({ draft, scope: document.scope });
}

/** Saved settings with no applied automatic extent, plus unbound/empty intent. */
export function createUnresolvedRegionLightingDocument(): RoomDraftDocument {
  const document = createRegionLightingDocument(true);
  document.draft.room.walls!.find(
    (w) => w.id === 'lighting-divider'
  )!.line.end.z = 2.75;
  let draft = createRoomLabel(
    document.draft,
    'lighting-unbound',
    'lighting-unbound-label',
    'Unbound',
    { x: 8, z: 0 }
  );
  draft = setRegionLighting(draft, 'lighting-unbound', { background: 0.3 });
  draft = createRoomLabel(
    draft,
    'lighting-empty',
    'lighting-empty-label',
    'Empty',
    { x: 8, z: 3 }
  );
  draft = setExplicitRegionArea(draft, 'lighting-empty', []);
  draft = setRegionLighting(draft, 'lighting-empty', { background: 1 });
  return validateRoomDocument({ draft, scope: document.scope });
}

/** Many small separated areas at maximum workspace bounds, within current caps. */
export function createSparseRegionLightingDocument(): RoomDraftDocument {
  const document = resizeRoomWorkspace(
    createPopulatedStudioDocument(),
    128,
    128
  );
  let draft = document.draft;
  for (let i = 0; i < 240; i++) {
    const q = (i % 16) * 4 - 30;
    const r = Math.floor(i / 16) * 4 - 28;
    const id = `lighting-sparse-${i}`;
    // The anchor is deliberately independent of membership.
    draft = createRoomLabel(draft, id, `${id}-label`, id, { x: 0, z: 0 });
    draft = setExplicitRegionArea(draft, id, [{ q, r }]);
    draft = setRegionLighting(draft, id, { background: 0.2 });
  }
  return validateRoomDocument({ draft, scope: document.scope });
}
