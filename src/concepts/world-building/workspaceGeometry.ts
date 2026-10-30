import {
  cubeToWorld,
  HEX_DIRECTIONS,
  HEX_SIZE,
  hexCorners,
  hexEdgeBetween,
  worldToCube,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { objectShape, rejectUnknownKeys } from './strictShape';

export const ROOM_WORKSPACE_STEPS = [
  { hexRadius: 6, horizontalLimit: 12 },
  { hexRadius: 10, horizontalLimit: 20 },
  { hexRadius: 14, horizontalLimit: 28 },
] as const;
export const MAX_ROOM_WORKSPACE_HEXES = 16384;
export interface RoomHexCell {
  q: number;
  r: number;
}
export type RoomWorkspace =
  | { kind?: undefined; hexRadius: number; horizontalLimit: number }
  | {
      kind: 'centered-odd-r';
      widthHexes: number;
      heightHexes: number;
      hexRadius: number;
      horizontalLimit: number;
    }
  /** An explicit odd-r rectangle. Its edges are where the author put them,
   * so a resize moves only the edges the author chose and no cell moves. */
  | {
      kind: 'odd-r-rect';
      /** Odd-r column of the left edge: col = q + floor(r / 2). */
      minCol: number;
      /** Row of the top edge. Screen-up in Layout is decreasing r. */
      minRow: number;
      widthHexes: number;
      heightHexes: number;
      /** Max cube distance from the origin over its cells: derived. */
      hexRadius: number;
      horizontalLimit: number;
    };
/** The rectangle a workspace covers, in odd-r columns and rows. */
export interface WorkspaceRectangle {
  minCol: number;
  minRow: number;
  widthHexes: number;
  heightHexes: number;
}
/** Which edges a resize moves. Absent means right and top. */
export interface ResizeEdges {
  columns: 'right' | 'left';
  /** Top is the smallest r. */
  rows: 'top' | 'bottom';
}
export const DEFAULT_RESIZE_EDGES: ResizeEdges = {
  columns: 'right',
  rows: 'top',
};
export interface WorkspaceBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The largest grid the studio derives and draws (rpg-project#725 R3): the
 * paint cap's floor plus its margin. A drawing budget, never stored. */
export const MAX_GRID_SIDE = 1024;
export const MAX_GRID_HEXES = 1 << 17;
function dimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_GRID_SIDE ||
    height > MAX_GRID_SIDE ||
    width * height > MAX_GRID_HEXES
  )
    throw new Error(
      `Grid widthHexes/heightHexes must be integers in 1..${MAX_GRID_SIDE} (at most ${MAX_GRID_HEXES} cells).`
    );
}
function origin(value: number, field: string): void {
  if (!Number.isSafeInteger(value))
    throw new Error(`Room workspace ${field} must be an integer.`);
}
/** null for a legacy radius workspace: it is not a rectangle. */
export function rectangleOf(
  workspace: RoomWorkspace | number
): WorkspaceRectangle | null {
  if (typeof workspace === 'number' || workspace.kind === undefined)
    return null;
  if (workspace.kind === 'odd-r-rect')
    return {
      minCol: workspace.minCol,
      minRow: workspace.minRow,
      widthHexes: workspace.widthHexes,
      heightHexes: workspace.heightHexes,
    };
  return {
    minCol: -Math.floor(workspace.widthHexes / 2),
    minRow: -Math.floor(workspace.heightHexes / 2),
    widthHexes: workspace.widthHexes,
    heightHexes: workspace.heightHexes,
  };
}
function rectangleCells(rect: WorkspaceRectangle): RoomHexCell[] {
  dimensions(rect.widthHexes, rect.heightHexes);
  const cells: RoomHexCell[] = [];
  for (let r = rect.minRow; r < rect.minRow + rect.heightHexes; r++)
    for (let col = rect.minCol; col < rect.minCol + rect.widthHexes; col++)
      cells.push({ q: col - Math.floor(r / 2) || 0, r: r || 0 });
  return cells;
}
/** hexRadius and horizontalLimit, derived from the cells. */
function envelopes(rect: WorkspaceRectangle): {
  hexRadius: number;
  horizontalLimit: number;
} {
  let hexRadius = 1;
  let horizontalLimit = 12;
  for (const cell of rectangleCells(rect)) {
    hexRadius = Math.max(
      hexRadius,
      Math.abs(cell.q),
      Math.abs(cell.r),
      Math.abs(cell.q + cell.r)
    );
    for (const p of cellCorners(cell))
      horizontalLimit = Math.max(
        horizontalLimit,
        Math.ceil(Math.abs(p.x)),
        Math.ceil(Math.abs(p.z))
      );
  }
  return { hexRadius, horizontalLimit };
}
export function centeredRoomWorkspace(
  widthHexes: number,
  heightHexes: number
): RoomWorkspace {
  dimensions(widthHexes, heightHexes);
  const workspace: RoomWorkspace = {
    kind: 'centered-odd-r',
    widthHexes,
    heightHexes,
    hexRadius: 1,
    horizontalLimit: 12,
  };
  return { ...workspace, ...envelopes(rectangleOf(workspace)!) };
}
/** An explicit rectangle; envelopes derived exactly as the centred kind's. */
export function anchoredRoomWorkspace(rect: WorkspaceRectangle): RoomWorkspace {
  dimensions(rect.widthHexes, rect.heightHexes);
  origin(rect.minCol, 'minCol');
  origin(rect.minRow, 'minRow');
  return {
    kind: 'odd-r-rect',
    minCol: rect.minCol || 0,
    minRow: rect.minRow || 0,
    widthHexes: rect.widthHexes,
    heightHexes: rect.heightHexes,
    ...envelopes(rect),
  };
}
/** Resize by moving only the chosen edges. Columns 'right' keeps minCol;
 * 'left' moves it by the width change. Rows 'top' moves minRow by the height
 * change; 'bottom' keeps it. No cell's {q, r} changes on any side. A legacy
 * radius workspace has no edges to keep, so it is replaced by the centred
 * rectangle, as resizing always did. */
