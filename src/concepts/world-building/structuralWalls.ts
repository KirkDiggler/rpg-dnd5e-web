import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import { isDoorAsset } from './doorBindingEdits';
import { validateMaterialOverrides } from './materialOverrides';
import type { RoomPropDeclaration } from './roomDraft';
import { carryUnknownKeys, objectShape } from './strictShape';
import {
  wallSolidIntervals,
  type WallGeometry,
  type WallOpeningGeometry,
} from './structuralWallGeometry';
import type { WorldPoint } from './types';

/** The wall keys this codec reads; any other is carried (rpg-project#857). */
const WALL_KEYS = ['id', 'label', 'line', 'appearance', 'blocker', 'openings'];
const APPEARANCE_KEYS = [
  'assetRef',
  'height',
  'thickness',
  'elevation',
  'materialOverrides',
];
const BLOCKER_KEYS = ['footprint', 'blocksMovement', 'blocksLineOfSight'];
const FOOTPRINT_KEYS = ['width', 'depth', 'offsetX', 'offsetZ'];

/** One opening's optional attached door: a stable identity and a catalog
 * appearance. THERE IS NO STORED POSE — the owning opening resolves the
 * placement — and no `scene.items` entry. A bound door's state lives ONLY at
 * the existing `room.doorBindings[door.id]` with its unchanged grammar.
 *
 * ABSENCE IS A BARE OPENING, not a hidden or open door. A present `door`
 * requires a matching `doorBindings` entry (`{}` means initially open). */
export interface StructuralWallOpening extends WallOpeningGeometry {
  door?: { id: string; assetRef: string };
}

/** One authored wall, not an inventory of repeated visual or blocking pieces. */
export interface StructuralWall extends WallGeometry {
  id: string;
  label: string;
  /** Covariant override of `WallGeometry.openings`: a wall's openings may
   * carry an attached-door record, and every editor helper must preserve it. */
  openings: readonly StructuralWallOpening[];
  appearance: {
    materialOverrides?: import('@/rendering/worldMaterialTypes').MaterialOverride[];
    assetRef: string;
    height: number;
    thickness: number;
    elevation: number;
  };
  /** Owner-local rectangle about the wall midpoint: +X along start→end,
   * +Z perpendicular in the XZ plane. Extent and offsets are independent
   * of the appearance and use scene units, just like prop declarations. */
  blocker: RoomPropDeclaration;
}

/** The minimal wall a SHARED visual helper needs: identity, label, line,
 * appearance, and openings that may carry an attached-door record. The authored
 * `blocker` is deliberately absent — a renderer's picture must never require a
 * fabricated declaration just to satisfy a type. The editor's full
 * `StructuralWall` is assignable. This type supplies no gameplay visibility
 * or player-content permission answer. */
export type StructuralWallSurface = Pick<
  StructuralWall,
  'id' | 'label' | 'line' | 'openings' | 'appearance'
>;

function numberAt(value: unknown, path: string, positive = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (positive && value <= 0)
  ) {
    throw new Error(
      `${path}: must be a finite${positive ? ' positive' : ''} number`
    );
  }
  return value;
}

