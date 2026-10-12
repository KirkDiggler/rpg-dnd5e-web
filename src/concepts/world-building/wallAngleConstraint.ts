import type { StructuralWall } from './structuralWalls';
import type { WorldPoint } from './types';

export type WallAngleReference =
  | { kind: 'world'; direction: WorldPoint }
  | { kind: 'wall'; direction: WorldPoint; wallId: string; label: string }
  | { kind: 'ambiguous' };

function requirePoint(point: WorldPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z))
    throw new Error('Right-angle editing requires finite coordinates.');
}
function requireDirection(direction: WorldPoint): void {
  requirePoint(direction);
  const squared = direction.x ** 2 + direction.z ** 2;
  if (!Number.isFinite(squared) || squared <= 0)
    throw new Error('Right-angle reference must have a finite nonzero span.');
}
const perpendicular = (direction: WorldPoint): WorldPoint => ({
  x: -direction.z,
  z: direction.x,
});
const samePoint = (a: WorldPoint, b: WorldPoint): boolean =>
  a.x === b.x && a.z === b.z;

/** Snap eligibility, not a topology/gap tolerance. Cardinal axes require exact
 * coordinate equality. For rotated axes, bound subtraction/product roundoff
 * (two coordinate differences, products and subtraction); no fixed world-unit
 * or angle epsilon. A meaningful off-axis endpoint is never bent into a join. */
export function pointOnWallAxis(input: {
  anchor: WorldPoint;
  point: WorldPoint;
  direction: WorldPoint;
}): boolean {
  const { anchor, point, direction } = input;
  requirePoint(anchor);
  requirePoint(point);
  requireDirection(direction);
  if (samePoint(anchor, point)) return false;
  if (direction.z === 0) return point.z === anchor.z;
  if (direction.x === 0) return point.x === anchor.x;
  const cross =
    (point.x - anchor.x) * direction.z - (point.z - anchor.z) * direction.x;
  const roundoff =
    8 *
    Number.EPSILON *
    (Math.abs(direction.z) * (Math.abs(point.x) + Math.abs(anchor.x)) +
      Math.abs(direction.x) * (Math.abs(point.z) + Math.abs(anchor.z)));
  return (
    Number.isFinite(cross) &&
    Number.isFinite(roundoff) &&
    Math.abs(cross) <= roundoff
  );
}

/** Only exact endpoint incidence selects a guide. Source order cannot change
 * the basis. Incompatible incident directions refuse instead of guessing. */
export function wallAngleReference(input: {
  anchor: WorldPoint;
  walls: readonly StructuralWall[];
  excludedWallId?: string;
}): WallAngleReference {
  requirePoint(input.anchor);
  const incident = input.walls
    .filter(
      (wall) =>
        wall.id !== input.excludedWallId &&
        (samePoint(wall.line.start, input.anchor) ||
          samePoint(wall.line.end, input.anchor))
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!incident.length) return { kind: 'world', direction: { x: 1, z: 0 } };
  const directionOf = (wall: StructuralWall): WorldPoint => ({
    x: wall.line.end.x - wall.line.start.x,
    z: wall.line.end.z - wall.line.start.z,
  });
  const first = incident[0]!;
  const direction = directionOf(first);
  requireDirection(direction);
  for (const wall of incident.slice(1)) {
    const point = directionOf(wall);
    requireDirection(point);
    if (
      !pointOnWallAxis({ anchor: { x: 0, z: 0 }, point, direction }) &&
      !pointOnWallAxis({
        anchor: { x: 0, z: 0 },
        point,
        direction: perpendicular(direction),
      })
    )
      return { kind: 'ambiguous' };
  }
  return {
    kind: 'wall',
    direction,
    wallId: first.id,
    label: first.label || first.id,
  };
}

export function constrainWallPoint(input: {
  anchor: WorldPoint;
  point: WorldPoint;
  reference: WallAngleReference;
}): { point: WorldPoint; direction: WorldPoint; feedback: string } {
  const { anchor, point, reference } = input;
  requirePoint(anchor);
  requirePoint(point);
  if (reference.kind === 'ambiguous')
    throw new Error(
      'This corner has conflicting wall directions. Start from an unambiguous endpoint or turn off Right angles.'
    );
  const parallel = reference.direction,
    normal = perpendicular(parallel);
  requireDirection(parallel);
  const delta = { x: point.x - anchor.x, z: point.z - anchor.z };
  const dot = (direction: WorldPoint): number =>
    delta.x * direction.x + delta.z * direction.z;
  const isParallel = Math.abs(dot(parallel)) >= Math.abs(dot(normal));
  const direction = isParallel ? parallel : normal;
  const amount = dot(direction) / (direction.x ** 2 + direction.z ** 2);
  // Cardinal constraints copy the varying coordinate, avoiding subtract/add
  // roundtrips of an already exact requested endpoint.
  const projected =
    direction.z === 0
      ? { x: point.x, z: anchor.z }
      : direction.x === 0
        ? { x: anchor.x, z: point.z }
        : {
            x: anchor.x + amount * direction.x,
            z: anchor.z + amount * direction.z,
          };
  requirePoint(projected);
  return {
    point: projected,
    direction,
    feedback:
      reference.kind === 'world'
        ? `Right angles · world ${direction.z === 0 ? 'X' : 'Z'}`
        : `Right angles · ${isParallel ? 'parallel' : 'perpendicular'} to ${reference.label}`,
  };
}
