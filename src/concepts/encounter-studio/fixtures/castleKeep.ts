import { createRegion } from '../../world-building/regionEdits';
import {
  paintCells,
  placeRoomMonster,
  setRoomPartyStart,
  validateRoomDocument,
  type RoomDraftDocument,
  type RoomHexCell,
} from '../../world-building/roomDraft';
import type { StructuralWall } from '../../world-building/structuralWalls';
import type { WorldPoint } from '../../world-building/types';
import { layoutCellCenter } from '../layoutGeometry';
import { createCastleWorkspaceDocument } from './castleWorkspace';

const GUARD = 'dnd5e:monsters:guard';

/** One keep room as an odd-r rectangle: columns and rows, inclusive. */
interface KeepRoom {
  id: string;
  text: string;
  cols: [number, number];
  rows: [number, number];
}

/** The keep's rooms, in authored order. Neighbours share an edge, so the
 * overview's colour step is exercised on every side of the courtyard. */
export const KEEP_ROOMS: readonly KeepRoom[] = [
  { id: 'courtyard', text: 'Courtyard', cols: [-14, 14], rows: [-6, 10] },
  { id: 'gatehouse', text: 'Gatehouse', cols: [-4, 4], rows: [11, 16] },
  { id: 'great-hall', text: 'Great hall', cols: [-14, 14], rows: [-16, -7] },
  { id: 'kitchen', text: 'Kitchen', cols: [-26, -15], rows: [-16, -7] },
  { id: 'barracks', text: 'Barracks', cols: [-26, -15], rows: [-6, 10] },
  { id: 'chapel', text: 'Chapel', cols: [15, 26], rows: [-16, -7] },
  { id: 'armoury', text: 'Armoury', cols: [15, 26], rows: [-6, 10] },
  { id: 'throne-room', text: 'Throne room', cols: [-6, 6], rows: [-22, -17] },
];

export function keepRoomCells(room: KeepRoom): RoomHexCell[] {
  const cells: RoomHexCell[] = [];
  for (let r = room.rows[0]; r <= room.rows[1]; r++)
    for (let col = room.cols[0]; col <= room.cols[1]; col++)
      cells.push({ q: col - Math.floor(r / 2) || 0, r: r || 0 });
  return cells;
}

/** THE KEEP, AS LAYOUT'S OVERVIEW READS IT (rpg-project#577). The 73 × 48
 * castle rectangle (3,504 hexes, all floor) with eight named regions painted
 * over it (rpg-project#725: painting with a region reassigns its cells),
 * walls with doors between some of them, the castle cast placed in its rooms,
 * a few props and the party start in the gatehouse. Test and walk authority
 * only: a region here owns presentation, never mechanics. */
