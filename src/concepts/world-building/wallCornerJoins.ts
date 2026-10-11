import { setWallEndpoints } from './structuralWallEditing';
import type { WallLine } from './structuralWallGeometry';
import type { StructuralWall } from './structuralWalls';
import type { WorldPoint } from './types';
import { pointOnWallAxis } from './wallAngleConstraint';

export interface WallCornerJoin {
  wallId: string;
  endpoint: 'start' | 'end';
  point: WorldPoint;
}
const same = (a: WorldPoint, b: WorldPoint): boolean =>
  a.x === b.x && a.z === b.z;
const direction = (line: WallLine): WorldPoint => ({
  x: line.end.x - line.start.x,
  z: line.end.z - line.start.z,
});
const cross = (a: WorldPoint, b: WorldPoint): number => a.x * b.z - a.z * b.x;

/** An editing operation, not proximity-based enclosure detection. */
export function snapPerpendicularCorner(input: {
  line: WallLine;
  endpoint: 'start' | 'end';
  point: WorldPoint;
  walls: readonly StructuralWall[];
  excludedWallId?: string;
  radius: number;
}): { join: WallCornerJoin; wall: StructuralWall } | undefined {
  const u = direction(input.line);
  if (!Number.isFinite(u.x + u.z) || (u.x === 0 && u.z === 0)) return undefined;
  const fixed = input.line[input.endpoint === 'start' ? 'end' : 'start'];
  const source = input.walls.find((wall) => wall.id === input.excludedWallId);
  let best:
    | { join: WallCornerJoin; wall: StructuralWall; score: number; key: string }
    | undefined;
  for (const wall of input.walls) {
    if (wall.id === input.excludedWallId) continue;
    const v = direction(wall.line);
    if (
      !pointOnWallAxis({
        anchor: { x: 0, z: 0 },
        point: v,
        direction: { x: -u.z, z: u.x },
      })
    )
      continue;
    const t =
      cross(
        { x: wall.line.start.x - fixed.x, z: wall.line.start.z - fixed.z },
        v
      ) / cross(u, v);
    const shared = [wall.line.start, wall.line.end].find(
      (point) =>
        (same(point, input.line[input.endpoint]) ||
          (source && same(point, source.line[input.endpoint]))) &&
        pointOnWallAxis({ anchor: fixed, point, direction: u })
    );
    const point = shared
      ? { ...shared }
      : u.x === 0 && v.z === 0
        ? { x: fixed.x, z: wall.line.start.z }
        : u.z === 0 && v.x === 0
          ? { x: wall.line.start.x, z: fixed.z }
          : { x: fixed.x + u.x * t, z: fixed.z + u.z * t };
    if (!Number.isFinite(point.x + point.z) || same(point, fixed)) continue;
    const distance = Math.hypot(
      point.x - input.point.x,
      point.z - input.point.z
    );
    if (distance > input.radius) continue;
    for (const endpoint of ['start', 'end'] as const) {
      const end = wall.line[endpoint];
      const gap = Math.hypot(end.x - point.x, end.z - point.z);
      const score = Math.max(distance, gap),
        key = `${wall.id}:${endpoint}`;
      if (
        gap <= input.radius &&
        (!best ||
          score < best.score ||
          (score === best.score && key < best.key))
      )
        best = { join: { wallId: wall.id, endpoint, point }, wall, score, key };
    }
  }
  if (!best) return undefined;
  const { join, wall } = best;
  const old = wall.line[join.endpoint];
  if (
    !same(old, join.point) &&
    input.walls.some(
      (other) =>
        other.id !== wall.id &&
        other.id !== input.excludedWallId &&
        (same(other.line.start, old) || same(other.line.end, old))
    )
  )
    throw new Error(
      'Corner join refused: the other endpoint already joins another wall.'
    );
  return {
    join,
    wall: setWallEndpoints({ wall, [join.endpoint]: join.point }),
  };
}

/** Re-derive the second wall from the guarded owner snapshot; never accept a
 * caller-supplied whole replacement for the target. */
export function applyWallCornerJoin(
  walls: readonly StructuralWall[],
  line: WallLine,
  join: WallCornerJoin,
  sourceId?: string
): StructuralWall[] {
  if (
    join.wallId === sourceId ||
    !['start', 'end'].includes(join.endpoint) ||
    (!same(line.start, join.point) && !same(line.end, join.point))
  )
    throw new Error(
      'Corner join must share an endpoint with a different wall.'
    );
  const target = walls.find((wall) => wall.id === join.wallId);
  if (!target) throw new Error('Corner join target no longer exists.');
  const u = direction(line),
    v = direction(target.line);
  if (
    !pointOnWallAxis({
      anchor: { x: 0, z: 0 },
      point: v,
      direction: { x: -u.z, z: u.x },
    })
  )
    throw new Error('Corner join requires perpendicular walls.');
  if (
    !pointOnWallAxis({
      anchor: target.line[join.endpoint === 'start' ? 'end' : 'start'],
      point: join.point,
      direction: v,
    })
  )
    throw new Error('Corner join must retain the target wall direction.');
  const old = target.line[join.endpoint];
  if (
    !same(old, join.point) &&
    walls.some(
      (other) =>
        other.id !== target.id &&
        other.id !== sourceId &&
        (same(other.line.start, old) || same(other.line.end, old))
    )
  )
    throw new Error('Corner join would separate an existing junction.');
  const next = setWallEndpoints({ wall: target, [join.endpoint]: join.point });
  return walls.map((wall) => (wall.id === next.id ? next : wall));
}
