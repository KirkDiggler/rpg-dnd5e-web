/**
 * The hex-grid battle map's Frosthaven-like camera: five deliberate wheel
 * bands from overview/tabletop through tactical and shoulder to fixed-angle detail,
 * plus the dials for tuning them live.
 *
 * The curve is ON by default — this is the camera now, not an experiment.
 * Orthographic wheel input steps through five deliberate camera bands; the
 * first two share the overview angle, pitch changes through tactical/shoulder,
 * and the final detail zoom keeps the shoulder angle.
 * `?pitchCurve=0` restores the old fixed-angle continuous zoom;
 * `?camera=persp` remains
 * opt-in, because orthographic-vs-perspective is a separate open question.
 *
 * Same "read the query string once" convention as `?syntyDungeon=` /
 * `?wallCutaway=` / `?wallHeight=` (EncounterMap.tsx), but parsed HERE rather
 * than in EncounterMap so the concepts surfaces that mount `<HexGrid>`
 * directly (`?concept=fog-of-war`) get the same camera and the same dials
 * without threading props through every caller. Camera feel is exactly the
 * thing that's pointless to argue about in review and has to be driven —
 * every surface that renders the grid should show the same one.
 *
 * WHY THESE DEFAULTS. Measured off Gloomhaven reference shots:
 *  - zoomed out, their camera is near TOP-DOWN (~30° from vertical)
 *  - zoomed in, it flattens to roughly eye-level-ish (~57° from vertical)
 * Ours is pinned at 51.4° (`Math.PI / 3.5`, HexGrid.tsx) at every zoom — i.e.
 * parked permanently at their CLOSE end, never reaching their planning angle.
 * So the bands are bidirectional: steeper when out, flatter when in.
 *
 * The steep end is not just cosmetic. A 6-hex move (our normal budget, vs
 * Gloomhaven's 2-4) is a ~20.8-world-unit disc at HEX_SIZE=1, and wall
 * occlusion scales with `tan(polar)`: a WALL_HEIGHT=2.4 wall hides ~1.7 hexes
 * at today's 51.4° but only ~0.8 hexes at 32°. Zooming out to plan therefore
 * gets a BETTER read on the move range than we have now, which is what makes
 * the close end affordable at all.
 */

import { numberDial } from '@/utils/queryDial';

/** Degrees → radians. Dials are authored in degrees; the camera wants radians. */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * Polar angle (degrees FROM VERTICAL) at the zoomed-OUT extreme. Near
 * top-down: this is the planning view, where a full 6-hex move and the room's
 * true shape need to read without wall occlusion eating the far side.
 */
export const DEFAULT_PITCH_FAR_DEG = 28;

/**
 * Polar angle (degrees from vertical) at the close-lean extreme — the
 * "up close and personal" end. 62° is past the ~57° measured off the
 * reference: Kirk drove the 32→57 version and asked for more swing.
 *
 * Wall occlusion is the thing this trades against — 2.4 * tan(62°) hides
 * ~3.4 world units, ~2.6 hexes, against ~1.7 at today's fixed 51.4°. Still
 * deliberately short of the 70°+ that hides ~3.8 hexes and would make
 * `?wallCutaway=1` a hard prerequisite rather than an opt-in experiment.
 */
export const DEFAULT_PITCH_NEAR_DEG = 62;

/**
 * World-space look-target lead at the shoulder/detail bands. Moving the
 * framing target ahead
 * of the followed mini settles that mini lower in frame and reserves more of
 * the close view for the dungeon in front.
 */
export const DEFAULT_CLOSE_FOCUS_LEAD = 2;

/**
 * Vertical FOV for `?camera=persp`. Narrow on purpose: at the zoomed-out end
 * a ~24° perspective camera is nearly indistinguishable from orthographic, so
 * the tactical read (hexes the same size across the screen) survives — while
 * dollying in still buys real convergence, which is what actually sells
 * "these minis are standing in a place" and what ortho can never give at any
 * pitch.
 */
export const DEFAULT_PERSP_FOV_DEG = 24;

