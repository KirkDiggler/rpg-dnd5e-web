import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRAG_ROTATE_DEG_PER_PX,
  DEFAULT_MAX_DISTANCE,
  DEFAULT_MIN_DISTANCE,
  DEFAULT_PAN_SPEED_PER_SEC,
  DEFAULT_PERSP_FOV_DEG,
  DEFAULT_PITCH_FAR_DEG,
  DEFAULT_PITCH_NEAR_DEG,
  DEFAULT_ROTATE_SPEED_DEG_PER_SEC,
  DEFAULT_ZOOM_MAX,
  DEFAULT_ZOOM_MIN,
  DRAG_SECONDS_PER_PIXEL,
  bandFollowsFocus,
  parseCameraDials,
} from './cameraDials';

const rad = (d: number) => (d * Math.PI) / 180;

describe('parseCameraDials', () => {
  it('curves the pitch with NO query params — this is the battle map camera now', () => {
    // Promoted from `?pitchCurve=1` after Kirk walked it live ("ok. i like
    // this angle a lot"). A camera nobody sees without a query param is not
    // a camera.
    const dials = parseCameraDials('');
    expect(dials.curve).not.toBeNull();
    expect(dials.curve?.polarFar).toBeCloseTo(rad(DEFAULT_PITCH_FAR_DEG));
    expect(dials.curve?.polarNear).toBeCloseTo(rad(DEFAULT_PITCH_NEAR_DEG));
  });

  it('leaves PROJECTION alone by default — ortho vs perspective is still open', () => {
    expect(parseCameraDials('').perspective).toBe(false);
    expect(parseCameraDials('?pitchCurve=0').perspective).toBe(false);
  });

  it('?pitchCurve=0 is the escape hatch back to the old single fixed angle', () => {
    expect(parseCameraDials('?pitchCurve=0').curve).toBeNull();
  });

  it('an explicit angle beats a stale ?pitchCurve=0 rather than being swallowed by it', () => {
    // A bookmarked opt-out must not silently discard an angle you just typed.
    const dials = parseCameraDials('?pitchCurve=0&pitchNear=70');
    expect(dials.curve).not.toBeNull();
    expect(dials.curve?.polarNear).toBeCloseTo(rad(70));
  });

  it('ships a zoom range that fits a 6-hex move without losing the room in black', () => {
    const dials = parseCameraDials('');
    expect(dials.zoomMin).toBe(DEFAULT_ZOOM_MIN);
    expect(dials.zoomMax).toBe(DEFAULT_ZOOM_MAX);
    // Adjacent hex centres are sqrt(3) apart at HEX_SIZE=1, so a 6-hex move
    // is a ~20.8-world-unit disc. Orthographic world-width is canvasPx/zoom,
    // so the zoomed-OUT floor has to keep at least that much on a normal
    // canvas — otherwise you cannot see where you are allowed to walk.
    const sixHexMoveWidth = 12 * Math.sqrt(3);
    expect(1600 / dials.zoomMin).toBeGreaterThan(sixHexMoveWidth);
  });

  it('starts on the tactical band between the tabletop and detail extremes', () => {
    const dials = parseCameraDials('');
    expect(dials.zoomStart).toBeGreaterThan(dials.zoomMin);
    expect(dials.zoomStart).toBeLessThan(dials.zoomMax);
  });

  it('?pitchCurve=1 alone yields a curve wide enough to actually see', () => {
    // The ?wallCutaway=1 papercut: a flag whose defaults composed into
    // something barely distinguishable from off. Kirk drove the first
    // 32->57 pass and asked for more, so the swing is now >30 degrees.
    const { curve } = parseCameraDials('?pitchCurve=1');
    expect(curve).not.toBeNull();
    expect(curve?.polarFar).toBeCloseTo(rad(DEFAULT_PITCH_FAR_DEG));
    expect(curve?.polarNear).toBeCloseTo(rad(DEFAULT_PITCH_NEAR_DEG));
    expect(DEFAULT_PITCH_NEAR_DEG - DEFAULT_PITCH_FAR_DEG).toBeGreaterThan(30);
  });

  it('flattens as you zoom IN: the near (zoomed-in) angle is further from vertical than the far one', () => {
    const { curve } = parseCameraDials('?pitchCurve=1');
    expect(curve!.polarNear).toBeGreaterThan(curve!.polarFar);
  });

  it('keeps the close end shy of the angle that would make wall cutaway mandatory', () => {
    // Occlusion behind a WALL_HEIGHT=2.4 wall is 2.4*tan(polar); at 70deg
    // that is ~6.6 world units (~3.8 hexes) and a near wall eats the room.
    // The reference close-up sits around 57deg (~2.1 hexes), which is only
    // modestly worse than today's fixed 51.4deg (~1.7 hexes).
    expect(DEFAULT_PITCH_NEAR_DEG).toBeLessThan(65);
  });

  it('an explicit endpoint implies the curve without also needing ?pitchCurve=1', () => {
    const farOnly = parseCameraDials('?pitchFar=20');
    expect(farOnly.curve?.polarFar).toBeCloseTo(rad(20));
    expect(farOnly.curve?.polarNear).toBeCloseTo(rad(DEFAULT_PITCH_NEAR_DEG));

    const nearOnly = parseCameraDials('?pitchNear=70');
    expect(nearOnly.curve?.polarNear).toBeCloseTo(rad(70));
    expect(nearOnly.curve?.polarFar).toBeCloseTo(rad(DEFAULT_PITCH_FAR_DEG));
  });

  it('?camera=persp is independent of the pitch curve — each is its own decision', () => {
    // Perspective composes ON TOP of the shipped curve; turning the curve
    // off must not drag the projection with it, or vice versa.
    const perspOnly = parseCameraDials('?camera=persp');
    expect(perspOnly.perspective).toBe(true);
    expect(perspOnly.curve).not.toBeNull();

    const perspNoCurve = parseCameraDials('?camera=persp&pitchCurve=0');
    expect(perspNoCurve.perspective).toBe(true);
    expect(perspNoCurve.curve).toBeNull();
  });

  it('reports fov in degrees, matching what <Canvas camera={{ fov }}> consumes', () => {
    expect(parseCameraDials('?camera=persp').fovDeg).toBe(
      DEFAULT_PERSP_FOV_DEG
    );
    expect(parseCameraDials('?camera=persp&fov=35').fovDeg).toBe(35);
    // Narrow by default so the pulled-back view still reads as near-ortho.
    expect(DEFAULT_PERSP_FOV_DEG).toBeLessThan(30);
  });

  it('carries dolly range and zoom overrides', () => {
    const dials = parseCameraDials(
      '?minDist=3&maxDist=64&zoomMin=20&zoomMax=300&zoomStart=90'
    );
    expect(dials.minDistance).toBe(3);
    expect(dials.maxDistance).toBe(64);
    expect(dials.zoomMin).toBe(20);
    expect(dials.zoomMax).toBe(300);
    expect(dials.zoomStart).toBe(90);
  });

  it('keeps camera bands monotonic under crossing zoom overrides', () => {
    for (const search of [
      '?zoomMin=60',
      '?zoomMin=200&zoomStart=10&zoomMax=5',
    ]) {
      const dials = parseCameraDials(search);
      const zooms = dials.curve!.bands.map((band) => band.zoom);
      expect(zooms).toEqual([...zooms].sort((a, b) => a - b));
      expect(dials.zoomMin).toBeLessThanOrEqual(dials.zoomStart);
      expect(dials.zoomStart).toBeLessThanOrEqual(dials.zoomMax);
    }
  });

  it('resolves rotateSpeed/panSpeed to the shared, time-based #906 defaults', () => {
    // Both routes used to diverge here (HexGrid.tsx overrode with 0.02
    // rad/frame + 0.3 units/frame; SessionCanvas silently ran the hook's own
    // 0.03/0.5 rad-or-unit-per-FRAME defaults). #906 promotes ONE shared
    // per-second default and both call sites now read it from here.
    const dials = parseCameraDials('');
    expect(dials.rotateSpeed).toBeCloseTo(
      rad(DEFAULT_ROTATE_SPEED_DEG_PER_SEC)
    );
    expect(dials.panSpeed).toBe(DEFAULT_PAN_SPEED_PER_SEC);
  });

  it('carries rotateSpeed/panSpeed URL overrides, authored in deg/s and units/s', () => {
    const dials = parseCameraDials('?rotateSpeed=120&panSpeed=40');
    expect(dials.rotateSpeed).toBeCloseTo(rad(120));
    expect(dials.panSpeed).toBe(40);
  });

  it('defaults orbitPivot to auto and only accepts the literals "me"/"view"', () => {
    expect(parseCameraDials('').orbitPivot).toBe('auto');
    expect(parseCameraDials('?orbitPivot=me').orbitPivot).toBe('me');
    expect(parseCameraDials('?orbitPivot=view').orbitPivot).toBe('view');
    expect(parseCameraDials('?orbitPivot=bogus').orbitPivot).toBe('auto');
  });

  it('derives dragRotate from rotateSpeed — one rotation speed, two inputs (#906 round 3)', () => {
    // Default rotateSpeed (70°/s) yields the original shipped drag rate
    // (0.4°/px) exactly, by construction of DRAG_SECONDS_PER_PIXEL.
    const dials = parseCameraDials('');
    expect(dials.dragRotate).toBeCloseTo(rad(DEFAULT_DRAG_ROTATE_DEG_PER_PX));
  });

  it('halving rotateSpeed halves drag speed — Q/E and middle mouse stay coupled', () => {
    const full = parseCameraDials('');
    const halved = parseCameraDials(
      `?rotateSpeed=${DEFAULT_ROTATE_SPEED_DEG_PER_SEC / 2}`
    );
    expect(halved.dragRotate).toBeCloseTo(full.dragRotate / 2);
  });

  it('a stray ?dragRotate= is ignored — there is no independent drag dial any more', () => {
    const dials = parseCameraDials('?dragRotate=1.2');
    expect(dials.dragRotate).toBeCloseTo(rad(DEFAULT_DRAG_ROTATE_DEG_PER_PX));
  });

  it('DRAG_SECONDS_PER_PIXEL matches the cited 0.4/70 derivation', () => {
    expect(DRAG_SECONDS_PER_PIXEL).toBeCloseTo(1 / 175);
  });

  it('ignores non-numeric and empty values instead of poisoning the camera with NaN', () => {
    const dials = parseCameraDials('?pitchFar=&fov=abc&zoomMax=');
    // A blank angle falls back to the shipped default rather than to NaN —
    // one empty query param must never tilt the camera to an undefined pitch.
    expect(dials.curve?.polarFar).toBeCloseTo(rad(DEFAULT_PITCH_FAR_DEG));
    expect(dials.fovDeg).toBe(DEFAULT_PERSP_FOV_DEG);
    expect(dials.zoomMax).toBe(DEFAULT_ZOOM_MAX);
    expect(dials.minDistance).toBe(DEFAULT_MIN_DISTANCE);
    expect(dials.maxDistance).toBe(DEFAULT_MAX_DISTANCE);
  });
});

