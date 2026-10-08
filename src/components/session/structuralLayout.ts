/**
 * structuralLayout — the RUNTIME adapter that turns the session's supplied
 * structural records into the shared World Building visual leaves' inputs.
 *
 * # One frame, one conversion
 *
 * The generated `AtlasStructuralWall`/`AtlasStructuralDoor` records are in
 * canonical FEET (spatial.Point's frame). The renderer works in the same
 * pointy-top scene units `hexMath`/`areaFootprintProjection` already use, so
 * this module applies the EXISTING render-only convention exactly once:
 *
 *     sceneUnitsPerFoot = sqrt(3) * hexSize / FEET_PER_HEX
 *
 * `FEET_PER_HEX` (5) is the encounter engine's fixed authored scale and
 * `sqrt(3) * hexSize` is one world hex across the flats. Canonical `Point.X`
 * becomes scene X and canonical `Point.Y` becomes scene Z — the same identity
 * `areaFootprintProjection` states. No catalog bounds are applied here: the
 * shared leaf already owns the exact asset fit against runtime-scale bounds,
 * so applying a second scale would double it.
 *
 * # Identity is decided upstream
 *
 * These converters do NOT decide whether a wall, opening or door is permitted.
 * The toolkit already withheld what this recipient may not see, so every
 * supplied record is rendered and a withheld one is simply absent. Missing or
 * malformed coordinates/dimensions are a producer defect: they are refused BY
 * NAME into `diagnostics` and contribute no geometry — never a silent mesh
 * dropped at the origin. An empty appearance ref is carried through so the
 * shared leaf can name it at the record's own pose rather than here.
 */

import type { FittedDoorPose } from '@/concepts/world-building/structuralDoorEditing';
import { wallSolidIntervals } from '@/concepts/world-building/structuralWallGeometry';
import type {
  StructuralWallOpening,
  StructuralWallSurface,
} from '@/concepts/world-building/structuralWalls';
import type {
  AtlasStructuralDoor,
  AtlasStructuralWall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { FEET_PER_HEX } from './areaFootprintProjection';

/** One wall as the shared surface leaf consumes it (scene units). */
export interface StructuralWallRenderUnit {
  readonly id: string;
  readonly surface: StructuralWallSurface;
}

/** One door as the shared fitted-door leaf consumes it (scene units). */
export interface StructuralDoorRenderUnit {
  readonly id: string;
  /** The opaque appearance content ref; the leaf resolves the catalog asset. */
  readonly assetRef: string;
  readonly pose: FittedDoorPose;
}

export interface StructuralLayoutRender {
  readonly walls: readonly StructuralWallRenderUnit[];
  readonly doors: readonly StructuralDoorRenderUnit[];
  /** Named refusals for malformed records, in supplied order. Empty when
   * every supplied record rendered. */
  readonly diagnostics: readonly string[];
}

/** The render-only feet→scene conversion, applied exactly once. */
export function sceneUnitsPerFoot(hexSize: number): number {
  if (!Number.isFinite(hexSize) || hexSize <= 0) {
    throw new Error(
      `structural layout: hex size must be a finite positive number (received ${hexSize})`
    );
  }
  return (Math.sqrt(3) * hexSize) / FEET_PER_HEX;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Canonical `spatial.Point` (feet) → scene XZ. `Y` is the plane's second
 * axis and lands on scene Z; a missing or non-finite pair is named. */
function scenePointFromFeet(
  point: { x: number; y: number } | undefined,
  path: string,
  scale: number
): { x: number; z: number } {
  if (
    !point ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  ) {
    throw new Error(
      `structural layout: ${path} is missing finite canonical-foot coordinates`
    );
  }
  return { x: point.x * scale, z: point.y * scale };
}

function sceneFeet(
  value: number,
  path: string,
  scale: number,
  positive: boolean
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (positive && value <= 0)
  ) {
    throw new Error(
      `structural layout: ${path} must be a finite${positive ? ' positive' : ''} number of feet`
    );
  }
  return value * scale;
}

/** Convert one supplied wall record to the shared surface leaf's input. Throws
 * a NAMED error rather than defaulting a missing endpoint to the origin. */
export function structuralWallSurfaceFromAtlas(
  wall: AtlasStructuralWall,
  scale: number
): StructuralWallSurface {
  if (!wall.id) {
    throw new Error(
      'structural layout: a supplied wall must carry a nonempty id'
    );
  }
  const path = `wall ${wall.id}`;
  const start = scenePointFromFeet(wall.from, `${path}.from`, scale);
  const end = scenePointFromFeet(wall.to, `${path}.to`, scale);
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(
      `structural layout: ${path} endpoints must define a finite positive line`
    );
  }
  const height = sceneFeet(wall.height, `${path}.height`, scale, true);
  const thickness = sceneFeet(wall.thickness, `${path}.thickness`, scale, true);
  const elevation = sceneFeet(
    wall.elevation,
    `${path}.elevation`,
    scale,
    false
  );
  const openings: StructuralWallOpening[] = wall.openings.map(
    (opening, index) => {
      const at = `${path}.openings[${index}]`;
      if (!opening.id) {
        throw new Error(
          `structural layout: ${at} must carry a nonempty opening id`
        );
      }
      return {
        id: opening.id,
        position: sceneFeet(opening.position, `${at}.position`, scale, false),
        width: sceneFeet(opening.width, `${at}.width`, scale, true),
      };
    }
  );
  // Use the same opening bounds/overlap validation as the shared wall geometry.
  // This validates presentation data, not collision or disclosure policy.
  wallSolidIntervals({
    wall: { line: { start, end }, openings },
    extent: { start: 0, end: length },
  });
  return {
    id: wall.id,
    label: wall.ref || wall.id,
    line: { start, end },
    // The ref rides through verbatim; the shared leaf names a missing catalog
    // asset at the wall itself rather than this adapter inventing a model.
    appearance: { assetRef: wall.ref, height, thickness, elevation },
    openings,
  };
}

