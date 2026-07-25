/**
 * Pure heading math for character facing (rpg-dnd5e-web#590).
 *
 * No `@react-three/fiber` imports, deliberately — same reasoning as
 * `useHexMovePath.ts`'s `computeMoveStart`/`advanceFrame` split: it lets
 * `facing.test.ts` exercise every rule here directly, with no WebGL canvas
 * and no R3F test renderer.
 *
 * Convention: a "heading" is a world-space Y rotation in radians, in the
 * Three.js sense — an Object3D at `rotation.y = t` maps its local +Z to world
 * `(sin t, 0, cos t)`. `headingFromDelta` is that function's exact inverse. A
 * rig whose forward axis is NOT +Z needs a per-model offset composed on top;
 * that offset is a property of the asset and is kept as a separate term (see
 * the forward-offset constants below), never folded in here.
 */

/**
 * World heading for a world-space direction, or `undefined` if the delta has
 * no direction at all.
 *
 * The `undefined` return is load-bearing, not defensive: `useHexMovePath`
 * deliberately supports a degenerate single-point path (rpg-api#656's same-hex
 * "move"), whose segment delta is exactly zero. `Math.atan2(0, 0)` returns 0,
 * which would snap the character to due north for a move that never went
 * anywhere. `undefined` means "no opinion" and lets the caller hold whatever
 * heading it already had.
 */
export function headingFromDelta(dx: number, dz: number): number | undefined {
  if (dx === 0 && dz === 0) return undefined;
  return Math.atan2(dx, dz);
}

const TWO_PI = Math.PI * 2;

/**
 * Signed turn from `from` to `to`, wrapped to (-PI, PI] — i.e. always the short
 * way round. Without this, walking from a heading of 350 degrees to one of 10
 * degrees would spin 340 degrees the wrong way.
 *
 * The two comparisons are ordered so an exact 180-degree reversal always
 * resolves to +PI regardless of the input's sign. A full reversal (walk east,
 * then west) is a common real path that sits exactly on the boundary where both
 * directions are equally short; leaving it to floating-point sign would make
 * the turn direction differ run to run for no reason.
 */
export function shortestTurn(from: number, to: number): number {
  let d = (to - from) % TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  return d;
}

/**
 * Seconds-to-radians turn rate. Tuned against the hex geometry rather than by
 * eye: the six hex neighbours are exactly 60 degrees apart under `cubeToWorld`,
 * so an ordinary between-hex turn is 1.047 rad (~0.13s here) and a full
 * 180-degree reversal is 0.393s — both inside one `SECONDS_PER_HEX_STEP`
 * (0.45s), so a character finishes turning before it finishes the step it is
 * turning for.
 *
 * Playtest-tuning knob, exactly like `SECONDS_PER_HEX_STEP` is.
 */
export const TURN_RATE_RAD_PER_SEC = 8;

/**
 * Advance `current` toward `target` by at most `turnRate * delta`, never
 * overshooting. Returns `target` itself (===, not approximately) once within
 * one step, because `useEntityFacing` stops its invalidate loop on an exact
 * equality check.
 *
 * That exact-equality settle condition is why the zero-turn branch returns
 * `target` rather than `current` (Copilot review on #592). The two are usually
 * the same value, but not always: `shortestTurn` is 0 for any pair that differs
 * by exactly 2*PI, and those point the same way while comparing unequal.
 * Returning `current` there would leave `currentRef !== targetRef` forever and
 * invalidate every frame in perpetuity under `frameloop="demand"` — precisely
 * the cost `useEntityFacing` is built to avoid. `current` can legitimately
 * leave (-PI, PI] mid-turn, since the accumulate branch below does not
 * normalise, so co-terminal pairs are reachable rather than hypothetical.
 */
export function easeHeading(
  current: number,
  target: number,
  delta: number,
  turnRate: number = TURN_RATE_RAD_PER_SEC
): number {
  const turn = shortestTurn(current, target);
  if (turn === 0) return target;
  const maxStep = turnRate * delta;
  if (Math.abs(turn) <= maxStep) return target;
  return current + Math.sign(turn) * maxStep;
}

/**
 * Per-model-family correction for a rig whose forward axis is not +Z. A
 * property of the ASSET, not of the entity using it — a monster rendered on a
 * Synty GLB needs the Synty value, not a monster-flavoured one.
 *
 * MEASURED, not derived (rpg-dnd5e-web#590). Before the split, a single
 * hardcoded `Math.PI` carried both this correction and the staging default
 * below, so the two terms could not be recovered by reading the old constants —
 * a naive split cancels to 2*PI. Both families were rendered at rotation 0 with
 * the camera on the world +Z axis and captured at rotation 0 vs PI: at 0 both
 * show their FACE, at PI both show their BACK.
 *
 * The result is that BOTH are zero — the rigs are already authored +Z-forward,
 * which is exactly the convention `headingFromDelta` produces, so no correction
 * is needed at all. The old `Math.PI` was 100% staging and 0% model correction.
 * These constants stay (rather than being deleted as no-ops) because the
 * measured fact "these rigs are +Z-forward" is the thing worth recording, and
 * because a future model family with a different convention needs this seam
 * rather than another fused constant.
 */
export const SYNTY_GLB_FORWARD_OFFSET = 0;
export const MEDIUM_HUMANOID_FORWARD_OFFSET = 0;

/**
 * Spawn pose. NOT a model correction — this is staging: players face up-board
 * and monsters face down-board so an encounter reads as two sides squaring off.
 * Preserved deliberately (Kirk, 2026-07-24); entities turn out of it as soon as
 * they move. Obstacles never move and fall through to 0.
 */
export const DEFAULT_HEADING_BY_TYPE: Record<string, number> = {
  player: Math.PI,
  monster: 0,
};
