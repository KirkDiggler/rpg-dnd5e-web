/**
 * See-through walls — dials and pure math for `?wallSee=1`, the successor to
 * `?wallCutaway=1`'s height swap.
 *
 * WHY THIS EXISTS. `?wallCutaway=1` answers wall occlusion by making the
 * near wall STOP EXISTING: `effectiveWallHeight` swaps it to a 0.3 stub.
 * That was a fair trade at the grid's old fixed 51.4deg pitch, where a near
 * wall was a thin sliver of frame. It stopped being fair once the pitch
 * curve (cameraDials.ts) flattens to 62deg on zoom-in: the near wall is now
 * a quarter of the picture, and deleting it leaves the floor floating in
 * black with no sense of enclosure — the exact thing the flat angle was
 * adopted to buy.
 *
 * Two DIFFERENT problems were being answered by one mechanism:
 *   1. a wall must stop OCCLUDING what is behind it, and
 *   2. a wall should keep EXISTING — silhouette, height, top edge, mass.
 * Fading answers (1) without giving up (2).
 *
 * WHY THE CAMERA IS READ LIVE. Cutaway decides "is this wall in front?" by
 * dotting each run's outward `facing` against `CAMERA_WARD_XZ` — a MODULE
 * CONSTANT baked from the Canvas's authored `CAMERA_OFFSET` ([8, 10, 8],
 * azimuth 45deg). Nothing recomputes it when the player orbits with Q/E, so
 * after a rotation cutaway stubs whichever walls faced the camera AT STARTUP
 * while a full-height wall stands between you and the room (reproduced live:
 * orbit ~180deg with `?wallCutaway=1`). Q/E rotation made a once-safe
 * assumption wrong. Nothing here is precomputed from the authored camera —
 * every decision is re-derived each frame from the real one, so it cannot
 * drift out of sync no matter how the player moves.
 *
 * WHY ALPHA RATHER THAN DITHER. The first cut of this used
 * `material.alphaHash` — stochastic transparency, which stays in the opaque
 * pass and therefore needs no sorting and never double-darkens where the
 * tiled runs overlap (`envelopeGeometryForRegion`'s `cornerExtension`
 * deliberately pushes perpendicular runs past their intersection so they
 * self-cover the joint). Correct, and cheap, but Kirk's verdict driving it
 * was decisive: the stipple "looks like sand on the glass". Real alpha
 * blending it is.
 *
 * The sorting hazards that motivated alphaHash are handled rather than
 * wished away, and are mostly defused by fading a WHOLE wall at once:
 *  - Back faces are already culled (`MeshStandardMaterial` defaults to
 *    `FrontSide`), so a single wall box contributes exactly one blended
 *    layer, not two.
 *  - `depthWrite` stays ON. Transparent objects render back-to-front, so the
 *    nearer piece draws last and blends over the farther one instead of
 *    both compositing into a double-dark patch.
 *  - Every piece of one wall shares a single opacity, so there is no seam
 *    between neighbouring tiles of the same run to sort wrong.
 * The residual artifact is the overlap-miter corner itself, where two runs
 * genuinely occupy the same space and will composite twice — a small, fixed
 * region at each room corner. Watch it there; nowhere else.
 */

/**
 * How a wall earns its fade.
 *
 * `'near'` — any wall on the camera's side of the orbit target goes
 * translucent, always, whether or not anything is behind it right now. This
 * is the classic isometric read and it is the DEFAULT because the
 * alternative was invisible in practice: `'block'` correctly did nothing
 * almost all the time, since a mini standing mid-room is not behind
 * anything, and Kirk's report driving this change was simply "I cannot see
 * through the walls".
 *
 * `'block'` — only walls a mini is ACTUALLY hidden behind. Strictly better
 * information-wise (the room keeps its walls until they are in the way), and
 * kept as a dial precisely because it is the more surgical behaviour, but it
 * is far less legible as a constant visual language.
 */
export type WallSeeMode = 'near' | 'block';

export const DEFAULT_WALL_SEE_MODE: WallSeeMode = 'near';

/**
 * Opacity a faded wall settles at. Low enough to read the floor and a mini
 * through it, high enough that the wall's own brick relief still registers
 * as architecture rather than a ghost — it is still a wall, that being the
 * entire point of fading rather than deleting.
 */
