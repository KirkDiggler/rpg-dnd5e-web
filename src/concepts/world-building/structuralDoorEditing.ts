/**
 * Pure editor helpers for attaching a door to a wall opening (Task 5).
 *
 * AN OPENING OWNS ITS DOOR'S POSE. The door record stores only identity and
 * catalog appearance; the owning opening resolves the single placement for
 * editor preview, YAML compilation and runtime rendering alike. There is never
 * a second stored transform and never a `scene.items` duplicate.
 *
 * These helpers move an opening's `door` record and the matching
 * `room.doorBindings` entry TOGETHER, atomically, and leave their inputs
 * untouched. State itself is not a grammar invented here: the caller composes
 * the existing `doorBindingEdits` helpers and the existing open/closed/locked
 * controls. Geometry helpers in `structuralWallEditing`/`structuralWallGeometry`
 * are responsible for preserving attachment metadata across edits.
 */
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import { isDoorAsset } from './doorBindingEdits';
import { wallDirectionYaw } from './structuralWallEditing';
import { wallOpeningPoint } from './structuralWallGeometry';
import type {
  StructuralWall,
  StructuralWallOpening,
  StructuralWallSurface,
} from './structuralWalls';
import type { WorldPoint } from './types';

function fail(message: string): never {
  throw new Error(`Structural door edit: ${message}`);
}

function finitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0)
    fail(`${name} must be a finite positive number.`);
}

/** Whether a catalog ref is a door candidate: a known catalog entry whose
 * generated asset declares a `leaf`. Ordinary, non-leaf and unknown imported
 * refs are never offered as doors, and never silently fall back to one. */
export function isAttachableDoorAsset(assetRef: string): boolean {
  return WORLD_BUILDING_CATALOG_BY_REF.has(assetRef) && isDoorAsset(assetRef);
}

/** The catalog refs the door picker may offer today, in stable catalog order. */
export function attachableDoorAssetRefs(): string[] {
  return [...WORLD_BUILDING_CATALOG_BY_REF.values()]
    .filter((entry) => isAttachableDoorAsset(entry.ref))
    .map((entry) => entry.ref);
}

/** Every door id an authored wall owns, in opening order. */
export function wallBoundDoorIds(wall: StructuralWall): string[] {
  return wall.openings.flatMap((opening) =>
    opening.door ? [opening.door.id] : []
  );
}

/** The door id attached to one opening, or null for a bare opening. */
export function openingDoorId(
  wall: StructuralWall,
  openingId: string
): string | null {
  const opening = wall.openings.find((entry) => entry.id === openingId);
  return opening?.door?.id ?? null;
}

function requireOpening(
  wall: StructuralWallSurface,
  openingId: string
): StructuralWallOpening {
  const opening = wall.openings.find((entry) => entry.id === openingId);
  if (!opening) fail(`unknown opening ${openingId}.`);
  return opening;
}

function cloneOpening(opening: StructuralWallOpening): StructuralWallOpening {
  return { ...opening, ...(opening.door ? { door: { ...opening.door } } : {}) };
}

function claimDoorIdentity(
  wall: StructuralWall,
  openingId: string,
  doorId: string
): void {
  if (doorId.trim().length === 0) fail('a door id must be nonempty.');
  const taken = new Set<string>([wall.id, ...wall.openings.map((o) => o.id)]);
  for (const bound of wallBoundDoorIds(wall)) taken.add(bound);
  // The door being replaced/attached is allowed to keep its own id.
  taken.delete(openingDoorId(wall, openingId) ?? '');
  if (taken.has(doorId)) fail(`door id ${doorId} is already used.`);
}

/** Attach a freshly minted door to a bare opening. The caller mints `doorId`
 * with the existing id factory and writes the closed binding in the same
 * transaction; this helper only moves the opening record. */
export function attachDoorToOpening(
  wall: StructuralWall,
  input: { openingId: string; doorId: string; assetRef: string }
): StructuralWall {
  const opening = requireOpening(wall, input.openingId);
  if (opening.door) fail(`opening ${input.openingId} already has a door.`);
  claimDoorIdentity(wall, input.openingId, input.doorId);
  if (!isAttachableDoorAsset(input.assetRef))
    fail(`unknown door asset ${input.assetRef}.`);
  const next = structuredClone(wall);
  next.openings = next.openings.map((entry) =>
    entry.id === input.openingId
      ? {
          ...entry,
          door: { id: input.doorId, assetRef: input.assetRef },
        }
      : cloneOpening(entry)
  );
  return next;
}

