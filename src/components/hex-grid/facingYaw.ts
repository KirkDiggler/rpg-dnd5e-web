/**
 * facingYaw — the ONE place a placed prop's authored `facing` word
 * becomes a render angle (rpg-project#261 design, "Angle math is
 * measured, not inferred"; vocabulary redefined by rpg-project#272).
 * Consumed by the builder's Inspector/2D canvas AND the 3D renderer
 * (`DungeonPreview3D`'s prop path and the game route's
 * `SessionCanvas`/`atlasToScene3D`) so the two can never disagree about
 * which way a facing points — the same symmetric-bug discipline
 * `hexOffset.ts` names (rpg-toolkit#1150).
 *
 * THE VOCABULARY IS TRUE COMPASS AND ORIENTATION-INDEPENDENT
 * (rpg-project#272, Kirk's ruling: "positioning directions not
 * following the hex... each position should be all 8 positions"). #261
 * gave each hex orientation its own six-name set drawn from that
 * orientation's edge directions; walls have rendered axis-true since
 * rpg-toolkit#802, and a statue must be able to stand squarely against
 * a horizontal wall in a pointy-top dungeon whose hex EDGES have no
 * "n". Compass directions live in world space, so ONE eight-name table
 * serves both orientations — the per-orientation tables this module
 * used to carry are deliberately gone, and the four diagonal names
 * changed meaning with them (pointy `ne` pointed at the 30° hex edge;
 * compass `ne` is 45°). The reference tomb authors no facings (#261's
 * golden pins the zero values), so no shipped content moves.
 *
 * Two independent things live here:
 *
 * 1. `FACING_ANGLE_DEG` (private) / `facingAngleDeg` (public) — pure
 *    world GEOMETRY: the table angle (degrees, atan2(z, x) convention
 *    over `hexCenter`/`cubeToWorld`'s own (x, y≡z) axes — table-angle 0
 *    = +X = east, 90 = +Z = south) each compass name points to. Eight
 *    names, 45° apart, no hex involved at all.
 *
 * 2. `FACING_YAW_OFFSET` — the ONE calibrated constant that turns a
 *    table-angle into an actual `PropModel` `rotationY`. This is NOT
 *    derivable on paper (the character-facing lesson, rpg-project#124):
 *    measured 2026-08-24 by rendering `dnd5e:props:statue-reaper` (an
 *    asymmetric prop — folded hands + visible hood read as its front,
 *    wings-only reads as its back) at `rotationY = 0` from four
 *    straight elevations. The front reads clearly from the +Z
 *    elevation and the back from -Z, so the model's own forward axis
 *    points to table-angle 90° unrotated. Evidence:
 *    docs/evidence/prop-facing-calibration-elevations.png (the
 *    measurement) and docs/evidence/prop-facing-calibration-confirm.png
 *    (the six-facing confirmation), linked from the rpg-project#261 PR.
 *    The compass redefinition changes WHICH angles the words name, not
 *    the model-forward-axis fact this constant measures, so the
 *    constant carries over; the eight-name confirmation screenshots are
 *    re-taken for rpg-project#272's PR.
 *
 * `facingToYaw` composes the two: a table-angle becomes a `rotationY`
 * via the SAME outward-facing convention `hexEdgeBetween`/
 * `wallRunAdapters.ts` already use for wall pieces — "a Y rotation by θ
 * sends local +X to world (cosθ, 0, -sinθ)", i.e.
 * `rotationY = atan2(-dz, dx)` — which, since (dx, dz) here is exactly
 * (cos deg, sin deg), reduces to `-deg` — plus the calibrated offset.
 *
 * An absent or unrecognized name yields `rotationY = 0`: the asset's
 * own default orientation, exactly today's rendering, never touched by
 * the offset.
 */

const DEG = Math.PI / 180;

/** Measured 2026-08-24 against `dnd5e:props:statue-reaper` — see this
 * module's own doc comment for the calibration procedure and evidence. */
export const FACING_YAW_OFFSET = Math.PI / 2;

/**
 * The eight valid facing names — ONE set, valid under BOTH hex
 * orientations (rpg-project#272). Listed in rose order starting at
 * north so a UI that renders them in sequence draws a compass.
 */
export const FACING_NAMES: readonly string[] = [
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'nw',
];

export function isValidFacing(name: string): boolean {
  return FACING_NAMES.includes(name);
}

/** Pure world geometry — see this module's doc comment, part 1. True
 * compass at 45° steps in the (x, z) table-angle convention: east is
 * 0 (+X), south is 90 (+Z, screen-down), north is -90. */
const FACING_ANGLE_DEG: Record<string, number> = {
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 180,
  nw: -135,
  n: -90,
  ne: -45,
};

/** The world table-angle (degrees) `name` points to, or `undefined` if
 * it is not one of the eight compass names. Used for 2D layout (the
 * Inspector's rose, the canvas tick) — the geometry half only, with no
 * asset calibration applied.
 *
 * `Object.hasOwn` guarded, not a bare index: `facing` is an untrusted
 * string all the way from the wire/a hand-edited YAML file (this
 * module's own light-validation law), and a bare
 * `FACING_ANGLE_DEG[name]` returns an inherited `Object.prototype`
 * member — a function, not `undefined` — for a name like
 * `"constructor"`, which would go on to produce a NaN yaw instead of
 * the documented 0 (Copilot review, PR #795). */
export function facingAngleDeg(name: string): number | undefined {
  return Object.hasOwn(FACING_ANGLE_DEG, name)
    ? FACING_ANGLE_DEG[name]
    : undefined;
}

/**
 * The authored `facing` word → a `PropModel` `rotationY`, in radians.
 * `''` or any name outside the compass yields 0 — the asset's own
 * default orientation. Routes through `facingAngleDeg` rather than
 * re-indexing the table directly, so there is exactly one own-key guard
 * to get right, not two.
 */
export function facingToYaw(facing: string): number {
  const deg = facingAngleDeg(facing);
  if (deg === undefined) return 0;
  return -deg * DEG + FACING_YAW_OFFSET;
}