function stringAt(value: unknown, path: string, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && value.trim().length === 0)) {
    throw new Error(`${path}: must be a${nonempty ? ' nonempty' : ''} string`);
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path}: must be a boolean`);
  return value;
}

function pointAt(
  value: unknown,
  path: string,
  horizontalLimit: number
): WorldPoint {
  const point = objectShape(value, path);
  const x = numberAt(point.x, `${path}.x`);
  const z = numberAt(point.z, `${path}.z`);
  for (const [axis, coordinate] of [
    ['x', x],
    ['z', z],
  ] as const) {
    if (Math.abs(coordinate) > horizontalLimit)
      throw new Error(
        `${path}.${axis}: beyond the world coordinate bound (±${horizontalLimit})`
      );
  }
  return carryUnknownKeys(point, ['x', 'z'], { x, z });
}

/** Strict document parsing, not gameplay validation. Returns independent values;
 * rejects unsupported fields so imported authored data is never silently lost.
 * Existing prop dimension clamps intentionally do not apply to wall rectangles.
 */
export function validateStructuralWalls(input: {
  value: unknown;
  horizontalLimit: number;
  itemIds: ReadonlySet<string>;
}): StructuralWall[] {
  const path = 'room.room.walls';
  numberAt(input.horizontalLimit, `${path}: world coordinate bound`, true);
  if (!Array.isArray(input.value)) throw new Error(`${path}: must be an array`);
  const identities = new Set(input.itemIds);
  const claim = (value: unknown, location: string): string => {
    const id = stringAt(value, location, true);
    if (identities.has(id))
      throw new Error(`${location}: duplicate or colliding id ${id}`);
    identities.add(id);
    return id;
  };
  // Reserve all wall identities before reading openings, so ordering cannot
  // hide an opening whose ID collides with a later wall.
  const rows = input.value.map((value, index) => {
    const location = `${path}[${index}]`;
    const row = objectShape(value, location);
    return { row, location, id: claim(row.id, `${location}.id`) };
  });
  return rows.map(({ row, location, id }) => {
    const line = objectShape(row.line, `${location}.line`);
    const appearance = objectShape(row.appearance, `${location}.appearance`);
    const assetRef = stringAt(
      appearance.assetRef,
      `${location}.appearance.assetRef`,
      true
    );
    if (!WORLD_BUILDING_CATALOG_BY_REF.has(assetRef))
      throw new Error(
        `${location}.appearance.assetRef: unknown catalog asset ${assetRef}`
      );
    const blocker = objectShape(row.blocker, `${location}.blocker`);
    const footprint = objectShape(
      blocker.footprint,
      `${location}.blocker.footprint`
    );
    const footprintPath = `${location}.blocker.footprint`;
    if (!Array.isArray(row.openings))
      throw new Error(`${location}.openings: must be an array`);
    const openings: StructuralWallOpening[] = row.openings.map(
      (value, index) => {
        const at = `${location}.openings[${index}]`;
        const opening = objectShape(value, at);
        let door: StructuralWallOpening['door'];
        if (Object.hasOwn(opening, 'door')) {
          const doorShape = objectShape(opening.door, `${at}.door`);
          const doorId = claim(doorShape.id, `${at}.door.id`);
          const doorAssetRef = stringAt(
            doorShape.assetRef,
            `${at}.door.assetRef`,
            true
          );
          if (
            !WORLD_BUILDING_CATALOG_BY_REF.has(doorAssetRef) ||
            !isDoorAsset(doorAssetRef)
          )
            throw new Error(
              `${at}.door.assetRef: unknown door asset ${doorAssetRef}`
            );
          door = carryUnknownKeys(doorShape, ['id', 'assetRef'], {
            id: doorId,
            assetRef: doorAssetRef,
          });
        }
        return carryUnknownKeys(opening, ['id', 'position', 'width', 'door'], {
          id: claim(opening.id, `${at}.id`),
          position: numberAt(opening.position, `${at}.position`),
          width: numberAt(opening.width, `${at}.width`, true),
          ...(door ? { door } : {}),
        });
      }
    );
    const wall: StructuralWall = carryUnknownKeys(row, WALL_KEYS, {
      id,
      label: stringAt(row.label, `${location}.label`),
      line: carryUnknownKeys(line, ['start', 'end'], {
        start: pointAt(
          line.start,
          `${location}.line.start`,
          input.horizontalLimit
        ),
        end: pointAt(line.end, `${location}.line.end`, input.horizontalLimit),
      }),
      appearance: carryUnknownKeys(appearance, APPEARANCE_KEYS, {
        assetRef,
        ...(appearance.materialOverrides === undefined
          ? {}
          : {
              materialOverrides: validateMaterialOverrides(
                appearance.materialOverrides,
                `${location}.appearance.materialOverrides`
              ),
            }),
        height: numberAt(
          appearance.height,
          `${location}.appearance.height`,
          true
        ),
        thickness: numberAt(
          appearance.thickness,
          `${location}.appearance.thickness`,
          true
        ),
        elevation: numberAt(
          appearance.elevation,
          `${location}.appearance.elevation`
        ),
      }),
      blocker: carryUnknownKeys(blocker, BLOCKER_KEYS, {
        blocksMovement: booleanAt(
          blocker.blocksMovement,
          `${location}.blocker.blocksMovement`
        ),
        blocksLineOfSight: booleanAt(
          blocker.blocksLineOfSight,
          `${location}.blocker.blocksLineOfSight`
        ),
        footprint: carryUnknownKeys(footprint, FOOTPRINT_KEYS, {
          width: numberAt(footprint.width, `${footprintPath}.width`, true),
          depth: numberAt(footprint.depth, `${footprintPath}.depth`, true),
          offsetX: numberAt(footprint.offsetX, `${footprintPath}.offsetX`),
          offsetZ: numberAt(footprint.offsetZ, `${footprintPath}.offsetZ`),
        }),
      }),
      openings,
    });
    // Refuse representational overflow before this reaches a renderer/compiler.
    const box = wall.blocker.footprint;
    numberAt(
      Math.abs(box.offsetX) +
        box.width / 2 +
        Math.abs(box.offsetZ) +
        box.depth / 2 +
        2 * input.horizontalLimit,
      `${footprintPath}: extent`
    );
    numberAt(
      Math.abs(wall.appearance.elevation) + wall.appearance.height,
      `${location}.appearance: extent`
    );
    try {
      const length = Math.hypot(
        wall.line.end.x - wall.line.start.x,
        wall.line.end.z - wall.line.start.z
      );
      wallSolidIntervals({ wall, extent: { start: 0, end: length } });
    } catch (error) {
      throw new Error(
        `${location}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return wall;
  });
}
