import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
  worldToCube,
} from '@/components/hex-grid/hexMath';
import {
  isCellWithinWorkspace,
  walkableCellsInWorldRectangle,
} from '../world-building/roomDraft';
import type { LayoutFrame, RoomHexCell, WorldPoint } from './studioSession';

export interface LayoutBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface ClientPoint {
  x: number;
  y: number;
}
export interface LayoutTransform {
  bounds: LayoutBounds;
  center: WorldPoint;
  scale: number;
}

// Presentation-only relative-fit limits, never document/gameplay values.
export const MIN_LAYOUT_ZOOM = 0.25;
export const MAX_LAYOUT_ZOOM = 4;

export function createLayoutTransform(
  bounds: LayoutBounds,
  frame: LayoutFrame,
  horizontalLimit: number
): LayoutTransform | null {
  if (
    ![
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      frame.center.x,
      frame.center.z,
      frame.zoom,
      horizontalLimit,
    ].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    horizontalLimit <= 0 ||
    frame.zoom <= 0
  )
    return null;
  const scale =
    (Math.min(bounds.width, bounds.height) / (2 * horizontalLimit)) *
    frame.zoom;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return { bounds, center: frame.center, scale };
}

export function clientToWorld(
  point: ClientPoint,
  transform: LayoutTransform | null
): WorldPoint | null {
  if (!transform || ![point.x, point.y].every(Number.isFinite)) return null;
  const { bounds, center, scale } = transform;
  const world = {
    x: center.x + (point.x - bounds.left - bounds.width / 2) / scale,
    z: center.z + (point.y - bounds.top - bounds.height / 2) / scale,
  };
  return [world.x, world.z].every(Number.isFinite) ? world : null;
}

export function worldToClient(
  point: WorldPoint,
  transform: LayoutTransform | null
): ClientPoint | null {
  if (!transform || ![point.x, point.z].every(Number.isFinite)) return null;
  const { bounds, center, scale } = transform;
  const client = {
    x: bounds.left + bounds.width / 2 + (point.x - center.x) * scale,
    y: bounds.top + bounds.height / 2 + (point.z - center.z) * scale,
  };
  return [client.x, client.y].every(Number.isFinite) ? client : null;
}

export function layoutCellCenter(cell: RoomHexCell): WorldPoint {
  return cubeToWorld({ x: cell.q, y: -cell.q - cell.r, z: cell.r }, HEX_SIZE);
}

export function layoutCellCorners(cell: RoomHexCell): WorldPoint[] {
  return hexCorners(layoutCellCenter(cell), HEX_SIZE);
}

export function pickLayoutCell(
  point: ClientPoint,
  transform: LayoutTransform | null,
  hexRadius: number
): RoomHexCell | null {
  const world = clientToWorld(point, transform);
  if (!world) return null;
  const cube = worldToCube(world, HEX_SIZE);
  const cell = { q: cube.x === 0 ? 0 : cube.x, r: cube.z === 0 ? 0 : cube.z };
  return isCellWithinWorkspace(cell, hexRadius) ? cell : null;
}

/** Keep inclusive center membership through floating-point screen roundtrips.
 * Only machine-precision endpoint error is absorbed; no cell snapping or axial
 * rectangle semantics are introduced. The canonical helper still selects cells. */
export function layoutRectangleCells(
  start: WorldPoint,
  end: WorldPoint,
  hexRadius: number
): RoomHexCell[] {
  const epsilon =
    16 *
    Number.EPSILON *
    Math.max(
      1,
      Math.abs(start.x),
      Math.abs(start.z),
      Math.abs(end.x),
      Math.abs(end.z)
    );
  return walkableCellsInWorldRectangle(
    {
      x: Math.min(start.x, end.x) - epsilon,
      z: Math.min(start.z, end.z) - epsilon,
    },
    {
      x: Math.max(start.x, end.x) + epsilon,
      z: Math.max(start.z, end.z) + epsilon,
    },
    hexRadius
  );
}

export function layoutWorkspaceCells(hexRadius: number): RoomHexCell[] {
  const cells: RoomHexCell[] = [];
  for (let q = -hexRadius; q <= hexRadius; q++) {
    for (let r = -hexRadius; r <= hexRadius; r++) {
      const cell = { q, r };
      if (isCellWithinWorkspace(cell, hexRadius)) cells.push(cell);
    }
  }
  return cells;
}

export function panLayoutFrame(
  frame: LayoutFrame,
  anchor: WorldPoint,
  pointer: ClientPoint,
  transform: LayoutTransform | null
): LayoutFrame | null {
  const world = clientToWorld(pointer, transform);
  if (!world) return null;
  return {
    ...frame,
    center: {
      x: frame.center.x + anchor.x - world.x,
      z: frame.center.z + anchor.z - world.z,
    },
  };
}

export function zoomLayoutFrame(
  frame: LayoutFrame,
  pointer: ClientPoint,
  deltaY: number,
  transform: LayoutTransform | null
): LayoutFrame | null {
  const anchor = clientToWorld(pointer, transform);
  if (!anchor || !transform || !Number.isFinite(deltaY)) return null;
  const zoom = Math.min(
    MAX_LAYOUT_ZOOM,
    Math.max(MIN_LAYOUT_ZOOM, frame.zoom * Math.exp(-deltaY * 0.001))
  );
  const ratio = frame.zoom / zoom;
  return {
    zoom,
    center: {
      x: anchor.x - (anchor.x - frame.center.x) * ratio,
      z: anchor.z - (anchor.z - frame.center.z) * ratio,
    },
  };
}
