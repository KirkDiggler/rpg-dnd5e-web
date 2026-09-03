/**
 * `Home` key band-fit selection (#906) — the pure, testable half. See
 * useCameraControls.ts's own doc comment on `revealedBounds` for the "never
 * automatic" rule this exists to serve (rpg-dnd5e-web#457: the camera must
 * never auto-reframe away from where the player put it — `Home` only ever
 * runs on an actual keypress).
 *
 * # Reading "the widest ladder band whose zoom fits"
 *
 * The issue's own spec names this "the widest ladder band whose zoom fits
 * the bbox" — read most literally, that means: among bands wide enough to
 * show the whole revealed area, prefer the WIDEST (most zoomed-out) one.
 * Taken literally, though, that degenerates badly: since a wider band
 * trivially fits anything a narrower one does, "widest that fits" is
 * satisfied by the single widest band (Overview) almost every time — Home
 * would jump straight to Overview even for one small starting room, rather
 * than scaling with how much is actually revealed.
 *
 * This implementation instead picks the NARROWEST (most zoomed-in) band
 * that still contains the whole bbox — standard "zoom to fit" semantics
 * (the same thing "Fit to window"/"Zoom to fit" means everywhere else):
 * make the revealed board read as large as the screen allows while
 * guaranteeing nothing is clipped. Flagged for Kirk to confirm or correct
 * live, same as every other dial in this batch.
 */

export interface CameraFitBbox {
  readonly width: number;
  readonly height: number;
}

export interface CameraFitViewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface CameraFitBand {
  readonly zoom: number;
}

/** Fraction of a band's visible world-space extent actually budgeted for
 * the fit — leaves breathing room around the revealed board rather than
 * running it flush to the frame edge. */
export const CAMERA_FIT_MARGIN = 0.85;

/**
 * The index of the band that best fits `bbox` inside `viewport`, leaving
 * `margin` headroom on each axis.
 *
 * `bands` MUST be zoom-ascending (cameraDials.ts's own band order —
 * overview→tabletop→tactical→shoulder→detail, widest/most-zoomed-out
 * first); this is not re-validated here. world-per-pixel is `1/zoom`
 * (useCameraControls.ts's own `worldPerPixel()`), so a band's visible
 * world-space size is `viewportPx / zoom`.
 *
 * Returns the narrowest (highest-zoom) band whose visible area, at
 * `margin`, still contains the whole bbox — see this module's own doc
 * comment on why "narrowest that fits" rather than "widest that fits".
 * Falls back to the WIDEST band (index 0) if even that cannot contain the
 * bbox, as the best available effort rather than nothing. Returns -1 for
 * an empty band list (nothing to select).
 */
export function fitBandIndexForBbox(
  bbox: CameraFitBbox,
  viewport: CameraFitViewport,
  bands: readonly CameraFitBand[],
  margin: number = CAMERA_FIT_MARGIN
): number {
  if (bands.length === 0) return -1;

  const fits = (zoom: number): boolean => {
    if (zoom <= 0) return false;
    const worldPerPx = 1 / zoom;
    const visibleWidth = viewport.widthPx * worldPerPx * margin;
    const visibleHeight = viewport.heightPx * worldPerPx * margin;
    return visibleWidth >= bbox.width && visibleHeight >= bbox.height;
  };

  for (let index = bands.length - 1; index >= 0; index -= 1) {
    if (fits(bands[index]!.zoom)) return index;
  }
  return 0;
}
