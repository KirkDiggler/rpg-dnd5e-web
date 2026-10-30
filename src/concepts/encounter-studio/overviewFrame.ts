import { contentWorkspace } from '../world-building/contentGrid';
import {
  floorCells,
  type RoomDraft,
  type RoomHexCell,
} from '../world-building/roomDraft';
import {
  workspaceBounds,
  type WorkspaceBounds,
} from '../world-building/workspaceGeometry';
import {
  layoutCellCorners,
  MAX_LAYOUT_ZOOM,
  MIN_LAYOUT_ZOOM,
  type LayoutBounds,
} from './layoutGeometry';
import type { LayoutFrame, WorldPoint } from './studioSession';

function boundsOf(points: Iterable<WorldPoint>): WorkspaceBounds | null {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (const p of points) {
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.minZ = Math.min(bounds.minZ, p.z);
    bounds.maxZ = Math.max(bounds.maxZ, p.z);
  }
  return Number.isFinite(bounds.minX) ? bounds : null;
}

/** The world bounds of whole hex cells. Null for none. */
export function cellsBounds(
  cells: readonly RoomHexCell[]
): WorkspaceBounds | null {
  return boundsOf(cells.flatMap(layoutCellCorners));
}

/** What "Show entire" frames: the floor (every region's cells), walls and
 * placed nouns, or the empty grid when there is no content. */
export function contentBounds(draft: Readonly<RoomDraft>): WorkspaceBounds {
  const points: WorldPoint[] = floorCells(draft).flatMap(layoutCellCorners);
  for (const wall of draft.room.walls ?? [])
    points.push(wall.line.start, wall.line.end);
  for (const monster of draft.room.monsterDeclarations)
    points.push(...layoutCellCorners(monster.startingCell.location));
  for (const item of draft.scene.items) points.push(item.transform);
  if (draft.room.partyStart)
    points.push(...layoutCellCorners(draft.room.partyStart));
  return boundsOf(points) ?? workspaceBounds(contentWorkspace(draft));
}

/** Surface pixels covered by an overlay on each side, such as the open
 * inspector: a frame fits the uncovered part. */
export interface FrameInset {
  left: number;
  right: number;
}

/** The frame that fits `target` in a surface of `viewport`'s size, using
 * the same fit-relative zoom the Layout transform uses: zoom 1 is the
 * workspace extent fitted. A margin keeps the edges off the frame; an inset
 * fits and centres the target in the part no overlay covers. */
export function frameOf(
  target: WorkspaceBounds,
  viewport: Pick<LayoutBounds, 'width' | 'height'>,
  extent: number | WorkspaceBounds,
  margin = 0.9,
  inset: FrameInset = { left: 0, right: 0 }
): LayoutFrame | null {
  const halfWidth =
    typeof extent === 'number'
      ? extent
      : Math.max(Math.abs(extent.minX), Math.abs(extent.maxX));
  const halfHeight =
    typeof extent === 'number'
      ? extent
      : Math.max(Math.abs(extent.minZ), Math.abs(extent.maxZ));
  const width = Math.max(target.maxX - target.minX, 1);
  const height = Math.max(target.maxZ - target.minZ, 1);
  if (
    !(viewport.width > 0) ||
    !(viewport.height > 0) ||
    !(halfWidth > 0) ||
    !(halfHeight > 0)
  )
    return null;
  const fit = Math.min(
    viewport.width / (2 * halfWidth),
    viewport.height / (2 * halfHeight)
  );
  const left = Math.max(0, inset.left);
  const right = Math.max(0, inset.right);
  // An overlay that leaves too little uncovered is ignored.
  const covered = viewport.width - left - right < viewport.width * 0.3;
  const visible = covered ? viewport.width : viewport.width - left - right;
  const shift = covered ? 0 : (right - left) / 2;
  const wanted = Math.min(visible / width, viewport.height / height) * margin;
  const zoom = Math.min(
    MAX_LAYOUT_ZOOM,
    Math.max(MIN_LAYOUT_ZOOM, wanted / fit)
  );
  // The frame centre sits at the surface centre: move it so the target's
  // centre lands at the centre of the uncovered part.
  const center = {
    x: (target.minX + target.maxX) / 2 + shift / (fit * zoom),
    z: (target.minZ + target.maxZ) / 2,
  };
  return Number.isFinite(zoom) && Number.isFinite(center.x + center.z)
    ? { center, zoom }
    : null;
}