export function createCastleKeepDocument(): RoomDraftDocument {
  const base = createCastleWorkspaceDocument();
  let draft = base.draft;
  for (const room of KEEP_ROOMS) {
    const cells = keepRoomCells(room);
    draft = createRegion(draft, `region-${room.id}`, room.text);
    draft = paintCells(draft, cells, `region-${room.id}`);
  }
  const template = draft.room.walls![0];
  const wall = (
    id: string,
    start: WorldPoint,
    end: WorldPoint,
    door: number | null
  ): StructuralWall => {
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    return {
      ...structuredClone(template),
      id,
      label: id,
      line: { start, end },
      openings:
        door === null
          ? []
          : [
              {
                id: `${id}-opening`,
                position: door,
                width: 2,
                door: {
                  id: `${id}-door`,
                  assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
                },
              },
            ],
      blocker: {
        footprint: { width: length, depth: 0.5, offsetX: 0, offsetZ: 0 },
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    };
  };
  const walls = [
    wall('gate-wall', { x: -8, z: 15.75 }, { x: 8, z: 15.75 }, 8),
    wall('hall-wall', { x: -25, z: -9.75 }, { x: 25, z: -9.75 }, 25),
    wall('kitchen-wall', { x: -25.1, z: -24.75 }, { x: -25.1, z: -9.75 }, 7.5),
    wall('chapel-wall', { x: 25.1, z: -24.75 }, { x: 25.1, z: -9.75 }, 7.5),
    wall('throne-wall', { x: -11, z: -24.75 }, { x: 11, z: -24.75 }, 11),
  ];
  draft = {
    ...draft,
    room: {
      ...draft.room,
      walls: [...draft.room.walls!, ...walls],
      doorBindings: {
        ...draft.room.doorBindings,
        ...Object.fromEntries(
          walls
            .filter((w) => w.openings.length)
            .map((w) => [`${w.id}-door`, { closed: true }])
        ),
      },
    },
  };
  const at = (col: number, r: number): RoomHexCell => ({
    q: col - Math.floor(r / 2) || 0,
    r,
  });
  const soldier = 'dnd5e:npcs:kingdom:soldier-male-01';
  const soldierF = 'dnd5e:npcs:kingdom:soldier-female-01';
  const placements: Array<{
    id: string;
    ref: string;
    look: string;
    cell: RoomHexCell;
  }> = [
    { id: 'gate-1', ref: GUARD, look: soldier, cell: at(-2, 14) },
    { id: 'gate-2', ref: GUARD, look: soldierF, cell: at(2, 14) },
    {
      id: 'captain',
      ref: 'dnd5e:monsters:captain',
      look: 'dnd5e:npcs:kingdom:prince-01',
      cell: at(0, -12),
    },
    { id: 'reserve-1', ref: GUARD, look: soldier, cell: at(-20, 0) },
    { id: 'reserve-2', ref: GUARD, look: soldierF, cell: at(-18, 4) },
    {
      id: 'cook',
      ref: 'dnd5e:monsters:commoner',
      look: 'dnd5e:npcs:kingdom:peasant-male-01',
      cell: at(-20, -12),
    },
  ];
  for (const placement of placements)
    draft = placeRoomMonster(draft, {
      id: placement.id,
      ref: placement.ref,
      appearanceRef: placement.look,
      startingCell: { location: placement.cell },
    });
  draft = setRoomPartyStart(draft, at(0, 15));
  const props = [
    { id: 'altar', ref: 'dnd5e:props:dark-fortress:altar_01', label: 'Altar' },
    { id: 'ledger', ref: 'dnd5e:props:dark-fortress:book_03', label: 'Ledger' },
  ];
  const altar = layoutCellCenter(at(20, -12));
  const ledger = layoutCellCenter(at(-22, -10));
  draft = {
    ...draft,
    scene: {
      ...draft.scene,
      items: [
        ...draft.scene.items,
        {
          id: props[0].id,
          kind: 'prop',
          assetRef: props[0].ref,
          label: props[0].label,
          transform: { x: altar.x, y: 0, z: altar.z, rotationY: 0.5 },
        },
        {
          id: props[1].id,
          kind: 'prop',
          assetRef: props[1].ref,
          label: props[1].label,
          transform: { x: ledger.x, y: 0, z: ledger.z, rotationY: 0 },
        },
      ],
    },
    room: {
      ...draft.room,
      propDeclarations: {
        ...draft.room.propDeclarations,
        altar: {
          blocksMovement: true,
          blocksLineOfSight: false,
          footprint: { width: 2.4, depth: 1.2, offsetX: 0, offsetZ: 0 },
        },
      },
    },
  };
  return validateRoomDocument({
    draft,
    scope: {
      ...base.scope,
      templates: {
        ...base.scope.templates,
        guard: { base: 'dnd5e:monsters:human', name: 'Guard' },
        captain: { base: 'dnd5e:monsters:human', name: 'Captain' },
        commoner: { base: 'dnd5e:monsters:human', name: 'Commoner' },
      },
    },
  });
}
