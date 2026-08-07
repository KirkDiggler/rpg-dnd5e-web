/**
 * The hex-grid battle map's camera: it flattens as you zoom in and stands up
 * as you pull out (Gloomhaven's board camera, which Kirk called out from
 * play), plus the dials for tuning that live.
 *
 * The curve is ON by default — this is the camera now, not an experiment.
 * `?pitchCurve=0` restores the old fixed angle; `?camera=persp` remains
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
 * So the curve is bidirectional: steeper when out, flatter when in.
 *
 * The steep end is not just cosmetic. A 6-hex move (our normal budget, vs
 * Gloomhaven's 2-4) is a ~20.8-world-unit disc at HEX_SIZE=1, and wall
 * occlusion scales with `tan(polar)`: a WALL_HEIGHT=2.4 wall hides ~1.7 hexes
 * at today's 51.4° but only ~0.8 hexes at 32°. Zooming out to plan therefore
 * gets a BETTER read on the move range than we have now, which is what makes
 * the close end affordable at all.
 */

/** Degrees → radians. Dials are authored in degrees; the camera wants radians. */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * Polar angle (degrees FROM VERTICAL) at the zoomed-OUT extreme. Near
 * top-down: this is the planning view, where a full 6-hex move and the room's
 * true shape need to read without wall occlusion eating the far side.
 */
export const DEFAULT_PITCH_FAR_DEG = 28;

/**
 * Polar angle (degrees from vertical) at the zoomed-IN extreme — the
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
 * Orthographic zoom floor — how far OUT you may go. Was 30, which showed
 * ~31 hexes across a 1600px canvas: far more board than a 6-hex move needs
 * (a ~20.8-world-unit disc, ~12 hexes) and the dungeon read as a small
 * object in a black frame. 50 still frames ~18 hexes, so a full move plus
 * margin fits, without the room getting lost.
 */
export const DEFAULT_ZOOM_MIN = 50;

/**
 * Orthographic zoom ceiling — how far IN you may go. The stock 150 topped
 * out around 6 hexes across, short of the reference close-up's ~4; 220 gets
 * there. Raised as a DEFAULT (not just a dial) so `?pitchCurve=1` on its own
 * reaches the close end the curve exists to serve.
 */
export const DEFAULT_ZOOM_MAX = 220;

/**
 * Starting orthographic zoom. Sits partway up the [MIN, MAX] range so the
 * landing view is moderately close and moderately steep rather than pinned
 * at either extreme of the pitch curve — at 110 the curve resolves to ~40°
 * from vertical, between the 28° planning angle and the 62° close angle.
 */
export const DEFAULT_ZOOM_START = 110;

export interface CameraDials {
  /** Perspective projection instead of the default orthographic. */
  perspective: boolean;
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
  curve: { polarFar: number; polarNear: number } | null;
  /** Orthographic zoom range and starting point. */
  zoomMin: number;
  zoomMax: number;
  zoomStart: number;
}

/** Finite-number query param, or null when absent/garbage. */
function num(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

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

  return {
    perspective,
    fovDeg: num(params, 'fov') ?? DEFAULT_PERSP_FOV_DEG,
    minDistance: num(params, 'minDist') ?? DEFAULT_MIN_DISTANCE,
    maxDistance: num(params, 'maxDist') ?? DEFAULT_MAX_DISTANCE,
    curve: curveOn
      ? {
          polarFar: deg(pitchFarDeg ?? DEFAULT_PITCH_FAR_DEG),
          polarNear: deg(pitchNearDeg ?? DEFAULT_PITCH_NEAR_DEG),
        }
      : null,
    zoomMin: num(params, 'zoomMin') ?? DEFAULT_ZOOM_MIN,
    zoomMax: num(params, 'zoomMax') ?? DEFAULT_ZOOM_MAX,
    zoomStart: num(params, 'zoomStart') ?? DEFAULT_ZOOM_START,
  };
}

/** Read the dials once from the live URL. */
export function readCameraDials(): CameraDials {
  if (typeof window === 'undefined') return parseCameraDials('');
  return parseCameraDials(window.location.search);
}
