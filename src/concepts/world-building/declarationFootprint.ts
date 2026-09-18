/**
 * Seeding an authored movement/sight footprint from the mesh it describes.
 *
 * WHY THIS EXISTS. `blocksMovement` and `blocksLineOfSight` are the author's
 * explicit answers — the engine refuses to infer them from geometry
 * (`encounter.PlacedPropInput`: "Explicit, never inferred from the geometry").
 * But the BOX that answer applies to was a hard-coded 1×1, so declaring a wall
 * meant hand-tuning two sliders until the box matched the mesh, once per wall.
 * The builder already measures every placed prop, so the box can simply start
 * correct and stay the author's to override.
 *
 * WHAT IT DOES NOT DO. It never decides that something blocks. The flags are
 * passed through as the author set them; only the rectangle is seeded. That is
 * the difference between a convenience and the thing the engine forbids.
 *
 * UNITS. `PropModelBounds` is in world/scene units — the units the mesh is
 * rendered in and the units `RoomFootprint` is authored in. Both model loaders
 * report it that way (`PropModel` and `WorldAssetModel`), which is what makes a
 * single conversion-free mapping correct here.
 */
import type { PropModelBounds } from '@/components/hex-grid/PropModel';
import {
  FOOTPRINT_MAXIMUM_EXTENT,
  FOOTPRINT_MINIMUM_EXTENT,
  type RoomFootprint,
  type RoomPropDeclaration,
} from './roomDraft';

/** What an author got before this existed, and still gets when nothing has
 * been measured yet: a 1×1 box they must size by hand. Kept as the honest
 * fallback rather than a guess dressed up as a measurement. */
export const UNSEEDED_FOOTPRINT: RoomFootprint = Object.freeze({
  width: 1,
  depth: 1,
  offsetX: 0,
  offsetZ: 0,
});

/**
 * The authored rectangle for a measured mesh. Width and depth follow the
 * mesh's own local X/Z extents, because a `RoomFootprint` is owner-local and
 * rotates with its prop — so the intrinsic extents are exactly right whatever
 * the prop's authored yaw. Offsets stay zero: the box is centred on the prop's
 * origin, which is where the mesh's own bounds are centred.
 *
 * Extents are clamped to the range `roomDraft` validates. A seeded footprint
 * must never be refused by the rule it was built against, and a mesh thinner
 * than the minimum (a wall is thin) still needs a box the validator accepts.
 */
export function footprintFromMeasuredBounds(
  bounds: PropModelBounds | undefined
): RoomFootprint {
  if (!bounds) return { ...UNSEEDED_FOOTPRINT };
  return {
    width: seedExtent(bounds.width),
    depth: seedExtent(bounds.depth),
    offsetX: 0,
    offsetZ: 0,
  };
}

/**
 * One declaration per given prop, each seeded from ITS OWN mesh. Per-item
 * seeding is the whole point of a multi-selection: ten walls of three
 * different lengths must not share one box, which is exactly what a single
 * shared default would have given them.
 *
 * The flags are `false` — a fresh declaration asserts nothing until the author
 * says so. Callers that already carry authored flags spread them over this.
 */
export function seedDeclarations(
  ids: Iterable<string>,
  boundsFor: (id: string) => PropModelBounds | undefined
): Record<string, RoomPropDeclaration> {
  const declarations: Record<string, RoomPropDeclaration> = {};
  for (const id of ids) {
    declarations[id] = {
      blocksMovement: false,
      blocksLineOfSight: false,
      footprint: footprintFromMeasuredBounds(boundsFor(id)),
    };
  }
  return declarations;
}

function seedExtent(measured: number): number {
  // An unusable measurement is not a reason to refuse the author a box; it is
  // a reason to hand them the old default and let them size it.
  if (!Number.isFinite(measured) || measured <= 0) return 1;
  return Math.min(
    FOOTPRINT_MAXIMUM_EXTENT,
    Math.max(FOOTPRINT_MINIMUM_EXTENT, measured)
  );
}

/**
 * Write ONE declaration across every selected prop.
 *
 * This is the override path, not the seeding path: an author who ticks
 * "blocks movement" or drags the outline means it for everything they have
 * selected, so the values are applied exactly as given rather than re-seeded
 * per prop. Entries for props outside the selection are carried through
 * untouched — editing a selection must never quietly drop another prop's
 * blocker.
 */
export function declarationMapForSelection(
  existing: Record<string, RoomPropDeclaration>,
  ids: readonly string[],
  declaration: RoomPropDeclaration
): Record<string, RoomPropDeclaration> {
  const next = { ...existing };
  for (const id of ids) next[id] = declaration;
  return next;
}