/** Swap the attached door's appearance, retaining its id and its authored
 * state (the state lives at `doorBindings[door.id]` and is untouched here). */
export function swapOpeningDoorAsset(
  wall: StructuralWall,
  input: { openingId: string; assetRef: string }
): StructuralWall {
  const opening = requireOpening(wall, input.openingId);
  if (!opening.door) fail(`opening ${input.openingId} has no door.`);
  if (!isAttachableDoorAsset(input.assetRef))
    fail(`unknown door asset ${input.assetRef}.`);
  const next = structuredClone(wall);
  next.openings = next.openings.map((entry) =>
    entry.id === input.openingId && entry.door
      ? { ...entry, door: { id: entry.door.id, assetRef: input.assetRef } }
      : cloneOpening(entry)
  );
  return next;
}

/** Remove the attached door record while keeping the opening (the gap stays).
 * The caller deletes `doorBindings[door.id]` in the same transaction. */
export function removeDoorFromOpening(
  wall: StructuralWall,
  openingId: string
): StructuralWall {
  const opening = requireOpening(wall, openingId);
  if (!opening.door) fail(`opening ${openingId} has no door.`);
  const next = structuredClone(wall);
  next.openings = next.openings.map((entry) => {
    if (entry.id !== openingId) return cloneOpening(entry);
    const bare: StructuralWallOpening = {
      id: entry.id,
      position: entry.position,
      width: entry.width,
    };
    return bare;
  });
  return next;
}

/** One attached door's resolved placement. Every consumer derives it from the
 * opening; nothing here is written back into the document. */
export interface AttachedDoorPlacement {
  /** Opening center in world XZ. */
  point: WorldPoint;
  /** Wall direction yaw, the shared `atan2(-dz, dx)` convention. */
  rotationY: number;
  /** Authored elevation, BEFORE the shared leaf's single floor lift. */
  y: number;
  widthScale: number;
  heightScale: number;
  depthScale: number;
  /** Authored INITIAL state preview — not a live engine operation. */
  open: boolean;
}

/**
 * Fit the full existing door assembly to the opening width and the wall's
 * authored appearance height and thickness, using the same structural-parent
 * scale technique the wall pieces use. The parent owns the exact fit; the
 * shared leaf is passed `heightScale: 1` so its floor lift stays unscaled and
 * its own leaf animation is preserved.
 */
export function attachedDoorPlacement(input: {
  wall: StructuralWallSurface;
  openingId: string;
  assetWidthMeters: number;
  assetHeightMeters: number;
  assetDepthMeters: number;
  open: boolean;
}): AttachedDoorPlacement {
  const opening = requireOpening(input.wall, input.openingId);
  if (!opening.door) fail(`opening ${input.openingId} has no door.`);
  finitePositive(input.assetWidthMeters, 'assetWidthMeters');
  finitePositive(input.assetHeightMeters, 'assetHeightMeters');
  finitePositive(input.assetDepthMeters, 'assetDepthMeters');
  finitePositive(opening.width, `opening ${input.openingId} width`);
  finitePositive(input.wall.appearance.height, 'appearance.height');
  finitePositive(input.wall.appearance.thickness, 'appearance.thickness');
  if (!Number.isFinite(input.wall.appearance.elevation))
    fail('appearance.elevation must be finite.');
  const point = wallOpeningPoint({
    wall: input.wall,
    openingId: input.openingId,
  });
  return {
    point,
    rotationY: wallDirectionYaw(input.wall),
    y: input.wall.appearance.elevation,
    // Catalog bounds already include the shared model scale. Fit against the
    // rendered dimensions, not another 0.75-scaled copy of those dimensions.
    widthScale: opening.width / input.assetWidthMeters,
    heightScale: input.wall.appearance.height / input.assetHeightMeters,
    depthScale: input.wall.appearance.thickness / input.assetDepthMeters,
    open: input.open,
  };
}
