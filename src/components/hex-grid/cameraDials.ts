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
  curve: {
    polarFar: number;
    polarNear: number;
    focusLead: number;
    bands: readonly {
      zoom: number;
      polar: number;
      focusLead: number;
    }[];
  } | null;
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

  const polarFar = deg(pitchFarDeg ?? DEFAULT_PITCH_FAR_DEG);
  const polarNear = deg(pitchNearDeg ?? DEFAULT_PITCH_NEAR_DEG);
  const zoomMin = num(params, 'zoomMin') ?? DEFAULT_ZOOM_MIN;
  const zoomMax = num(params, 'zoomMax') ?? DEFAULT_ZOOM_MAX;
  const zoomStart = num(params, 'zoomStart') ?? DEFAULT_ZOOM_START;
  const shoulderZoom = zoomStart + (zoomMax - zoomStart) / 2;

  return {
    perspective,
    fovDeg: num(params, 'fov') ?? DEFAULT_PERSP_FOV_DEG,
    minDistance: num(params, 'minDist') ?? DEFAULT_MIN_DISTANCE,
    maxDistance: num(params, 'maxDist') ?? DEFAULT_MAX_DISTANCE,
    curve: curveOn
      ? {
          polarFar,
          polarNear,
          focusLead: DEFAULT_CLOSE_FOCUS_LEAD,
          bands: [
            { zoom: zoomMin, polar: polarFar, focusLead: 0 },
            { zoom: DEFAULT_TABLETOP_ZOOM, polar: polarFar, focusLead: 0 },
            {
              zoom: zoomStart,
              polar: (polarFar + polarNear) / 2,
              focusLead: DEFAULT_CLOSE_FOCUS_LEAD / 4,
            },
            {
              zoom: shoulderZoom,
              polar: polarNear,
              focusLead: DEFAULT_CLOSE_FOCUS_LEAD,
            },
            {
              zoom: zoomMax,
              polar: polarNear,
              focusLead: DEFAULT_CLOSE_FOCUS_LEAD,
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
