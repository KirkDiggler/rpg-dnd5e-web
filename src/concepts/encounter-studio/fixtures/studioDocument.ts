import { decodeWorldBuilderV4Site } from '../../world-building/fixtures/worldBuilderV4Site';
import {
  parseRoomDocumentJson,
  stringifyRoomDraft,
  type RoomDraftDocument,
} from '../../world-building/roomDraft';
import { scopeFrom } from '../../world-building/siteScope';

/** Supported, normalized full-document preservation fixture. The provider's
 * pinned example is reused unchanged; Studio-specific examples are added here.
 * Each call returns independent document values and stable author identities. */
export function createPopulatedStudioDocument(): RoomDraftDocument {
  const decoded = decodeWorldBuilderV4Site();
  const draft = decoded.draft;
  const table = draft.scene.items.find((item) => item.id === 'table')!;
  table.pointLight = {
    enabled: true,
    offset: { x: 0, y: 0.5, z: 0 },
    color: '#ff9d52',
    intensity: 1.1,
    range: 2.6,
  };
  draft.scene.items.push({
    id: 'studio-decoration',
    kind: 'prop',
    assetRef: 'dnd5e:props:dark-fortress:alchemy_tools_01',
    label: 'Supported decoration',
    transform: { x: -2.25, y: 1, z: 1.3, rotationY: 0.37 },
    parentId: 'furniture',
    supportId: 'table',
  });
  draft.room.walls = [
    {
      id: 'studio-wall',
      label: 'Studio north wall',
      line: { start: { x: -4, z: -3 }, end: { x: 4, z: -3 } },
      openings: [
        { id: 'studio-arch', position: 2, width: 1 },
        {
          id: 'studio-opening',
          position: 6,
          width: 2,
          door: {
            id: 'studio-door',
            assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
          },
        },
      ],
      appearance: {
        assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
        height: 3,
        thickness: 0.3,
        elevation: 0,
      },
      blocker: {
        footprint: { width: 8, depth: 0.5, offsetX: 0, offsetZ: 0 },
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    },
  ];
  draft.room.doorBindings = {
    ...draft.room.doorBindings,
    'studio-door': { closed: true },
  };
  draft.room.propBindings = { table: { holds: ['studio-map'] } };
  const scope = {
    ...scopeFrom(decoded),
    tables: { 'studio-drill': { time: [{ hold: {} }] } },
    intel: [{ id: 'studio-map', reveals: { concealment: 'studio-secret' } }],
    exits: [{ id: 'studio-exit', cell: { q: 2, r: 0 } }],
    endings: [{ id: 'studio-ending', when: { fact: 'goblin-cowed' } }],
    scenarios: {
      'studio-scenario': { exit: 'studio-exit', guard: 'goblin-1' },
    },
    concealments: {
      'studio-secret': {
        cells: [{ q: 1, r: 0 }],
        props: ['studio-door'],
        checks: [{ ability: 'perception', dc: 15 }],
      },
    },
  };
  return parseRoomDocumentJson(stringifyRoomDraft(draft, scope));
}