/**
 * Perspective dolly range, world units from the orbit target. The far end is
 * 28 rather than 40 for the same reason the ortho floor moved up to
 * DEFAULT_ZOOM_MIN — pulled all the way back, the room shrank into the middle
 * of a lot of black.
 */
export const DEFAULT_MIN_DISTANCE = 6;
export const DEFAULT_MAX_DISTANCE = 28;

/**
 * Orthographic overview zoom — one deliberate step wider than the tabletop
 * band for the game's six-hex movement budget.
 */
export const DEFAULT_ZOOM_MIN = 35;

/** Wide tabletop band; shares the overview pitch without pulling out as far. */
export const DEFAULT_TABLETOP_ZOOM = 50;

/**
 * Orthographic detail-band zoom. Pitch has already reached its close angle at
 * the preceding shoulder band; this final step changes scale only.
 */
export const DEFAULT_ZOOM_MAX = 140;

/**
 * Starting orthographic zoom and tactical band. It sits between the wide
 * tabletop and shoulder/detail bands rather than landing at either extreme.
 */
export const DEFAULT_ZOOM_START = 80;

/**
 * Q/E rotation speed, degrees per second — until #906 this was 0.02–0.03
 * RADIANS PER RENDERED FRAME with no delta scaling (69–103°/s at 60Hz, double
 * that at 120Hz — see useCameraControls.ts's own useFrame). 70°/s is
 * HexGrid.tsx's own pre-#906 call-site value (0.02 rad/frame @ 60Hz ≈
 * 68.75°/s) rounded to a clean number and promoted to
 * useCameraControls' own default, so both routes agree without either
 * overriding it — the session route previously omitted the override and
 * silently ran the hook's OWN default (0.03 rad/frame, a different speed).
 */
export const DEFAULT_ROTATE_SPEED_DEG_PER_SEC = 70;

/**
 * WASD pan speed, world units per second — HexGrid.tsx's own pre-#906
 * call-site value (0.3 units/frame) at 60Hz. Same promotion as
 * `DEFAULT_ROTATE_SPEED_DEG_PER_SEC` above.
 */
export const DEFAULT_PAN_SPEED_PER_SEC = 18;

/**
 * Middle-drag rotation speed, degrees per pixel. Kirk's own dial table for
 * this slice: "~0.4".
 */
export const DEFAULT_DRAG_ROTATE_DEG_PER_PX = 0.4;

export interface CameraDials {
  /** Perspective projection instead of the default orthographic. */
  perspective: boolean;
  /**
   * Q/E rotation, RADIANS per second — converted here from the `rotateSpeed`
   * URL dial (authored in degrees per second, matching `fovDeg`'s own
   * "author in the human unit, convert once here" convention) because
   * useCameraControls.ts's azimuth math is radian-based throughout.
   */
  rotateSpeed: number;
  /** WASD pan, world units per second. */
  panSpeed: number;
  /**
   * Where Q/E and middle-drag rotation pivot (`?orbitPivot=`).
   *
   * `auto` (DEFAULT as of Kirk's first live session, 2026-09-03): pivots on
   * the mini UNLESS the player has manually panned (WASD or right-drag)
   * since the mini last moved — a manual pan switches the pivot to the view
   * center, and the mini moving again OR pressing `F` switches it back.
   * Kirk: "after we move [pivot on me] is good, but if I pan ahead I would
   * expect it to rotate the center of my screen." See `orbitPivotMode.ts`
   * for the pure state machine.
   *
   * `view` pivots on the orbit target itself — the camera's own look-at
   * point, which never leaves screen center by construction. `me` always
   * pivots on the local player's own mini, so the mini holds its screen
   * position and the board turns around it, regardless of panning. Both
   * remain explicit escape hatches from `auto`.
   */
  orbitPivot: 'auto' | 'view' | 'me';
  /**
   * Middle-drag rotation, RADIANS per pixel — converted here from the
   * `dragRotate` URL dial (authored in degrees per pixel, same convention as
   * `rotateSpeed` above).
   */
  dragRotate: number;
  /**
   * Vertical FOV in DEGREES (perspective only) — degrees, not radians,
   * because that is what `<Canvas camera={{ fov }}>` wants; keeping the unit
   * matched to the consumer avoids a silent conversion bug at the call site.
   */
  fovDeg: number;
  /** Dolly range in world units (perspective only). */
  minDistance: number;
  maxDistance: number;
  /**
   * Zoom-coupled pitch — ON by default, since this is the battle map's
   * camera now rather than an experiment. `null` (only via `?pitchCurve=0`)
   * restores the single fixed angle the grid used before this feature.
   */
  curve: {
    polarFar: number;
    polarNear: number;
    focusLead: number;
    bands: readonly {
      zoom: number;
      polar: number;
      focusLead: number;
      /** Whether a move by the followed character re-centres the camera on
       * them. See `CAMERA_BAND_FOLLOWS_FOCUS` for why the wide bands say no. */
      follow: boolean;
    }[];
  } | null;
  /** Orthographic zoom range and starting point. */
  zoomMin: number;
  zoomMax: number;
  zoomStart: number;
}