export function growRoomWorkspace(
  current: RoomWorkspace,
  widthHexes: number,
  heightHexes: number,
  edges: ResizeEdges = DEFAULT_RESIZE_EDGES
): RoomWorkspace {
  const rect = rectangleOf(current);
  if (!rect) return centeredRoomWorkspace(widthHexes, heightHexes);
  dimensions(widthHexes, heightHexes);
  const dw = widthHexes - rect.widthHexes;
  const dh = heightHexes - rect.heightHexes;
  // Same size: nothing moves, so the saved kind (and bytes) stay as they are.
  if (dw === 0 && dh === 0) return current;
  return anchoredRoomWorkspace({
    minCol: edges.columns === 'left' ? rect.minCol - dw : rect.minCol,
    minRow: edges.rows === 'top' ? rect.minRow - dh : rect.minRow,
    widthHexes,
    heightHexes,
  });
}
/** The largest radius whose hexagon fits the rectangle kinds' cell budget:
 * a radius-R hexagon holds 3R(R+1)+1 cells. */
export const MAX_ROOM_WORKSPACE_RADIUS = (() => {
  let radius = 1;
  while (3 * (radius + 1) * (radius + 2) + 1 <= MAX_ROOM_WORKSPACE_HEXES)
    radius += 1;
  return radius;
})();

/**
 * A RADIUS WORKSPACE OFF THE PRESETS (rpg-dnd5e-web#1311). The engine reads
 * `workspace.hexRadius` as the floor bound and nothing else from the block
 * (`single_room_lowering.go`; `horizontalLimit` is the editor's drawing
 * bound, which the engine is deliberately indifferent to). So a file that
 * writes `{hexRadius: 9, horizontalLimit: 20}`, or `{hexRadius: 6}` alone, is
 * one the engine plays, and the studio reads it as written: a whole radius
 * within the cell budget the rectangle kinds keep, and a drawing bound that
 * is a positive number, absent meaning twice the radius — the ratio every
 * preset has. What it still refuses, it refuses naming the authored value.
 */
