import {
  WORLD_BUILDING_CATALOG,
  WORLD_BUILDING_CATALOG_BY_REF,
  type WorldBuildingCatalogEntry,
} from './catalog';
import type { RoomDraft } from './roomDraft';
import { attachDoorToOpening } from './structuralDoorEditing';
import {
  addWallOpening,
  removeWallOpening,
  updateWallOpening,
  wallLength,
} from './structuralWallEditing';
import { wallSolidIntervals } from './structuralWallGeometry';
import type { StructuralWall, StructuralWallOpening } from './structuralWalls';
import type { WorldPoint } from './types';

export interface StudioDoorTarget {
  readonly kind: 'door';
  readonly wallId: string;
  readonly openingId: string;
  readonly doorId: string;
}
export interface StudioDoorAppearanceOption {
  readonly ref: string;
  readonly label: string;
  readonly width: number;
}
export type StudioDoorPreview =
  | {
      readonly valid: true;
      readonly purpose: 'placement' | 'move';
      readonly wall: StructuralWall;
      readonly target: StudioDoorTarget;
      readonly position: number;
      readonly width: number;
      readonly clamped: boolean;
    }
  | {
      readonly valid: false;
      readonly purpose: 'placement' | 'move';
      readonly wallId: string;
      readonly point: WorldPoint;
      readonly message: string;
    };
export interface StudioDoorEditing {
  readonly assetRef: string | null;
  readonly active: boolean;
  readonly options: readonly StudioDoorAppearanceOption[];
  readonly selectedTarget: StudioDoorTarget | null;
  readonly preview: StudioDoorPreview | null;
  setAsset(ref: string | null): boolean;
  setActive(active: boolean): boolean;
  select(target: StudioDoorTarget | null): boolean;
  previewPlacement(wallId: string, point: WorldPoint): boolean;
  create(wallId: string, point: WorldPoint): boolean;
  previewMove(target: StudioDoorTarget, position: number): boolean;
  move(target: StudioDoorTarget, position: number): boolean;
  cancelPreview(): void;
}

/** Narrow complete-assembly placement, not a rewrite of legacy leaf eligibility.
 * One explicit logical group only; never flatten a future compound asset. */
export function studioDoorAssetWidth(entry: WorldBuildingCatalogEntry): number {
  if (entry.source !== 'generated')
    throw new Error('Door placement requires a generated complete assembly.');
  const roles = entry.asset.roles ?? [];
  const leaves = roles.filter((role) => role.role === 'leaf');
  if (
    !roles.some((role) => role.role === 'frame') ||
    !leaves.length ||
    leaves.some((role) => !role.door?.trim()) ||
    new Set(leaves.map((role) => role.door)).size !== 1 ||
    roles.some((role) => !role.node.trim()) ||
    new Set(roles.map((role) => role.node)).size !== roles.length
  )
    throw new Error(
      'Door placement requires a declared frame and one explicit leaf group with unique nodes.'
    );
  if (
    !entry.asset.boundsMeters.every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    throw new Error('Door assembly dimensions must be finite and positive.');
  return entry.asset.boundsMeters[0];
}
export function studioDoorOptions(): StudioDoorAppearanceOption[] {
  return WORLD_BUILDING_CATALOG.flatMap((entry) => {
    try {
      return [
        {
          ref: entry.ref,
          label: entry.label,
          width: studioDoorAssetWidth(entry),
        },
      ];
    } catch {
      return [];
    }
  });
}
export function requireStudioDoor(
  draft: Readonly<RoomDraft>,
  target: StudioDoorTarget
): { wall: StructuralWall; opening: StructuralWallOpening } {
  const wall = draft.room.walls?.find((wall) => wall.id === target.wallId);
  const opening = wall?.openings.find(
    (opening) =>
      opening.id === target.openingId && opening.door?.id === target.doorId
  );
  if (!wall || !opening)
    throw new Error('Door target no longer exists on that wall.');
  return { wall, opening };
}
export function doorAlongWall(wall: StructuralWall, point: WorldPoint): number {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z))
    throw new Error('Door pointer must be finite.');
  const length = wallLength(wall);
  const direction = {
    x: (wall.line.end.x - wall.line.start.x) / length,
    z: (wall.line.end.z - wall.line.start.z) / length,
  };
  return (
    (point.x - wall.line.start.x) * direction.x +
    (point.z - wall.line.start.z) * direction.z
  );
}
export function clampDoorPosition(
  wall: StructuralWall,
  position: number,
  width: number
): { position: number; clamped: boolean } {
  if (!Number.isFinite(position) || !Number.isFinite(width) || width <= 0)
    throw new Error('Door position/width must be finite and width positive.');
  const length = wallLength(wall);
  if (width > length)
    throw new Error('Wall is too short for the chosen door width.');
  const next = Math.max(width / 2, Math.min(length - width / 2, position));
  return { position: next, clamped: next !== position };
}
function assertDoorGeometry(wall: StructuralWall): void {
  wallSolidIntervals({ wall, extent: { start: 0, end: wallLength(wall) } });
}
export function createStudioDoor(
  wall: StructuralWall,
  input: {
    openingId: string;
    doorId: string;
    assetRef: string;
    position: number;
  }
): StructuralWall {
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(input.assetRef);
  if (!entry) throw new Error('Unknown complete door appearance.');
  const width = studioDoorAssetWidth(entry);
  const next = attachDoorToOpening(
    addWallOpening(wall, {
      id: input.openingId,
      position: input.position,
      width,
    }),
    {
      openingId: input.openingId,
      doorId: input.doorId,
      assetRef: input.assetRef,
    }
  );
  assertDoorGeometry(next);
  return next;
}
export function editStudioDoor(
  wall: StructuralWall,
  target: StudioDoorTarget,
  input: { position?: number; width?: number }
): StructuralWall {
  const opening = wall.openings.find(
    (opening) =>
      wall.id === target.wallId &&
      opening.id === target.openingId &&
      opening.door?.id === target.doorId
  );
  if (!opening) throw new Error('Door target no longer exists.');
  const position = input.position ?? opening.position;
  const width = input.width ?? opening.width;
  if (!Number.isFinite(position) || !Number.isFinite(width) || width <= 0)
    throw new Error('Door position/width must be finite and width positive.');
  if (position === opening.position && width === opening.width) return wall;
  const next = updateWallOpening(wall, opening.id, { position, width });
  assertDoorGeometry(next);
  return next;
}
export function removeStudioDoor(
  wall: StructuralWall,
  target: StudioDoorTarget
): StructuralWall {
  if (
    !wall.openings.some(
      (opening) =>
        wall.id === target.wallId &&
        opening.id === target.openingId &&
        opening.door?.id === target.doorId
    )
  )
    throw new Error('Door target no longer exists.');
  return removeWallOpening(wall, target.openingId);
}
/** Collision-free local preview identities; never written or reserved in data. */
export function doorPreviewIds(wall: StructuralWall): {
  openingId: string;
  doorId: string;
} {
  const used = new Set([
    wall.id,
    ...wall.openings.flatMap((o) => [o.id, ...(o.door ? [o.door.id] : [])]),
  ]);
  const fresh = (base: string): string => {
    let id = base;
    while (used.has(id)) id += '-';
    used.add(id);
    return id;
  };
  return { openingId: fresh('preview-opening'), doorId: fresh('preview-door') };
}
