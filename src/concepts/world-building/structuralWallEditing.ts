/**
 * Pure editor helpers for the shared concept wall tool (Task 3).
 *
 * These are authoring operations, not a second wall model and not gameplay
 * queries. Every function takes object input, returns fresh values, and leaves
 * its input untouched. Invalid input throws a NAMED Error rather than
 * returning a plausible empty result, so a refusal can never look like an
 * authored deletion. The pure geometry leaves live in
 * `structuralWallGeometry.ts`; this module composes them with the authored
 * appearance/blocker document values in `structuralWalls.ts`.
 */
import {
  cubeToWorld,
  getHexNeighbors,
  HEX_SIZE,
  hexCorners,
  worldToCube,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import {
  resizeWallEndpoint,
  transformWall,
  wallSolidIntervals,
  type WallGeometry,
  type WallInterval,
} from './structuralWallGeometry';
import type { StructuralWall, StructuralWallSurface } from './structuralWalls';
import type { WorldPoint } from './types';

/** Arithmetic tolerance for still-touching operations (a resize landing on its
 * own clamp must not be reported as a refusal). */
const EXTENT_EPSILON = 1e-9;

/** Explicit editor protection: a derived wall cannot mint unbounded repeated
 * pieces. The refusal is named and the derivation allocates nothing past it. */
export const MAX_WALL_PIECES_PER_WALL = 200;

/** The new authored wall's own structural depth, in scene units. Independent
 * of appearance and of any measured asset; the author edits it. */
export const DEFAULT_WALL_BLOCKER_DEPTH = 0.25;

function fail(message: string): never {
  throw new Error(`Structural wall edit: ${message}`);
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) fail(`${name} must be a finite number.`);
}

function finitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0)
    fail(`${name} must be a finite positive number.`);
}

function copyPoint(point: WorldPoint): WorldPoint {
  return { x: point.x, z: point.z };
}

/** Longitudinal length of a wall's line, in scene units. */
export function wallLength(wall: WallGeometry): number {
  const length = Math.hypot(
    wall.line.end.x - wall.line.start.x,
    wall.line.end.z - wall.line.start.z
  );
  if (!Number.isFinite(length) || length <= 0)
    fail('the wall line must have a finite positive length.');
  return length;
}

/** Midpoint of a wall's line — the pivot a whole-wall rotation turns about and
 * the origin the authored blocker is local to. */
export function wallMidpoint(wall: WallGeometry): WorldPoint {
  return {
    x: (wall.line.start.x + wall.line.end.x) / 2,
    z: (wall.line.start.z + wall.line.end.z) / 2,
  };
}

/** Three.js yaw that lines a piece's local +X (its width axis) up with the
 * wall's start-to-end direction — the same `atan2(-dz, dx)` convention every
 * other edge-aligned piece in this codebase uses. The pure geometry helper's
 * rotation angle is the mathematical XZ plane, which is NOT this yaw. */
export function wallDirectionYaw(wall: WallGeometry): number {
  const dx = wall.line.end.x - wall.line.start.x;
  const dz = wall.line.end.z - wall.line.start.z;
  return Math.atan2(-dz, dx);
}

/** World unit vector from start to end. */
function wallDirection(wall: WallGeometry): WorldPoint {
  const length = wallLength(wall);
  return {
    x: (wall.line.end.x - wall.line.start.x) / length,
    z: (wall.line.end.z - wall.line.start.z) / length,
  };
}

/** Local +Z unit vector (the blocker rectangle's perpendicular), derived from
 * the same convention `wallDirectionYaw` uses: yaw maps local +Z to
 * `(-uz, ux)`. */
function wallPerpendicular(wall: WallGeometry): WorldPoint {
  const direction = wallDirection(wall);
  return { x: -direction.z, z: direction.x };
}

/**
 * Snap a point to the nearest existing hex centre, corner, or side midpoint.
 * Disabled snapping returns the point unchanged, so free placement is the
 * author's explicit choice rather than a constrained lattice. The side
 * midpoint is the midpoint between the containing hex's centre and its
 * neighbour's — the shared edge's midpoint — so no second hex embedding is
 * introduced. Preview and commit call this same function.
 */
