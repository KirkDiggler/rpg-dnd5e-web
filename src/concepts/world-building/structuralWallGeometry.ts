import type { WorldPoint } from './types';

/** Transient editor geometry, not a document schema or gameplay collider. */
export interface WallLine {
  start: WorldPoint;
  end: WorldPoint;
}

/** Opening center measured along the line from its start, in scene units. */
export interface WallOpeningGeometry {
  id: string;
  position: number;
  width: number;
}

/** Geometry shared by wall gestures and visual layout; no asset or door state. */
export interface WallGeometry {
  line: WallLine;
  openings: readonly WallOpeningGeometry[];
}

/** Interval along the wall's start-to-end direction in scene units. */
export interface WallInterval {
  start: number;
  end: number;
}

function requireGeometry(valid: boolean, message: string): asserts valid {
  if (!valid) throw new Error(`Wall geometry: ${message}`);
}

function finitePoint(point: WorldPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z);
}

function frame(wall: WallGeometry): {
  length: number;
  direction: WorldPoint;
  cuts: WallInterval[];
} {
  const { start, end } = wall.line;
  requireGeometry(
    finitePoint(start) && finitePoint(end),
    'endpoints must be finite'
  );
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  requireGeometry(
    Number.isFinite(length) && length > 0,
    'line must have a finite positive length'
  );
  // Trigonometric transforms can change the measured length by a few ULPs.
  // This is arithmetic precision, not an editor snap distance or a second pose.
  const roundoff = 8 * Number.EPSILON * length;
  const ids = new Set<string>();
  const cuts = wall.openings
    .map((opening) => {
      requireGeometry(
        opening.id.length > 0 && !ids.has(opening.id),
        'opening IDs must be nonempty and unique'
      );
      ids.add(opening.id);
      requireGeometry(
        Number.isFinite(opening.position) &&
          Number.isFinite(opening.width) &&
          opening.width > 0,
        'opening dimensions must be finite and width positive'
      );
      const a = opening.position - opening.width / 2;
      const b = opening.position + opening.width / 2;
      requireGeometry(
        Number.isFinite(a) &&
          Number.isFinite(b) &&
          a >= -roundoff &&
          b <= length + roundoff &&
          b > a,
        'opening must fit within the line'
      );
      return {
        start: Math.abs(a) <= roundoff ? 0 : a,
        end: Math.abs(b - length) <= roundoff ? length : b,
      };
    })
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < cuts.length; i++) {
    requireGeometry(
      cuts[i].start >= cuts[i - 1].end,
      'openings must not overlap'
    );
  }
  return { length, direction: { x: dx / length, z: dz / length }, cuts };
}

function along(input: {
  start: WorldPoint;
  direction: WorldPoint;
  distance: number;
}): WorldPoint {
  const point = {
    x: input.start.x + input.direction.x * input.distance,
    z: input.start.z + input.direction.z * input.distance,
  };
  requireGeometry(finitePoint(point), 'derived point is not representable');
  return point;
}

/** Resolve an opening's world XZ center. Refuses invalid geometry or unknown ID. */
export function wallOpeningPoint(input: {
  wall: WallGeometry;
  openingId: string;
}): WorldPoint {
  const { direction } = frame(input.wall);
  const opening = input.wall.openings.find(
    (entry) => entry.id === input.openingId
  );
  requireGeometry(opening !== undefined, `unknown opening ${input.openingId}`);
  return along({
    start: input.wall.line.start,
    direction,
    distance: opening.position,
  });
}

/**
 * Resize collinearly. Distance is measured from the ORIGINAL start along the
 * ORIGINAL start-to-end direction, including for an end drag. Clamps at the
 * outermost opening edge; never deletes an opening. A collapse or inversion
 * without an opening to constrain it is refused. Does not mutate its input.
 */
export function resizeWallEndpoint(input: {
  wall: WallGeometry;
  endpoint: 'start' | 'end';
  distance: number;
}): { wall: WallGeometry; clamped: boolean } {
  const { length, direction, cuts } = frame(input.wall);
  requireGeometry(
    Number.isFinite(input.distance),
    'resize distance must be finite'
  );
  const distance =
    cuts.length === 0
      ? input.distance
      : input.endpoint === 'start'
        ? Math.min(input.distance, cuts[0].start)
        : Math.max(input.distance, cuts[cuts.length - 1].end);
  requireGeometry(
    input.endpoint === 'start' ? distance < length : distance > 0,
    'resize cannot collapse or invert the line'
  );
  const point = along({ start: input.wall.line.start, direction, distance });
  const wall: WallGeometry = {
    line: {
      start: input.endpoint === 'start' ? point : { ...input.wall.line.start },
      end: input.endpoint === 'end' ? point : { ...input.wall.line.end },
    },
    openings: input.wall.openings.map((opening) => ({
      ...opening,
      position: opening.position - (input.endpoint === 'start' ? distance : 0),
    })),
  };
  frame(wall);
  return { wall, clamped: distance !== input.distance };
}

/**
 * Rotate in the mathematical XZ plane about pivot, THEN translate. Positive
 * pi/2 sends +X toward +Z; this is NOT Three.js's positive-Y yaw convention.
 * Openings retain their local distances and identities. Refuses non-finite
 * input and unrepresentable output, and does not mutate its input.
 */
export function transformWall(input: {
  wall: WallGeometry;
  pivot: WorldPoint;
  angle: number;
  translation: WorldPoint;
}): WallGeometry {
  frame(input.wall);
  requireGeometry(
    finitePoint(input.pivot) &&
      finitePoint(input.translation) &&
      Number.isFinite(input.angle),
    'transform must be finite'
  );
  const cosine = Math.cos(input.angle);
  const sine = Math.sin(input.angle);
  const transform = (point: WorldPoint): WorldPoint => {
    const x = point.x - input.pivot.x;
    const z = point.z - input.pivot.z;
    const result = {
      x: input.pivot.x + x * cosine - z * sine + input.translation.x,
      z: input.pivot.z + x * sine + z * cosine + input.translation.z,
    };
    requireGeometry(
      finitePoint(result),
      'transformed point is not representable'
    );
    return result;
  };
  const wall: WallGeometry = {
    line: {
      start: transform(input.wall.line.start),
      end: transform(input.wall.line.end),
    },
    openings: input.wall.openings.map((opening) => ({ ...opening })),
  };
  frame(wall);
  return wall;
}

/**
 * Cut openings from an already positioned longitudinal extent. The extent may
 * differ from the visible line: offsets apply BEFORE cutting, never to the
 * resulting pieces. Pure editor layout only; it does not answer movement or
 * sight queries, and it deliberately applies no per-prop dimension clamp.
 */
export function wallSolidIntervals(input: {
  wall: WallGeometry;
  extent: WallInterval;
}): WallInterval[] {
  const { cuts } = frame(input.wall);
  const { start, end } = input.extent;
  requireGeometry(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      Number.isFinite(end - start),
    'extent must have finite positive length'
  );
  const spans: WallInterval[] = [];
  let cursor = start;
  for (const cut of cuts) {
    if (cut.end <= cursor) continue;
    if (cut.start >= end) break;
    if (cut.start > cursor) spans.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
    if (cursor >= end) break;
  }
  if (cursor < end) spans.push({ start: cursor, end });
  return spans;
}