function radiusRoomWorkspace(
  hexRadius: unknown,
  horizontalLimit: unknown
): RoomWorkspace {
  if (
    typeof hexRadius !== 'number' ||
    !Number.isInteger(hexRadius) ||
    hexRadius < 1 ||
    hexRadius > MAX_ROOM_WORKSPACE_RADIUS
  )
    throw new Error(
      `Unsupported room workspace extent: hexRadius must be a whole number from 1 to ${MAX_ROOM_WORKSPACE_RADIUS}, and this file says ${JSON.stringify(hexRadius)}.`
    );
  if (horizontalLimit === undefined)
    return { hexRadius, horizontalLimit: 2 * hexRadius };
  if (
    typeof horizontalLimit !== 'number' ||
    !Number.isFinite(horizontalLimit) ||
    horizontalLimit <= 0
  )
    throw new Error(
      `Unsupported room workspace extent: horizontalLimit must be a positive number, and this file says ${JSON.stringify(horizontalLimit)}.`
    );
  return { hexRadius, horizontalLimit };
}

export function validateWorkspace(value: unknown): RoomWorkspace {
  const source = objectShape(value, 'Room workspace');
  if (source.kind === undefined) {
    if (
      Object.hasOwn(source, 'widthHexes') ||
      Object.hasOwn(source, 'heightHexes')
    )
      throw new Error('Room workspace dimensions require kind centered-odd-r.');
    const preset = ROOM_WORKSPACE_STEPS.find(
      (p) =>
        p.hexRadius === source.hexRadius &&
        p.horizontalLimit === source.horizontalLimit
    );
    // Preserve the existing untagged preset normalization contract.
    if (preset) return { ...preset };
    return radiusRoomWorkspace(source.hexRadius, source.horizontalLimit);
  }
  if (source.kind === 'odd-r-rect') {
    rejectUnknownKeys(
      source,
      [
        'kind',
        'minCol',
        'minRow',
        'widthHexes',
        'heightHexes',
        'hexRadius',
        'horizontalLimit',
      ],
      'Room workspace'
    );
    const expected = anchoredRoomWorkspace({
      minCol: source.minCol as number,
      minRow: source.minRow as number,
      widthHexes: source.widthHexes as number,
      heightHexes: source.heightHexes as number,
    });
    if (
      source.hexRadius !== expected.hexRadius ||
      source.horizontalLimit !== expected.horizontalLimit
    )
      throw new Error(
        'Room workspace hexRadius/horizontalLimit must match its derived envelopes.'
      );
    return expected;
  }
  rejectUnknownKeys(
    source,
    ['kind', 'widthHexes', 'heightHexes', 'hexRadius', 'horizontalLimit'],
    'Room workspace'
  );
  if (source.kind !== 'centered-odd-r')
    throw new Error('Unsupported room workspace kind.');
  const expected = centeredRoomWorkspace(
    source.widthHexes as number,
    source.heightHexes as number
  );
  if (
    source.hexRadius !== expected.hexRadius ||
    source.horizontalLimit !== expected.horizontalLimit
  )
    throw new Error(
      'Room workspace hexRadius/horizontalLimit must match its derived envelopes.'
    );
  return expected;
}
export function containsWorkspaceCell(
  workspace: RoomWorkspace | number,
  cell: RoomHexCell
): boolean {
  if (!Number.isInteger(cell.q) || !Number.isInteger(cell.r)) return false;
  if (typeof workspace === 'number' || workspace.kind === undefined) {
    const radius =
      typeof workspace === 'number' ? workspace : workspace.hexRadius;
    return (
      Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(cell.q + cell.r)) <=
      radius
    );
  }
  const rect = rectangleOf(workspace)!;
  dimensions(rect.widthHexes, rect.heightHexes);
  const col = cell.q + Math.floor(cell.r / 2);
  return (
    col >= rect.minCol &&
    col < rect.minCol + rect.widthHexes &&
    cell.r >= rect.minRow &&
    cell.r < rect.minRow + rect.heightHexes
  );
}
export function workspaceCells(
  workspace: RoomWorkspace | number
): RoomHexCell[] {
  const cells: RoomHexCell[] = [];
  const rect = rectangleOf(workspace);
  if (rect) {
    cells.push(...rectangleCells(rect));
  } else {
    const radius =
      typeof workspace === 'number' ? workspace : workspace.hexRadius;
    if (
      !Number.isInteger(radius) ||
      radius < 0 ||
      1 + 3 * radius * (radius + 1) > MAX_ROOM_WORKSPACE_HEXES
    )
      throw new Error('Room workspace exceeds the cell allocation budget.');
    for (let r = -radius; r <= radius; r++)
      for (let q = -radius; q <= radius; q++)
        if (containsWorkspaceCell(radius, { q, r }))
          cells.push({ q: q || 0, r: r || 0 });
  }
  return cells;
}
function cellCorners(cell: RoomHexCell): WorldPos[] {
  return hexCorners(
    cubeToWorld({ x: cell.q, y: -cell.q - cell.r, z: cell.r }, HEX_SIZE),
    HEX_SIZE
  );
}
function tolerance(...values: number[]): number {
  return 64 * Number.EPSILON * Math.max(1, ...values.map(Math.abs));
}
function inHex(
  point: WorldPos,
  cell: RoomHexCell,
  strictInterior = false
): boolean {
  const corners = cellCorners(cell);
  const epsilon = tolerance(point.x, point.z);
  return corners.every((a, i) => {
    const b = corners[(i + 1) % 6];
    const cross = (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
    return strictInterior ? cross < -epsilon : cross <= epsilon;
  });
}
/** Shared rounding handles interiors. Closed-boundary ties include the rounded
 * cell itself, so machine-precision screen roundtrips cannot change the winner. */
export function workspaceCellAtPoint(
  workspace: RoomWorkspace,
  point: WorldPos
): RoomHexCell | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const cube = worldToCube(point, HEX_SIZE);
  const first = { q: cube.x || 0, r: cube.z || 0 };
  if (containsWorkspaceCell(workspace, first) && inHex(point, first, true))
    return first;
  const ties = [
    first,
    ...HEX_DIRECTIONS.map((d) => ({
      q: cube.x + d.x || 0,
      r: cube.z + d.z || 0,
    })),
  ].sort((a, b) => a.r - b.r || a.q - b.q);
  return (
    ties.find((c) => containsWorkspaceCell(workspace, c) && inHex(point, c)) ??
    null
  );
}
/** The cell under a world point anywhere on the unbounded canvas
 * (rpg-project#725 R3): the same rounding and closed-boundary tie-break as
 * `workspaceCellAtPoint`, with no grid to fall outside of. Null only for a
 * point that is not finite. */