export function snapWallPoint(input: { point: WorldPoint; enabled: boolean }): {
  point: WorldPoint;
  snapped: boolean;
} {
  finite(input.point.x, 'point.x');
  finite(input.point.z, 'point.z');
  if (!input.enabled) return { point: copyPoint(input.point), snapped: false };
  const cube = worldToCube(input.point, HEX_SIZE);
  const base = { x: cube.x, y: cube.y, z: cube.z } as CubeCoord;
  const centre = cubeToWorld(base, HEX_SIZE);
  const candidates: WorldPoint[] = [centre];
  for (const neighbour of getHexNeighbors(base)) {
    candidates.push(cubeToWorld(neighbour, HEX_SIZE));
  }
  for (const corner of hexCorners(centre, HEX_SIZE)) candidates.push(corner);
  for (const neighbour of getHexNeighbors(base)) {
    const other = cubeToWorld(neighbour, HEX_SIZE);
    candidates.push({
      x: (centre.x + other.x) / 2,
      z: (centre.z + other.z) / 2,
    });
  }
  let best = candidates[0]!;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance =
      (candidate.x - input.point.x) ** 2 + (candidate.z - input.point.z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return { point: copyPoint(best), snapped: true };
}

/**
 * Whether a catalog entry can stand in for a repeated wall surface today. Only
 * provider-generated exact assets with usable measured dimensions and no door
 * leaf role qualify; a legacy asset needs a measured fit adapter before it can
 * be offered rather than being silently omitted after authoring.
 */
export function isRepeatableWallAsset(entry: {
  source: 'legacy' | 'generated';
  asset?: {
    boundsMeters: readonly [number, number, number];
    roles?: readonly Readonly<{ role: string }>[];
  };
}): boolean {
  if (entry.source !== 'generated' || !entry.asset) return false;
  const [width, height, depth] = entry.asset.boundsMeters;
  if (
    ![width, height, depth].every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    return false;
  return !entry.asset.roles?.some((role) => role.role === 'leaf');
}

/** The catalog refs the wall tool may repeat today, in stable catalog order. */
export function repeatableWallAssetRefs(): string[] {
  return [...WORLD_BUILDING_CATALOG_BY_REF.values()]
    .filter((entry) => isRepeatableWallAsset(entry))
    .map((entry) => entry.ref);
}

/** One instance of a repeated wall surface, measured from the span's own
 * start. `width` is the even-fit slot width, never the asset's native width. */
export interface WallPiece {
  distance: number;
  width: number;
}

/** One derived piece's placement. The PARENT transform owns the span pose and
 * the full exact fit scale, so the shared model is left at its normal
 * `heightScale`. `y` is the authored elevation WITHOUT the dungeon surface
 * lift; the component compensates the shared model's single lift so it is never
 * scaled by `heightScale`. `heightScale` is deliberately unbounded by the
 * model's own `[0.25, 4]` clamp: the parent owns the exact fit. */
export interface WallPiecePlacement {
  point: WorldPoint;
  y: number;
  rotationY: number;
  widthScale: number;
  depthScale: number;
  heightScale: number;
}

/** One visible longitudinal span and the pieces that fill it. */
export interface WallSpanPieces {
  span: WallInterval;
  pieces: WallPiecePlacement[];
}

/**
 * Even-fit a span: the nearest positive count of native-width pieces, with the
 * span divided equally across them so tiles meet edge to edge. This is v2's
 * `tileWallSegment` strategy reused, not a second tiling policy. The count is
 * computed for every span BEFORE any array is built, and a total past the
 * explicit cap refuses by name without allocating.
 */
export function layoutWallPieces(input: {
  wall: StructuralWallSurface;
  sourceWidthMeters: number;
  sourceHeightMeters: number;
  sourceDepthMeters: number;
  maxPieces?: number;
}): WallSpanPieces[] {
  finitePositive(input.sourceWidthMeters, 'sourceWidthMeters');
  finitePositive(input.sourceHeightMeters, 'sourceHeightMeters');
  finitePositive(input.sourceDepthMeters, 'sourceDepthMeters');
  const maxPieces = input.maxPieces ?? MAX_WALL_PIECES_PER_WALL;
  if (!Number.isInteger(maxPieces) || maxPieces < 1)
    fail(`maxPieces must be a positive integer (received ${input.maxPieces}).`);
  const wall = input.wall;
  const length = wallLength(wall);
  finite(wall.appearance.height, 'appearance.height');
  if (wall.appearance.height <= 0) fail('appearance.height must be positive.');
  const spans = wallSolidIntervals({
    wall,
    extent: { start: 0, end: length },
  });
  // The even-fit count and the per-piece scale must use the SAME units. The
  // asset's rendered native width is its measured metres times the shared
  // Synty scale, so the count divides the scene-unit span by that world width,
  // not by the raw metre figure (a mismatch under-counts and stretches every
  // piece).
  // These are the catalog's boundsMeters: the provider already measures them
  // at shared runtime scale. WorldAssetModel applies that scale to raw vertices;
  // applying it to these dimensions again makes every fitted piece 4/3 too big.
  const sourceWidthWorld = input.sourceWidthMeters;
  const sourceDepthWorld = input.sourceDepthMeters;
  const sourceHeightWorld = input.sourceHeightMeters;
  const counts = spans.map((span) =>
    Math.max(1, Math.round((span.end - span.start) / sourceWidthWorld))
  );
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total > maxPieces)
    fail(
      `a ${total}-piece wall exceeds the ${maxPieces}-piece allocation cap.`
    );
  const direction = wallDirection(wall);
  const rotationY = wallDirectionYaw(wall);
  return spans.map((span, index) => {
    const count = counts[index]!;
    const slotWidth = (span.end - span.start) / count;
    const pieces = Array.from({ length: count }, (_, pieceIndex) => {
      const distance = span.start + slotWidth * (pieceIndex + 0.5);
      return {
        point: {
          x: wall.line.start.x + direction.x * distance,
          z: wall.line.start.z + direction.z * distance,
        },
        y: wall.appearance.elevation,
        rotationY,
        widthScale: slotWidth / sourceWidthWorld,
        depthScale: wall.appearance.thickness / sourceDepthWorld,
        heightScale: wall.appearance.height / sourceHeightWorld,
      };
    });
    return { span, pieces };
  });
}

/** The editor-only wireframe guide for the authored blocker rectangle: its
 * world centre, yaw, and authored extents. It is a visual aid, never a sight
 * calculation. */
export function wallBlockerGuide(wall: StructuralWall): {
  point: WorldPoint;
  rotationY: number;
  width: number;
  depth: number;
} {
  const midpoint = wallMidpoint(wall);
  const direction = wallDirection(wall);
  const perpendicular = wallPerpendicular(wall);
  const { offsetX, offsetZ } = wall.blocker.footprint;
  finite(offsetX, 'blocker.footprint.offsetX');
  finite(offsetZ, 'blocker.footprint.offsetZ');
  return {
    point: {
      x: midpoint.x + direction.x * offsetX + perpendicular.x * offsetZ,
      z: midpoint.z + direction.z * offsetX + perpendicular.z * offsetZ,
    },
    rotationY: wallDirectionYaw(wall),
    width: wall.blocker.footprint.width,
    depth: wall.blocker.footprint.depth,
  };
}

/** Resolve a wall's authored opening list against its own line, refusing
 * invalid overlap or extent by name. `ignoreId` lets an edit validate its own
 * replacement without colliding with itself. */
function assertOpenings(
  wall: WallGeometry,
  openings: readonly { id: string; position: number; width: number }[],
  ignoreId?: string
): void {
  const length = wallLength(wall);
  const ids = new Set<string>();
  const spans: { start: number; end: number }[] = [];
  for (const opening of openings) {
    if (opening.id.length === 0) fail('an opening id must be nonempty.');
    if (opening.id !== ignoreId && ids.has(opening.id))
      fail(`opening id ${opening.id} is already used.`);
    ids.add(opening.id);
    finitePositive(opening.width, `opening ${opening.id} width`);
    finite(opening.position, `opening ${opening.id} position`);
    const start = opening.position - opening.width / 2;
    const end = opening.position + opening.width / 2;
    if (start < -EXTENT_EPSILON || end > length + EXTENT_EPSILON)
      fail(
        `opening ${opening.id} does not fit inside the ${length}-unit wall.`
      );
    if (opening.id !== ignoreId) spans.push({ start, end });
  }
  if (ignoreId !== undefined) {
    const kept = openings.find((opening) => opening.id === ignoreId);
    if (kept) {
      spans.push({
        start: kept.position - kept.width / 2,
        end: kept.position + kept.width / 2,
      });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  for (let index = 1; index < spans.length; index += 1) {
    if (spans[index]!.start < spans[index - 1]!.end - EXTENT_EPSILON)
      fail('openings must not overlap.');
  }
}

function cloneWall(wall: StructuralWall): StructuralWall {
  return structuredClone(wall);
}

/** Add a doorless opening by local centre distance and width. Refuses invalid
 * overlap, extent or identity without modifying the draft. */
export function addWallOpening(
  wall: StructuralWall,
  input: { id: string; position: number; width: number }
): StructuralWall {
  if (input.id.length === 0) fail('an opening id must be nonempty.');
  if (wall.openings.some((opening) => opening.id === input.id))
    fail(`opening id ${input.id} is already used.`);
  const next = cloneWall(wall);
  next.openings = [
    ...next.openings.map((opening) => ({ ...opening })),
    { id: input.id, position: input.position, width: input.width },
  ];
  assertOpenings(next, next.openings);
  return next;
}

/** Replace one opening's authored position/width by id. The opening's
 * attached-door record (identity and appearance) is PRESERVED: an opening edit
 * never silently detaches a door or drops its state. */
export function updateWallOpening(
  wall: StructuralWall,
  id: string,
  input: { position: number; width: number }
): StructuralWall {
  if (!wall.openings.some((opening) => opening.id === id))
    fail(`unknown opening ${id}.`);
  const next = cloneWall(wall);
  next.openings = next.openings.map((opening) =>
    opening.id === id
      ? { ...opening, position: input.position, width: input.width }
      : { ...opening }
  );
  assertOpenings(next, next.openings, id);
  return next;
}

/** Remove one doorless opening by id. Removing an absent id is a no-op copy. */
export function removeWallOpening(
  wall: StructuralWall,
  id: string
): StructuralWall {
  const next = cloneWall(wall);
  next.openings = next.openings
    .filter((opening) => opening.id !== id)
    .map((opening) => ({ ...opening }));
  return next;
}

/**
 * Resize a wall by an exact total length along its own line, moving one
 * endpoint. Opening world positions are retained and the drag stops at the
 * closest opening edge. The blocker's own end margins are preserved by
 * changing its width by the SAME signed length delta, with offsetX, offsetZ,
 * depth and both flags untouched; a nonpositive resulting width is refused.
 */
export function resizeWallLength(input: {
  wall: StructuralWall;
  endpoint: 'start' | 'end';
  length: number;
}): { wall: StructuralWall; appliedLength: number; clamped: boolean } {
  finitePositive(input.length, 'length');
  const originalLength = wallLength(input.wall);
  const distance =
    input.endpoint === 'end' ? input.length : originalLength - input.length;
  const geometry = resizeWallEndpoint({
    wall: input.wall,
    endpoint: input.endpoint,
    distance,
  });
  const appliedLength = wallLength(geometry.wall);
  const delta = appliedLength - originalLength;
  const width = input.wall.blocker.footprint.width + delta;
  if (!Number.isFinite(width) || width <= 0)
    fail('resizing would leave a nonpositive blocker width.');
  const next = cloneWall(input.wall);
  next.line = {
    start: { ...geometry.wall.line.start },
    end: { ...geometry.wall.line.end },
  };
  next.openings = geometry.wall.openings.map((opening) => ({ ...opening }));
  next.blocker = {
    ...next.blocker,
    footprint: { ...next.blocker.footprint, width },
  };
  return { wall: next, appliedLength, clamped: geometry.clamped };
}

/** Replace a wall's appearance. The blocker rectangle, openings and identity
 * are untouched, so an asset swap can never change what the wall blocks. */
export function setWallAppearance(
  wall: StructuralWall,
  appearance: StructuralWall['appearance']
): StructuralWall {
  if (appearance.assetRef.length === 0)
    fail('an appearance asset ref must be nonempty.');
  if (!WORLD_BUILDING_CATALOG_BY_REF.has(appearance.assetRef))
    fail(`unknown catalog asset ${appearance.assetRef}.`);
  finitePositive(appearance.height, 'appearance.height');
  finitePositive(appearance.thickness, 'appearance.thickness');
  finite(appearance.elevation, 'appearance.elevation');
  const next = cloneWall(wall);
  next.appearance = { ...appearance };
  return next;
}

/** Replace a wall's label. No geometry or blocking data changes. */
export function setWallLabel(
  wall: StructuralWall,
  label: string
): StructuralWall {
  if (typeof label !== 'string') fail('a label must be a string.');
  const next = cloneWall(wall);
  next.label = label;
  return next;
}

/** Replace the authored blocker rectangle and flags. Independent of
 * appearance; every field is validated before the draft changes. */
export function setWallBlocker(
  wall: StructuralWall,
  blocker: StructuralWall['blocker']
): StructuralWall {
  finitePositive(blocker.footprint.width, 'blocker.footprint.width');
  finitePositive(blocker.footprint.depth, 'blocker.footprint.depth');
  finite(blocker.footprint.offsetX, 'blocker.footprint.offsetX');
  finite(blocker.footprint.offsetZ, 'blocker.footprint.offsetZ');
  if (typeof blocker.blocksMovement !== 'boolean')
    fail('blocker.blocksMovement must be a boolean.');
  if (typeof blocker.blocksLineOfSight !== 'boolean')
    fail('blocker.blocksLineOfSight must be a boolean.');
  const next = cloneWall(wall);
  next.blocker = {
    ...blocker,
    footprint: { ...blocker.footprint },
  };
  return next;
}

/** Translate a whole wall, carrying its openings and its local blocker. */
export function translateWall(
  wall: StructuralWall,
  translation: WorldPoint
): StructuralWall {
  finite(translation.x, 'translation.x');
  finite(translation.z, 'translation.z');
  const geometry = transformWall({
    wall,
    angle: 0,
    pivot: wallMidpoint(wall),
    translation,
  });
  const next = cloneWall(wall);
  next.line = {
    start: { ...geometry.line.start },
    end: { ...geometry.line.end },
  };
  next.openings = geometry.openings.map((opening) => ({ ...opening }));
  return next;
}

/** Apply the existing controls' planar move or Three.js positive-Y yaw to a
 * wall. The authored line remains the only pose; cuts/blocker settings travel
 * with it. Convert yaw once because rotateWall uses mathematical XZ angles. */
export function previewWallTransform(input: {
  wall: StructuralWall;
  mode: 'move' | 'rotate';
  change: { x: number; z: number; rotationY: number };
}): StructuralWall {
  return input.mode === 'move'
    ? translateWall(input.wall, { x: input.change.x, z: input.change.z })
    : rotateWall(input.wall, { angle: -input.change.rotationY });
}

/** Rotate a whole wall about an explicit pivot in the mathematical XZ plane
 * (`angle` is NOT Three.js yaw), carrying openings and local blocker offsets. */
export function rotateWall(
  wall: StructuralWall,
  input: { angle: number; pivot?: WorldPoint }
): StructuralWall {
  finite(input.angle, 'rotation angle');
  const pivot = input.pivot ?? wallMidpoint(wall);
  const geometry = transformWall({
    wall,
    angle: input.angle,
    pivot,
    translation: { x: 0, z: 0 },
  });
  const next = cloneWall(wall);
  next.line = {
    start: { ...geometry.line.start },
    end: { ...geometry.line.end },
  };
  next.openings = geometry.openings.map((opening) => ({ ...opening }));
  return next;
}

/**
 * Create one authored wall from a finished draw gesture. The line is required
 * to be finite and non-degenerate; a zero-length gesture is the caller's
 * no-op, not a wall. The blocker starts as the drawn structure's own
 * longitudinal extent with movement and sight blocking enabled. This is the
 * wall tool's default, not an inference from asset appearance; both flags remain
 * independently editable and saved declarations are never rewritten.
 */
export function createWall(input: {
  id: string;
  start: WorldPoint;
  end: WorldPoint;
  assetRef: string;
  height: number;
  thickness: number;
  elevation: number;
  label?: string;
}): StructuralWall {
  if (input.id.length === 0) fail('a wall id must be nonempty.');
  if (!WORLD_BUILDING_CATALOG_BY_REF.has(input.assetRef))
    fail(`unknown catalog asset ${input.assetRef}.`);
  finitePositive(input.height, 'appearance.height');
  finitePositive(input.thickness, 'appearance.thickness');
  finite(input.elevation, 'appearance.elevation');
  finite(input.start.x, 'line.start.x');
  finite(input.start.z, 'line.start.z');
  finite(input.end.x, 'line.end.x');
  finite(input.end.z, 'line.end.z');
  const length = Math.hypot(
    input.end.x - input.start.x,
    input.end.z - input.start.z
  );
  if (!Number.isFinite(length) || length <= 0)
    fail('a wall line must have a finite positive length.');
  return {
    id: input.id,
    label: input.label ?? 'Wall',
    line: { start: copyPoint(input.start), end: copyPoint(input.end) },
    openings: [],
    appearance: {
      assetRef: input.assetRef,
      height: input.height,
      thickness: input.thickness,
      elevation: input.elevation,
    },
    blocker: {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: {
        width: length,
        depth: DEFAULT_WALL_BLOCKER_DEPTH,
        offsetX: 0,
        offsetZ: 0,
      },
    },
  };
}
