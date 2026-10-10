import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import {
  workspaceCellAtPoint,
  workspaceCells,
  type RoomWorkspace,
  type WorkspaceBounds,
} from '../world-building/workspaceGeometry';
import { createWorkspaceRectangleSelection } from '../world-building/workspaceRectangleSelection';
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
  extent: number | WorkspaceBounds
): LayoutTransform | null {
  // Keep the original world origin; fit both axes independently, not R/L.
  const halfWidth =
    typeof extent === 'number'
      ? extent
      : Math.max(Math.abs(extent.minX), Math.abs(extent.maxX));
  const halfHeight =
    typeof extent === 'number'
      ? extent
      : Math.max(Math.abs(extent.minZ), Math.abs(extent.maxZ));
  if (
    ![
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      frame.center.x,
      frame.center.z,
      frame.zoom,
      halfWidth,
      halfHeight,
    ].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    halfWidth <= 0 ||
    halfHeight <= 0 ||
    frame.zoom <= 0
  )
    return null;
  const scale =
    Math.min(bounds.width / (2 * halfWidth), bounds.height / (2 * halfHeight)) *
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
  workspace: RoomWorkspace | number
): RoomHexCell | null {
  const world = clientToWorld(point, transform);
  if (!world) return null;
  return workspaceCellAtPoint(
    typeof workspace === 'number'
      ? { hexRadius: workspace, horizontalLimit: 12 }
      : workspace,
    world
  );
}

/** Keep inclusive center membership through floating-point screen roundtrips.
 * Only machine-precision endpoint error is absorbed; no cell snapping or axial
 * rectangle semantics are introduced. The canonical helper still selects cells. */
export function layoutRectangleCells(
  start: WorldPoint,
  end: WorldPoint,
  workspace: RoomWorkspace | number
): RoomHexCell[] {
  return createWorkspaceRectangleSelection(workspace)(start, end);
}

export function layoutWorkspaceCells(
  workspace: RoomWorkspace | number
): RoomHexCell[] {
  return workspaceCells(workspace);
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