/**
 * Does a band re-centre on the character when they move?
 *
 * Indexed to the five authored bands, zoomed-OUT first:
 * `[overview, tabletop, tactical, shoulder, detail]`.
 *
 * The wide three say no. Pulled back, the camera is a PLANNING view — the
 * player has framed a room, or a doorway, or the monster they are about to
 * walk around, and yanking that framing onto the mini every time it takes a
 * step throws away the thing they deliberately set up. It also fights the
 * pan they just made. Close in, the opposite is true: the shoulder and detail
 * bands exist to sit behind the character, and a character who walks out of
 * frame there is simply lost.
 *
 * This is the same "closeness" gradient `focusLead` already encodes — 0 for
 * the wide bands, a quarter lead at tactical, full at shoulder and detail —
 * so the two dials agree about where the camera stops being a map and starts
 * being a viewpoint.
 *
 * Kirk, 2026-08-28: "if the camera is in tabletop or tactical and I move the
 * camera should not center on me. the camera should stay put." Overview joins
 * them because it is wider still, and because this module's own doc comment
 * already treats "overview/tabletop" as one reading of the map.
 */
export const CAMERA_BAND_FOLLOWS_FOCUS: readonly boolean[] = [
  false, // overview
  false, // tabletop
  false, // tactical
  true, // shoulder
  true, // detail
];

/**
 * Whether the camera should chase a new focus target right now.
 *
 * Perspective is a separate, still-opt-in projection with no authored bands
 * of its own (`?camera=persp`), so it keeps the follow-always behavior rather
 * than silently inheriting a policy written for the orthographic ladder. An
 * unresolved band (no curve, or `?pitchCurve=0`'s fixed angle) follows too:
 * that is the pre-band behavior, and the band ladder is what earns the
 * exception.
 */
export function bandFollowsFocus(
  band: { follow: boolean } | null | undefined,
  perspective: boolean
): boolean {
  if (perspective) return true;
  return band?.follow ?? true;
}

/** Extracted to `src/utils/queryDial.ts` (#906) so diceDials.ts can parse
 * `?dieScale=` the same way, without a second copy drifting from this one. */
const num = numberDial;

/**
 * Pure parser over a query string — the whole point of splitting this out of
 * HexGrid is that the dial resolution is testable without a Canvas.
 *
 * The pitch curve is ON with no query params at all. It shipped behind
 * `?pitchCurve=1` while it was being judged live; Kirk's verdict walking it
 * ("ok. i like this angle a lot") is what promoted it, so the flag inverted
 * rather than lingering as a permanently-off experiment nobody would see.
 * `?pitchCurve=0` is the escape hatch back to the old fixed angle.
 *
 * `?camera=persp` is deliberately NOT promoted with it — orthographic vs
 * perspective is a separate, still-open call, and it stays opt-in until it
 * gets the same live judgment the curve just had.
 */
