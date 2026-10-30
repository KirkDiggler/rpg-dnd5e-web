import { HEX_SIZE, worldToCube } from '@/components/hex-grid/hexMath';
import { floorCells, type RoomDraft } from './roomDraft';
import type { WorldPoint } from './types';
import {
  anchoredRoomWorkspace,
  type RoomHexCell,
  type RoomWorkspace,
  type WorkspaceRectangle,
} from './workspaceGeometry';

/**
 * THE GRID THE STUDIO DRAWS IS DERIVED, NEVER STORED (rpg-project#725 R3).
 *
 * The canvas is unbounded: the file carries content and its coordinate frame
 * and no workspace dimensions. What the author sees as the grid is the content
 * bounding box plus a margin, recomputed from the draft, so painting near an
 * edge grows the grid and shipping a site needs no trim because nothing empty
 * is stored. An empty room shows a fixed square around the origin.
 */
export const LAYOUT_GRID_MARGIN = 6;
export const EMPTY_GRID_HEXES = 24;

const cellOf = (point: WorldPoint): RoomHexCell => {
  const cube = worldToCube({ x: point.x, z: point.z }, HEX_SIZE);
  return { q: cube.x || 0, r: cube.z || 0 };
};

/** Every cell the room's content touches: the floor, the party start, each
 * creature's start, and the cells under props, groups, notes and wall ends. */
export function contentCells(draft: Pick<RoomDraft, 'room' | 'scene'>) {
  const cells: RoomHexCell[] = [...floorCells(draft)];
  if (draft.room.partyStart) cells.push(draft.room.partyStart);
  for (const monster of draft.room.monsterDeclarations)
    cells.push(monster.startingCell.location);
  for (const item of draft.scene.items) cells.push(cellOf(item.transform));
  for (const group of draft.scene.groups) cells.push(cellOf(group.transform));
  for (const label of draft.scene.mapLabels ?? [])
    cells.push(cellOf(label.location));
  for (const wall of draft.room.walls ?? [])
    cells.push(cellOf(wall.line.start), cellOf(wall.line.end));
  return cells;
}

/** The odd-r rectangle the content occupies, or null for an empty room. */
export function contentRectangle(
  draft: Pick<RoomDraft, 'room' | 'scene'>
): WorkspaceRectangle | null {
  const cells = contentCells(draft);
  if (cells.length === 0) return null;
  let minCol = Infinity,
    maxCol = -Infinity,
    minRow = Infinity,
    maxRow = -Infinity;
  for (const { q, r } of cells) {
    const col = q + Math.floor(r / 2);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, r);
    maxRow = Math.max(maxRow, r);
  }
  return {
    minCol,
    minRow,
    widthHexes: maxCol - minCol + 1,
    heightHexes: maxRow - minRow + 1,
  };
}

/** The grid to draw: content bounds grown by `margin` on every side, or the
 * empty square around the origin. A presentation value; never written. */
export function contentWorkspace(
  draft: Pick<RoomDraft, 'room' | 'scene'>,
  margin = LAYOUT_GRID_MARGIN
): RoomWorkspace {
  const rect = contentRectangle(draft);
  if (!rect) {
    const half = EMPTY_GRID_HEXES / 2;
    return anchoredRoomWorkspace({
      minCol: -half,
      minRow: -half,
      widthHexes: EMPTY_GRID_HEXES,
      heightHexes: EMPTY_GRID_HEXES,
    });
  }
  return anchoredRoomWorkspace({
    minCol: rect.minCol - margin,
    minRow: rect.minRow - margin,
    widthHexes: rect.widthHexes + 2 * margin,
    heightHexes: rect.heightHexes + 2 * margin,
  });
}
