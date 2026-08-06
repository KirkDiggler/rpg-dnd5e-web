/**
 * Camera-feel dials for the hex-grid battle map — the live-judgment surface
 * for the "flatten the camera when you zoom in" work (Gloomhaven's board
 * camera, which Kirk called out from play).
 *
 * Same "read the query string once, default off" convention as
 * `?syntyDungeon=` / `?wallCutaway=` / `?wallHeight=` (EncounterMap.tsx), but
 * parsed HERE rather than in EncounterMap so the concepts surfaces that mount
 * `<HexGrid>` directly (`?concept=fog-of-war`) get the same dials without
 * threading props through every caller. Camera feel is exactly the thing
 * that's pointless to argue about in review and has to be driven — every
 * surface that renders the grid should be able to show it.
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
export const DEFAULT_PITCH_FAR_DEG = 32;

/**
 * Polar angle (degrees from vertical) at the zoomed-IN extreme — the
 * "up close and personal" end. ~57° matches the reference close-up and is
 * only modestly flatter than today's fixed 51.4°, so wall occlusion grows
 * from ~1.7 to ~2.1 hexes: noticeable, not disqualifying. Deliberately NOT
 * the 70°+ that would make `?wallCutaway=1` a hard prerequisite.
 */
export const DEFAULT_PITCH_NEAR_DEG = 57;

/**
 * Vertical FOV for `?camera=persp`. Narrow on purpose: at the zoomed-out end
 * a ~24° perspective camera is nearly indistinguishable from orthographic, so
 * the tactical read (hexes the same size across the screen) survives — while
 * dollying in still buys real convergence, which is what actually sells
 * "these minis are standing in a place" and what ortho can never give at any
 * pitch.
 */
export const DEFAULT_PERSP_FOV_DEG = 24;

/** Perspective dolly range, world units from the orbit target. */
export const DEFAULT_MIN_DISTANCE = 6;
export const DEFAULT_MAX_DISTANCE = 40;

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
   * Zoom-coupled pitch. `null` keeps the single fixed angle the grid has
   * always used — the untouched default path.
   */
  curve: { polarFar: number; polarNear: number } | null;
  /**
   * Orthographic max zoom override. The stock 150 tops out around 6 hexes
   * across; the reference close-up frames roughly 4, so getting there needs
   * ~230-260. Left alone by default.
   */
  zoomMax: number | null;
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
 * `?camera=persp` and `?pitchCurve=1` are independent: either alone is a
 * legible experiment, and both together is the full proposal. Each implies
 * usable defaults on its own, deliberately — the `?wallCutaway=1` papercut
 * (a flag that composed into something barely distinguishable from off) is
 * the failure mode being avoided here.
 */
export function parseCameraDials(search: string): CameraDials {
  const params = new URLSearchParams(search);

  const perspective = params.get('camera') === 'persp';

  // An explicit endpoint override implies the curve, so you can dial one end
  // without also remembering `?pitchCurve=1`.
  const pitchFarDeg = num(params, 'pitchFar');
  const pitchNearDeg = num(params, 'pitchNear');
  const curveOn =
    params.get('pitchCurve') === '1' ||
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
    zoomMax: num(params, 'zoomMax'),
  };
}

/** Read the dials once from the live URL. */
export function readCameraDials(): CameraDials {
  if (typeof window === 'undefined') return parseCameraDials('');
  return parseCameraDials(window.location.search);
}