export function parseCameraDials(search: string): CameraDials {
  const params = new URLSearchParams(search);

  const perspective = params.get('camera') === 'persp';

  const pitchFarDeg = num(params, 'pitchFar');
  const pitchNearDeg = num(params, 'pitchNear');
  // Only an explicit `0` turns the curve off. An endpoint override still
  // implies ON, so `?pitchFar=20` alone tunes one end without also having to
  // remember to re-enable the thing you are tuning — and it beats `=0`, so a
  // stale `?pitchCurve=0` in a bookmarked URL cannot silently swallow a
  // deliberate angle you just typed.
  const curveOn =
    params.get('pitchCurve') !== '0' ||
    pitchFarDeg !== null ||
    pitchNearDeg !== null;

  const polarFar = deg(pitchFarDeg ?? DEFAULT_PITCH_FAR_DEG);
  const polarNear = deg(pitchNearDeg ?? DEFAULT_PITCH_NEAR_DEG);
  const requestedZoomMin = num(params, 'zoomMin') ?? DEFAULT_ZOOM_MIN;
  const requestedZoomMax = num(params, 'zoomMax') ?? DEFAULT_ZOOM_MAX;
  const requestedZoomStart = num(params, 'zoomStart') ?? DEFAULT_ZOOM_START;
  const zoomMin = Math.min(requestedZoomMin, requestedZoomMax);
  const zoomMax = Math.max(requestedZoomMin, requestedZoomMax);
  const zoomStart = Math.max(zoomMin, Math.min(zoomMax, requestedZoomStart));
  const tabletopProgress =
    (DEFAULT_TABLETOP_ZOOM - DEFAULT_ZOOM_MIN) /
    (DEFAULT_ZOOM_START - DEFAULT_ZOOM_MIN);
  const tabletopZoom = zoomMin + (zoomStart - zoomMin) * tabletopProgress;
  const shoulderZoom = zoomStart + (zoomMax - zoomStart) / 2;

  const rotateSpeedDegPerSec =
    num(params, 'rotateSpeed') ?? DEFAULT_ROTATE_SPEED_DEG_PER_SEC;
  const rawOrbitPivot = params.get('orbitPivot');
  const orbitPivot =
    rawOrbitPivot === 'me' || rawOrbitPivot === 'view' ? rawOrbitPivot : 'auto';
  const dragRotateDegPerPx =
    num(params, 'dragRotate') ?? DEFAULT_DRAG_ROTATE_DEG_PER_PX;

  return {
    perspective,
    rotateSpeed: deg(rotateSpeedDegPerSec),
    panSpeed: num(params, 'panSpeed') ?? DEFAULT_PAN_SPEED_PER_SEC,
    orbitPivot,
    dragRotate: deg(dragRotateDegPerPx),
    fovDeg: num(params, 'fov') ?? DEFAULT_PERSP_FOV_DEG,
    minDistance: num(params, 'minDist') ?? DEFAULT_MIN_DISTANCE,
    maxDistance: num(params, 'maxDist') ?? DEFAULT_MAX_DISTANCE,
    curve: curveOn
      ? {
          polarFar,
          polarNear,
          focusLead: DEFAULT_CLOSE_FOCUS_LEAD,
          bands: [
            {
              zoom: zoomMin,
              polar: polarFar,
              focusLead: 0,
              follow: CAMERA_BAND_FOLLOWS_FOCUS[0]!,
            },
            {
              zoom: tabletopZoom,
              polar: polarFar,
              focusLead: 0,
              follow: CAMERA_BAND_FOLLOWS_FOCUS[1]!,
            },
            {
              zoom: zoomStart,
              polar: (polarFar + polarNear) / 2,
              focusLead: DEFAULT_CLOSE_FOCUS_LEAD / 4,
              follow: CAMERA_BAND_FOLLOWS_FOCUS[2]!,
            },
            {
              zoom: shoulderZoom,
              polar: polarNear,
              focusLead: DEFAULT_CLOSE_FOCUS_LEAD,
              follow: CAMERA_BAND_FOLLOWS_FOCUS[3]!,
            },
            {
              zoom: zoomMax,
              polar: polarNear,
              focusLead: DEFAULT_CLOSE_FOCUS_LEAD,
              follow: CAMERA_BAND_FOLLOWS_FOCUS[4]!,
            },
          ],
        }
      : null,
    zoomMin,
    zoomMax,
    zoomStart,
  };
}

/** Read the dials once from the live URL. */
export function readCameraDials(): CameraDials {
  if (typeof window === 'undefined') return parseCameraDials('');
  return parseCameraDials(window.location.search);
}
