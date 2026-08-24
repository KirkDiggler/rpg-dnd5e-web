/**
 * facingYaw — the ONE place a placed prop's authored `facing` word
 * becomes a render angle (rpg-project#261 design, "Angle math is
 * measured, not inferred"). Consumed by the builder's Inspector/2D
 * canvas AND the 3D renderer (`DungeonPreview3D`'s prop path and the
 * game route's `SessionCanvas`/`atlasToScene3D`) so the two can never
 * disagree about which way a facing points — the same symmetric-bug
 * discipline `hexOffset.ts` names (rpg-toolkit#1150).
 *
 * Two independent things live here:
 *
 * 1. `FACING_ANGLE_DEG` (private) / `facingAngleDeg` (public) — pure hex
 *    GEOMETRY: the world "table angle" (degrees, atan2(z, x) convention
 *    over `hexCenter`/`cubeToWorld`'s own (x, y≡z) axes — table-angle 0
 *    = +X, 90 = +Z) that each orientation's six named neighbor
 *    directions actually point to. Derived from `hexCenter`'s own
 *    neighbor-offset formula and pinned against it independently in
 *    `facingYaw.test.ts` (a pixel formula, not a round-trip — the
 *    discriminator `hexOffset.ts`'s own doc comment calls for). No
 *    asset is involved in this half.
 *
 * 2. `FACING_YAW_OFFSET` — the ONE calibrated constant that turns a
 *    table-angle into an actual `PropModel` `rotationY`. This is NOT
 *    derivable on paper (the character-facing lesson, rpg-project#124):
 *    measured 2026-08-24 by rendering `dnd5e:props:statue-reaper` (an
 *    asymmetric prop — folded hands + visible hood read as its front,
 *    wings-only reads as its back) at `rotationY = 0` from four
 *    straight elevations. The front reads clearly from the +Z
 *    elevation and the back from -Z, so the model's own forward axis
 *    points to table-angle 90° unrotated — confirmed by then rendering
 *    all six pointy facings and checking each one reads as that SAME
 *    front silhouette. Evidence:
 *    docs/evidence/prop-facing-calibration-elevations.png (the
 *    measurement) and docs/evidence/prop-facing-calibration-confirm.png
 *    (the six-facing confirmation), linked from the rpg-project#261 PR.
 *
 * `facingToYaw` composes the two: a table-angle becomes a `rotationY`
 * via the SAME outward-facing convention `hexEdgeBetween`/
 * `wallRunAdapters.ts` already use for wall pieces — "a Y rotation by θ
 * sends local +X to world (cosθ, 0, -sinθ)", i.e.
 * `rotationY = atan2(-dz, dx)` — which, since (dx, dz) here is exactly
 * (cos deg, sin deg), reduces to `-deg` — plus the calibrated offset.
 *
 * An absent or unrecognized name yields `rotationY = 0`: the asset's
 * own default orientation, exactly today's (pre-#261) rendering, never
 * touched by the offset.
 */
import type { HexLayout } from '@/concepts/session-tomb/atlas';

export type Orientation = HexLayout;

const DEG = Math.PI / 180;

/** Measured 2026-08-24 against `dnd5e:props:statue-reaper` — see this
 * module's own doc comment for the calibration procedure and evidence. */
export const FACING_YAW_OFFSET = Math.PI / 2;

/**
 * The six valid facing names per orientation (design §"The file"):
 * pointy-top ROWS run straight, so same-row neighbors sit due
 * east/west — e|w are valid, n|s are not. Flat-top COLUMNS run
 * straight, so same-column neighbors sit due north/south — n|s are
 * valid, e|w are not.
 */
export const FACING_NAMES: Record<Orientation, readonly string[]> = {
  pointy: ['e', 'se', 'sw', 'w', 'nw', 'ne'],
  flat: ['se', 'ne', 'n', 'nw', 'sw', 's'],
};

export function isValidFacing(orientation: Orientation, name: string): boolean {
  return FACING_NAMES[orientation].includes(name);
}

/** Pure hex geometry — see this module's doc comment, part 1. Derived
 * from `hexCenter`'s own neighbor-offset formula; `facingYaw.test.ts`
 * pins every value against that formula independently. */
const FACING_ANGLE_DEG: Record<Orientation, Record<string, number>> = {
  pointy: { e: 0, se: 60, sw: 120, w: 180, nw: -120, ne: -60 },
  flat: { se: 30, ne: -30, n: -90, nw: -150, sw: 150, s: 90 },
};

/** The world table-angle (degrees) `name` points to under `orientation`,
 * or `undefined` if it is not one of that orientation's six names.
 * Used for 2D layout (the Inspector's compass, the canvas tick) — the
 * geometry half only, with no asset calibration applied.
 *
 * `Object.hasOwn` guarded, not a bare index: `facing` is an untrusted
 * string all the way from the wire/a hand-edited YAML file (this
 * module's own light-validation law), and a bare `FACING_ANGLE_DEG[o]
 * [name]` returns an inherited `Object.prototype` member — a function,
 * not `undefined` — for a name like `"constructor"`, which would go on
 * to produce a NaN yaw instead of the documented 0 (Copilot review,
 * PR #795). */
export function facingAngleDeg(
  orientation: Orientation,
  name: string
): number | undefined {
  const table = FACING_ANGLE_DEG[orientation];
  return Object.hasOwn(table, name) ? table[name] : undefined;
}

/**
 * The authored `facing` word → a `PropModel` `rotationY`, in radians.
 * `''` or any name not valid under `orientation` yields 0 — the asset's
 * own default orientation. Routes through `facingAngleDeg` rather than
 * re-indexing the table directly, so there is exactly one own-key guard
 * to get right, not two.
 */
export function facingToYaw(orientation: Orientation, facing: string): number {
  const deg = facingAngleDeg(orientation, facing);
  if (deg === undefined) return 0;
  return -deg * DEG + FACING_YAW_OFFSET;
}