export const DEFAULT_WALL_SEE_OPACITY = 0.25;

/**
 * Exponential approach rate (per second) toward each wall's target opacity.
 * Fades rather than pops as you orbit a wall from the far side to the near
 * side; fast enough (~1/8s to close most of the gap) that it never feels
 * laggy.
 */
export const DEFAULT_WALL_SEE_RATE = 12;

/**
 * `'block'` mode only: height (world units) above a mini's hex that the
 * occlusion ray aims at. NOT the floor — a ray at y=0 grazes the ground
 * plane and reports a wall as blocking only once it already covers the
 * mini's feet. Characters stand ~1.5 units tall (SYNTY_SCALE's calibration
 * note), so 1.1 is upper-chest: the part you actually need to see to know
 * who is standing there.
 */
export const DEFAULT_WALL_SEE_EYE_HEIGHT = 1.1;

export interface WallSeeThroughDials {
  /** Off by default — same "default off, opt in by query param" convention
   * as `?syntyDungeon=` / `?wallCutaway=` / `?pitchCurve=`. */
  enabled: boolean;
  mode: WallSeeMode;
  minOpacity: number;
  rate: number;
  eyeHeight: number;
}

/** Finite-number query param, or null when absent/garbage. Mirrors
 * cameraDials.ts's own `num` — same reason (never poison a render with NaN). */
function num(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pure parser over a query string, testable without a Canvas.
 *
 * Any explicit tuning param implies `enabled`, so you can dial one value
 * without also remembering `?wallSee=1` — the same affordance cameraDials
 * gives `?pitchFar=`/`?pitchNear=`, and the same `?wallCutaway=1` papercut
 * being avoided (a flag whose defaults composed into something barely
 * distinguishable from off).
 */
export function parseWallSeeThrough(search: string): WallSeeThroughDials {
  const params = new URLSearchParams(search);

  const rawMode = params.get('wallSeeMode');
  const mode: WallSeeMode | null =
    rawMode === 'near' || rawMode === 'block' ? rawMode : null;
  const minOpacity = num(params, 'wallSeeOpacity');
  const rate = num(params, 'wallSeeRate');
  const eyeHeight = num(params, 'wallSeeEye');

  const enabled =
    params.get('wallSee') === '1' ||
    mode !== null ||
    minOpacity !== null ||
    rate !== null ||
    eyeHeight !== null;

  return {
    enabled,
    mode: mode ?? DEFAULT_WALL_SEE_MODE,
    minOpacity: minOpacity ?? DEFAULT_WALL_SEE_OPACITY,
    rate: rate ?? DEFAULT_WALL_SEE_RATE,
    eyeHeight: eyeHeight ?? DEFAULT_WALL_SEE_EYE_HEIGHT,
  };
}

/** Read the dials once from the live URL. */
export function readWallSeeThrough(): WallSeeThroughDials {
  if (typeof window === 'undefined') return parseWallSeeThrough('');
  return parseWallSeeThrough(window.location.search);
}

/**
 * `'near'` mode's whole test: is a wall sitting between the camera and what
 * the camera is looking at?
 *
 * Both arguments are depths along the camera's own view axis — the camera's
 * forward vector dotted with (point - cameraPosition). A wall in FRONT of
 * the orbit target has the smaller depth. Comparing along the view axis
 * rather than by straight-line distance is what makes this correct for an
 * orthographic camera, where every ray is parallel and "distance to the
 * camera" is not the same thing as "how far into the picture".
 *
 * `margin` pushes the cut slightly PAST the target so the wall a mini is
 * standing directly against does not flicker between faded and solid as they
 * move a fraction of a hex.
 */
export function isInFrontOfTarget(
  wallDepth: number,
  targetDepth: number,
  margin: number
): boolean {
  return wallDepth < targetDepth + margin;
}

/**
 * One frame's step of an exponential approach toward `target`.
 *
 * Framerate-INDEPENDENT on purpose (`1 - exp(-rate * dt)` rather than a
 * fixed per-frame fraction): the grid runs `frameloop="demand"`, so frames
 * arrive in irregular bursts whenever something invalidates rather than at a
 * steady 60Hz. A per-frame constant would make the same fade visibly faster
 * during a drag than after it.
 */
export function approachOpacity(
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number
): number {
  if (!(rate > 0)) return target;
  const dt = Math.max(0, deltaSeconds);
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
