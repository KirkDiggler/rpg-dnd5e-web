import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_DISTANCE,
  DEFAULT_MIN_DISTANCE,
  DEFAULT_PERSP_FOV_DEG,
  DEFAULT_PITCH_FAR_DEG,
  DEFAULT_PITCH_NEAR_DEG,
  DEFAULT_ZOOM_MAX,
  DEFAULT_ZOOM_MIN,
  parseCameraDials,
} from './cameraDials';

const rad = (d: number) => (d * Math.PI) / 180;

describe('parseCameraDials', () => {
  it('with no query params leaves projection and pitch alone — orthographic, single fixed angle', () => {
    const dials = parseCameraDials('');
    expect(dials.perspective).toBe(false);
    expect(dials.curve).toBeNull();
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

  it('starts partway up the range, so the landing view is neither extreme of the curve', () => {
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

  it('?camera=persp is independent of the pitch curve — either alone is a legible experiment', () => {
    const perspOnly = parseCameraDials('?camera=persp');
    expect(perspOnly.perspective).toBe(true);
    expect(perspOnly.curve).toBeNull();

    const curveOnly = parseCameraDials('?pitchCurve=1');
    expect(curveOnly.perspective).toBe(false);
    expect(curveOnly.curve).not.toBeNull();
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

  it('ignores non-numeric and empty values instead of poisoning the camera with NaN', () => {
    const dials = parseCameraDials('?pitchFar=&fov=abc&zoomMax=');
    expect(dials.curve).toBeNull();
    expect(dials.fovDeg).toBe(DEFAULT_PERSP_FOV_DEG);
    expect(dials.zoomMax).toBe(DEFAULT_ZOOM_MAX);
    expect(dials.minDistance).toBe(DEFAULT_MIN_DISTANCE);
    expect(dials.maxDistance).toBe(DEFAULT_MAX_DISTANCE);
  });
});
