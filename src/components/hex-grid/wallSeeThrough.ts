/**
 * See-through walls — dials and pure math for "fade what is actually in the
 * way" (`?wallSee=1`), the successor to `?wallCutaway=1`'s height swap.
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
 *   1. a wall must stop OCCLUDING the minis behind it, and
 *   2. a wall should keep EXISTING — silhouette, height, top edge, mass.
 * Fading answers (1) without giving up (2).
 *
 * WHY OCCLUSION IS MEASURED, NOT CLASSIFIED. Cutaway decides "is this wall
 * in front?" by dotting each run's outward `facing` against
 * `CAMERA_WARD_XZ` — a MODULE CONSTANT baked from the Canvas's authored
 * `CAMERA_OFFSET` ([8, 10, 8], azimuth 45deg). Nothing recomputes it when
 * the player orbits with Q/E, so after a rotation cutaway stubs whichever
 * walls faced the camera AT STARTUP while a full-height wall stands between
 * you and the room (reproduced live: orbit ~180deg with `?wallCutaway=1`).
 * Q/E rotation made a once-safe assumption wrong.
 *
 * This module does not fix that dot product — it removes the need for one.
 * A ray cast from the live camera toward each mini reports what is ACTUALLY
 * blocking it, so "in front" is re-derived every frame from the real camera
 * and cannot drift out of sync with it. It is also strictly more surgical:
 * the room keeps its walls everywhere except where someone would be hidden,
 * rather than losing a whole side.
 *
 * WHY DITHER RATHER THAN ALPHA BLENDING. Wall runs are TILED from many
 * separate GLB pieces that deliberately OVERLAP — `envelopeGeometryForRegion`'s
 * `cornerExtension` pushes perpendicular runs past their intersection so they
 * self-cover the joint (the modular-kit "overlap-miter" cheat; see
 * WallRunMesh's own doc comment). Stacked blended surfaces sort by object
 * centroid, so overlapping tiles would pop as the camera moves and would
 * double-darken where they overlap. `material.alphaHash` (three >= r150;
 * we are on 0.181) is stochastic/dithered transparency: it stays in the
 * OPAQUE pass, needs no sorting, and never double-darkens. The stipple also
 * reads as a deliberate effect rather than a rendering glitch.
 */

/** Opacity a fully-occluding wall piece settles at. Low enough to read the
 * floor and a mini through it, high enough that the wall's own brick relief
 * still registers as architecture rather than a ghost. */
export const DEFAULT_WALL_SEE_OPACITY = 0.18;

/**
 * Falloff radius (world units) around a blocked point. Pieces AT the blocked
 * point go to `DEFAULT_WALL_SEE_OPACITY`, pieces this far away stay fully
 * solid, and everything between rides a smoothstep — so the effect is a soft
 * hole rather than a hard-edged missing panel.
 *
 * Sized against the tiling, not picked for looks: a hex is 1.0 and adjacent
 * centres are sqrt(3) ~ 1.73 apart, so this spans roughly three hexes of wall
 * either side of the blocked spot — wide enough that a mini standing at a
 * tile seam is not half-hidden by the neighbouring tile that the ray happened
 * to miss, narrow enough that the rest of the run stays solid.
 *
 * Measured live rather than reasoned to: distance is taken to each piece's
 * CENTRE, not to its nearest surface, so a wide tile whose near edge is right
 * beside the blocked spot still counts as far away and stays solid. That
 * makes the hole on screen noticeably tighter (and slightly more ragged at
 * its rim) than the radius alone suggests. 3.5 left the character visible
 * only through a narrow window; 5 clears them properly while the rest of the
 * run stays plainly solid.
 */
export const DEFAULT_WALL_SEE_RADIUS = 5;

/** Exponential approach rate (per second) toward each piece's target
 * opacity. Fades rather than pops when you move behind a wall; fast enough
 * (~1/8s to close most of the gap) that it never feels laggy. */
export const DEFAULT_WALL_SEE_RATE = 12;

/**
 * Height (world units) above a mini's hex that the occlusion ray aims at.
 * NOT the floor: a ray at y=0 grazes the ground plane and reports a wall as
 * blocking only once it already covers the mini's feet. Characters stand
 * ~1.5 units tall (SYNTY_SCALE's calibration note), so 1.1 is upper-chest —
 * the part you actually need to see to know who is standing there.
 */
export const DEFAULT_WALL_SEE_EYE_HEIGHT = 1.1;

export interface WallSeeThroughDials {
  /** Off by default — same "default off, opt in by query param" convention
   * as `?syntyDungeon=` / `?wallCutaway=` / `?pitchCurve=`. */
  enabled: boolean;
  minOpacity: number;
  radius: number;
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

  const minOpacity = num(params, 'wallSeeOpacity');
  const radius = num(params, 'wallSeeRadius');
  const rate = num(params, 'wallSeeRate');
  const eyeHeight = num(params, 'wallSeeEye');

  const enabled =
    params.get('wallSee') === '1' ||
    minOpacity !== null ||
    radius !== null ||
    rate !== null ||
    eyeHeight !== null;

  return {
    enabled,
    minOpacity: minOpacity ?? DEFAULT_WALL_SEE_OPACITY,
    radius: radius ?? DEFAULT_WALL_SEE_RADIUS,
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
 * Target opacity for a wall piece whose centre sits `distance` world units
 * from the nearest point a mini is actually blocked at.
 *
 * Smoothstep rather than linear so the edge of the hole has no visible
 * crease — a linear ramp leaves a first-derivative discontinuity exactly at
 * `radius`, which reads as a hard circle on a large flat brick surface.
 */
export function fadeOpacityForDistance(
  distance: number,
  radius: number,
  minOpacity: number
): number {
  if (!(radius > 0)) return distance <= 0 ? minOpacity : 1;
  if (distance >= radius) return 1;
  const t = Math.min(1, Math.max(0, distance / radius));
  const smooth = t * t * (3 - 2 * t);
  return minOpacity + (1 - minOpacity) * smooth;
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
