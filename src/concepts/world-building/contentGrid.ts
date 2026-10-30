import { HEX_SIZE, worldToCube } from '@/components/hex-grid/hexMath';
import { floorCells, type RoomDraft } from './roomDraft';
import type { WorldPoint } from './types';
import {
  anchoredRoomWorkspace,
  MAX_GRID_HEXES,
  MAX_GRID_SIDE,
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

/** Content wider than this many columns or rows is drawn as a window that
 * re-centres in steps of this size as the view moves, so panning does not
 * rebuild the grid on every frame. */
export const GRID_WINDOW_STEP = 32;

/** One axis of the drawn window: the whole span when it fits the cap, else a
 * `size`-long window around `centre`, kept inside the span. */
function windowOn(
  min: number,
  span: number,
  size: number,
  centre: number
): number {
  if (span <= size) return min;
  const stepped = Math.round(centre / GRID_WINDOW_STEP) * GRID_WINDOW_STEP;
  const start = Math.round(stepped - size / 2);
  return Math.min(Math.max(start, min), min + span - size);
}

/**
 * The grid to draw: content bounds grown by `margin` on every side, or the
 * empty square around the origin. A presentation value; never written.
 *
 * IT NEVER THROWS ON CONTENT THE DRAFT ACCEPTS (rpg-project#725 R3). The
 * canvas is unbounded and a room may hold content far apart, but the drawn
 * grid has a cap (`MAX_GRID_SIDE`, `MAX_GRID_HEXES`). Content larger than the
 * cap is drawn as a capped window around `around` — the view centre, when the
 * caller has one, else the content's centre. Picking and painting are not
 * bounded by the window; only drawing is.
 */
export function contentWorkspace(
  draft: Pick<RoomDraft, 'room' | 'scene'>,
  margin = LAYOUT_GRID_MARGIN,
  around?: WorldPoint
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
  const minCol = rect.minCol - margin;
  const minRow = rect.minRow - margin;
  const width = rect.widthHexes + 2 * margin;
  const height = rect.heightHexes + 2 * margin;
  let drawnHeight = Math.min(height, MAX_GRID_SIDE);
  let drawnWidth = Math.min(width, MAX_GRID_SIDE);
  if (drawnWidth * drawnHeight > MAX_GRID_HEXES) {
    // Keep the window square-ish: shrink the longer side first.
    const side = Math.floor(Math.sqrt(MAX_GRID_HEXES));
    if (drawnWidth >= drawnHeight)
      drawnWidth = Math.max(side, Math.floor(MAX_GRID_HEXES / drawnHeight));
    else drawnHeight = Math.max(side, Math.floor(MAX_GRID_HEXES / drawnWidth));
    if (drawnWidth * drawnHeight > MAX_GRID_HEXES) {
      drawnWidth = Math.min(drawnWidth, side);
      drawnHeight = Math.min(drawnHeight, side);
    }
  }
  const centre = around ? cellOf(around) : null;
  const centreCol = centre
    ? centre.q + Math.floor(centre.r / 2)
    : minCol + width / 2;
  const centreRow = centre ? centre.r : minRow + height / 2;
  return anchoredRoomWorkspace({
    minCol: windowOn(minCol, width, drawnWidth, centreCol),
    minRow: windowOn(minRow, height, drawnHeight, centreRow),
    widthHexes: drawnWidth,
    heightHexes: drawnHeight,
  });
}