export function cellAtWorldPoint(point: WorldPos): RoomHexCell | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const cube = worldToCube(point, HEX_SIZE);
  const first = { q: cube.x || 0, r: cube.z || 0 };
  if (inHex(point, first, true)) return first;
  const ties = [
    first,
    ...HEX_DIRECTIONS.map((d) => ({
      q: cube.x + d.x || 0,
      r: cube.z + d.z || 0,
    })),
  ].sort((a, b) => a.r - b.r || a.q - b.q);
  return ties.find((c) => inHex(point, c)) ?? first;
}
export function containsWorkspacePoint(
  workspace: RoomWorkspace,
  point: WorldPos
): boolean {
  return workspaceCellAtPoint(workspace, point) !== null;
}
export function workspaceBounds(workspace: RoomWorkspace): WorkspaceBounds {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (const cell of workspaceCells(workspace))
    for (const p of cellCorners(cell)) {
      bounds.minX = Math.min(bounds.minX, p.x);
      bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.minZ = Math.min(bounds.minZ, p.z);
      bounds.maxZ = Math.max(bounds.maxZ, p.z);
    }
  return bounds;
}
export function workspaceBoundary(
  workspace: RoomWorkspace
): Array<{ a: WorldPos; b: WorldPos }> {
  return workspaceCells(workspace).flatMap((cell) =>
    HEX_DIRECTIONS.flatMap((d) => {
      const neighbor = { q: cell.q + d.x, r: cell.r + d.z };
      if (containsWorkspaceCell(workspace, neighbor)) return [];
      const edge = hexEdgeBetween(
        { x: cell.q, y: -cell.q - cell.r, z: cell.r },
        { x: neighbor.q, y: -neighbor.q - neighbor.r, z: neighbor.r },
        HEX_SIZE
      );
      return [{ a: edge.a, b: edge.b }];
    })
  );
}
/** Bounded candidate enumeration, never the enclosing radius disk. */
function candidates(
  workspace: RoomWorkspace,
  box: WorkspaceBounds
): RoomHexCell[] {
  const cells: RoomHexCell[] = [];
  const rowSpacing = 1.5 * HEX_SIZE,
    columnSpacing = Math.sqrt(3) * HEX_SIZE;
  for (
    let r = Math.ceil((box.minZ - HEX_SIZE) / rowSpacing);
    r <= Math.floor((box.maxZ + HEX_SIZE) / rowSpacing);
    r++
  ) {
    const shift = r / 2;
    for (
      let q = Math.ceil((box.minX - columnSpacing / 2) / columnSpacing - shift);
      q <= Math.floor((box.maxX + columnSpacing / 2) / columnSpacing - shift);
      q++
    )
      if (containsWorkspaceCell(workspace, { q, r })) cells.push({ q, r });
  }
  return cells;
}
function clip(
  poly: WorldPos[],
  axis: 'x' | 'z',
  limit: number,
  above: boolean
): WorldPos[] {
  const out: WorldPos[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const ai = above ? a[axis] >= limit : a[axis] <= limit,
      bi = above ? b[axis] >= limit : b[axis] <= limit;
    if (ai) out.push(a);
    if (ai !== bi) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}
/** Conservative authored-shape predicate: the entire AABB must be covered by the closed hex union. */
export function containsWorkspaceAabb(
  workspace: RoomWorkspace,
  box: WorkspaceBounds
): boolean {
  if (
    !Object.values(box).every(Number.isFinite) ||
    box.minX > box.maxX ||
    box.minZ > box.maxZ
  )
    return false;
  const bounds = workspaceBounds(workspace),
    eps = tolerance(...Object.values(bounds), ...Object.values(box));
  if (
    box.minX < bounds.minX - eps ||
    box.maxX > bounds.maxX + eps ||
    box.minZ < bounds.minZ - eps ||
    box.maxZ > bounds.maxZ + eps
  )
    return false;
  const width = box.maxX - box.minX,
    height = box.maxZ - box.minZ;
  if (width === 0 && height === 0)
    return containsWorkspacePoint(workspace, { x: box.minX, z: box.minZ });
  for (const x of [box.minX, box.maxX])
    for (const z of [box.minZ, box.maxZ])
      if (!containsWorkspacePoint(workspace, { x, z })) return false;
  const cells = candidates(workspace, box);
  if (width === 0 || height === 0) {
    // Clip the nonzero segment against each convex hex; union its parameter intervals.
    const a = { x: box.minX, z: box.minZ },
      b = { x: box.maxX, z: box.maxZ };
    const intervals: Array<[number, number]> = [];
    for (const cell of cells) {
      let lo = 0,
        hi = 1;
      const corners = cellCorners(cell);
      for (let i = 0; i < 6; i++) {
        const p = corners[i],
          q = corners[(i + 1) % 6];
        const v = (q.x - p.x) * (a.z - p.z) - (q.z - p.z) * (a.x - p.x);
        const slope = (q.x - p.x) * (b.z - a.z) - (q.z - p.z) * (b.x - a.x);
        if (slope === 0) {
          if (v > eps) {
            hi = -1;
            break;
          }
        } else if (slope > 0) hi = Math.min(hi, -v / slope);
        else lo = Math.max(lo, -v / slope);
      }
      if (lo <= hi + eps) intervals.push([lo, hi]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let end = 0;
    for (const [lo, hi] of intervals) {
      if (lo > end + eps) return false;
      end = Math.max(end, hi);
    }
    return end >= 1 - eps;
  }
  let covered = 0,
    correction = 0;
  for (const cell of cells) {
    let poly = cellCorners(cell);
    poly = clip(poly, 'x', box.minX, true);
    poly = clip(poly, 'x', box.maxX, false);
    poly = clip(poly, 'z', box.minZ, true);
    poly = clip(poly, 'z', box.maxZ, false);
    // Translation keeps shoelace cancellation bounded at distant world coordinates.
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      area +=
        (a.x - box.minX) * (b.z - box.minZ) -
        (b.x - box.minX) * (a.z - box.minZ);
    }
    const contribution = Math.abs(area) / 2 - correction;
    const next = covered + contribution;
    correction = next - covered - contribution;
    covered = next;
  }
  // Relative area roundoff, not a fixed epsilon that would excuse arbitrarily thin gaps.
  return (
    Math.abs(covered - width * height) <=
    64 * Number.EPSILON * Math.max(covered, width * height, Number.MIN_VALUE)
  );
}
