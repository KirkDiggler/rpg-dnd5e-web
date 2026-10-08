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
    };
export interface WorkspaceBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function dimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 128 ||
    height > 128 ||
    width * height > MAX_ROOM_WORKSPACE_HEXES
  )
    throw new Error(
      'Room workspace widthHexes/heightHexes must be integers in 1..128 (at most 16384 cells).'
    );
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
  for (const cell of workspaceCells(workspace)) {
    workspace.hexRadius = Math.max(
      workspace.hexRadius,
      Math.abs(cell.q),
      Math.abs(cell.r),
      Math.abs(cell.q + cell.r)
    );
    for (const p of cellCorners(cell))
      workspace.horizontalLimit = Math.max(
        workspace.horizontalLimit,
        Math.ceil(Math.abs(p.x)),
        Math.ceil(Math.abs(p.z))
      );
  }
  return workspace;
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
    if (!preset) throw new Error('Unsupported room workspace extent.');
    // Preserve the existing untagged preset normalization contract.
    return { ...preset };
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
  dimensions(workspace.widthHexes, workspace.heightHexes);
  const col = cell.q + Math.floor(cell.r / 2);
  return (
    col >= -Math.floor(workspace.widthHexes / 2) &&
    col < Math.ceil(workspace.widthHexes / 2) &&
    cell.r >= -Math.floor(workspace.heightHexes / 2) &&
    cell.r < Math.ceil(workspace.heightHexes / 2)
  );
}
export function workspaceCells(
  workspace: RoomWorkspace | number
): RoomHexCell[] {
  const cells: RoomHexCell[] = [];
  if (typeof workspace !== 'number' && workspace.kind === 'centered-odd-r') {
    dimensions(workspace.widthHexes, workspace.heightHexes);
    for (
      let r = -Math.floor(workspace.heightHexes / 2);
      r < Math.ceil(workspace.heightHexes / 2);
      r++
    )
      for (
        let col = -Math.floor(workspace.widthHexes / 2);
        col < Math.ceil(workspace.widthHexes / 2);
        col++
      )
        cells.push({ q: col - Math.floor(r / 2) || 0, r: r || 0 });
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
function inHex(point: WorldPos, cell: RoomHexCell): boolean {
  const corners = cellCorners(cell);
  return corners.every((a, i) => {
    const b = corners[(i + 1) % 6];
    return (
      (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x) <=
      tolerance(point.x, point.z)
    );
  });
}
/** Shared rounding first, then deterministic contained-cell tie on closed boundaries. */
export function workspaceCellAtPoint(
  workspace: RoomWorkspace,
  point: WorldPos
): RoomHexCell | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const cube = worldToCube(point, HEX_SIZE);
  const first = { q: cube.x || 0, r: cube.z || 0 };
  if (containsWorkspaceCell(workspace, first) && inHex(point, first))
    return first;
  const ties = HEX_DIRECTIONS.map((d) => ({
    q: cube.x + d.x,
    r: cube.z + d.z,
  })).sort((a, b) => a.r - b.r || a.q - b.q);
  return (
    ties.find((c) => containsWorkspaceCell(workspace, c) && inHex(point, c)) ??
    null
  );
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