describe('which bands chase the character', () => {
  const bandsOf = (search = '') => parseCameraDials(search).curve!.bands;

  it('leaves the three wide bands parked where the player framed them', () => {
    // overview, tabletop, tactical -- Kirk 2026-08-28: "the camera should
    // stay put". Pulled back, the framing is a planning decision the player
    // made on purpose.
    expect(
      bandsOf()
        .slice(0, 3)
        .map((band) => band.follow)
    ).toEqual([false, false, false]);
  });

  it('keeps the two close bands behind the character', () => {
    // shoulder and detail exist to sit on the mini; a character who walks out
    // of frame there is simply lost.
    expect(
      bandsOf()
        .slice(3)
        .map((band) => band.follow)
    ).toEqual([true, true]);
  });

  it('agrees with the focusLead gradient about where a map becomes a viewpoint', () => {
    // The two dials encode the same "closeness" idea; if they ever disagree
    // the camera reads as following something it is not framing.
    for (const band of bandsOf()) {
      if (band.focusLead === 0) expect(band.follow).toBe(false);
    }
    expect(bandsOf().filter((band) => band.follow).length).toBe(2);
  });

  it('survives a zoom retune -- the policy is per band, not per zoom number', () => {
    expect(
      bandsOf('?zoomMin=10&zoomMax=200').map((band) => band.follow)
    ).toEqual([false, false, false, true, true]);
  });
});

describe('bandFollowsFocus', () => {
  it('honours the band it is given', () => {
    expect(bandFollowsFocus({ follow: false }, false)).toBe(false);
    expect(bandFollowsFocus({ follow: true }, false)).toBe(true);
  });

  it('follows when there is no band to consult', () => {
    // `?pitchCurve=0`'s fixed angle has no ladder; the band ladder is what
    // earns the exception, so its absence keeps the old behavior.
    expect(bandFollowsFocus(null, false)).toBe(true);
    expect(bandFollowsFocus(undefined, false)).toBe(true);
  });

  it('follows in perspective, which has no authored bands of its own', () => {
    expect(bandFollowsFocus({ follow: false }, true)).toBe(true);
    expect(bandFollowsFocus(null, true)).toBe(true);
  });
});