/** The runtime door adapter: resolve the visual pose from the record's own
 * endpoints and dimensions. There is no parent-wall identity or second pose. */
export function structuralDoorPoseFromAtlas(
  door: AtlasStructuralDoor,
  scale: number
): FittedDoorPose {
  if (!door.id) {
    throw new Error(
      'structural layout: a supplied door must carry a nonempty id'
    );
  }
  const path = `door ${door.id}`;
  const from = scenePointFromFeet(door.from, `${path}.from`, scale);
  const to = scenePointFromFeet(door.to, `${path}.to`, scale);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const width = Math.hypot(dx, dz);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(
      `structural layout: ${path} endpoints must define a nonzero opening width`
    );
  }
  return {
    point: { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 },
    // Three.js positive-Y rotation sends local +X toward world -Z; the same
    // `atan2(-dz, dx)` yaw convention every edge-aligned piece uses.
    rotationY: Math.atan2(-dz, dx),
    y: sceneFeet(door.elevation, `${path}.elevation`, scale, false),
    width,
    height: sceneFeet(door.height, `${path}.height`, scale, true),
    thickness: sceneFeet(door.thickness, `${path}.thickness`, scale, true),
  };
}

/** Validate a complete supplied layout before installing a snapshot or atomic
 * update. Canonical feet are retained (scale 1); no asset lookup, blocker or
 * visibility inference is involved. Rendering uses the same record adapters. */
export function assertStructuralLayoutIntegrity(input: {
  walls: readonly AtlasStructuralWall[];
  doors: readonly AtlasStructuralDoor[];
}): void {
  const walls = new Set<string>();
  const doors = new Set<string>();
  const openings = new Set<string>();
  for (const wall of input.walls) {
    if (walls.has(wall.id))
      throw new Error(`structural layout: duplicate wall ${wall.id}`);
    walls.add(wall.id);
    structuralWallSurfaceFromAtlas(wall, 1);
    for (const opening of wall.openings) {
      if (openings.has(opening.id))
        throw new Error(`structural layout: duplicate opening ${opening.id}`);
      openings.add(opening.id);
    }
  }
  for (const door of input.doors) {
    if (doors.has(door.id))
      throw new Error(`structural layout: duplicate door ${door.id}`);
    doors.add(door.id);
    structuralDoorPoseFromAtlas(door, 1);
  }
}

/** Convert every supplied record. A malformed record is REFUSED BY NAME into
 * `diagnostics` and contributes no geometry — never a mesh at the origin. */
export function structuralLayoutRender(
  walls: readonly AtlasStructuralWall[] | undefined,
  doors: readonly AtlasStructuralDoor[] | undefined,
  hexSize: number
): StructuralLayoutRender {
  const scale = sceneUnitsPerFoot(hexSize);
  const rendered: {
    walls: StructuralWallRenderUnit[];
    doors: StructuralDoorRenderUnit[];
    diagnostics: string[];
  } = { walls: [], doors: [], diagnostics: [] };
  for (const wall of walls ?? []) {
    try {
      rendered.walls.push({
        id: wall.id,
        surface: structuralWallSurfaceFromAtlas(wall, scale),
      });
    } catch (error) {
      rendered.diagnostics.push(reasonOf(error));
    }
  }
  for (const door of doors ?? []) {
    try {
      rendered.doors.push({
        id: door.id,
        assetRef: door.ref,
        pose: structuralDoorPoseFromAtlas(door, scale),
      });
    } catch (error) {
      rendered.diagnostics.push(reasonOf(error));
    }
  }
  return rendered;
}
