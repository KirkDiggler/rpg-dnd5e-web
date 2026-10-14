import type { RoomDraft, RoomHexCell } from '../world-building/roomDraft';
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

/** What "Show entire" frames: the walkable floor, walls and placed nouns, or
 * the workspace when there is no content. */
export function contentBounds(draft: Readonly<RoomDraft>): WorkspaceBounds {
  const points: WorldPoint[] =
    draft.room.walkableHexes.flatMap(layoutCellCorners);
  for (const wall of draft.room.walls ?? [])
    points.push(wall.line.start, wall.line.end);
  for (const monster of draft.room.monsterDeclarations)
    points.push(...layoutCellCorners(monster.startingCell.location));
  for (const item of draft.scene.items) points.push(item.transform);
  if (draft.room.partyStart)
    points.push(...layoutCellCorners(draft.room.partyStart));
  return boundsOf(points) ?? workspaceBounds(draft.workspace);
}

/** The frame that fits `target` in a surface of `viewport`'s size, using
 * the same fit-relative zoom the Layout transform uses: zoom 1 is the
 * workspace extent fitted. A margin keeps the edges off the frame. */
export function frameOf(
  target: WorkspaceBounds,
  viewport: Pick<LayoutBounds, 'width' | 'height'>,
  extent: number | WorkspaceBounds,
  margin = 0.9
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
  const wanted =
    Math.min(viewport.width / width, viewport.height / height) * margin;
  const zoom = Math.min(
    MAX_LAYOUT_ZOOM,
    Math.max(MIN_LAYOUT_ZOOM, wanted / fit)
  );
  const center = {
    x: (target.minX + target.maxX) / 2,
    z: (target.minZ + target.maxZ) / 2,
  };
  return Number.isFinite(zoom) && Number.isFinite(center.x + center.z)
    ? { center, zoom }
    : null;
}
