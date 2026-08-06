import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_DISTANCE,
  DEFAULT_MIN_DISTANCE,
  DEFAULT_PERSP_FOV_DEG,
  DEFAULT_PITCH_FAR_DEG,
  DEFAULT_PITCH_NEAR_DEG,
  parseCameraDials,
} from './cameraDials';

const rad = (d: number) => (d * Math.PI) / 180;

describe('parseCameraDials', () => {
  it('with no query params is entirely off — the grid keeps its fixed-angle orthographic rig', () => {
    const dials = parseCameraDials('');
    expect(dials.perspective).toBe(false);
    expect(dials.curve).toBeNull();
    expect(dials.zoomMax).toBeNull();
  });

  it('?pitchCurve=1 alone yields a curve wide enough to actually see', () => {
    // The ?wallCutaway=1 papercut: a flag whose defaults composed into
    // something barely distinguishable from off. A 25-degree swing is not
    // subtle, which is the point.
    const { curve } = parseCameraDials('?pitchCurve=1');
    expect(curve).not.toBeNull();
    expect(curve?.polarFar).toBeCloseTo(rad(DEFAULT_PITCH_FAR_DEG));
    expect(curve?.polarNear).toBeCloseTo(rad(DEFAULT_PITCH_NEAR_DEG));
    expect(DEFAULT_PITCH_NEAR_DEG - DEFAULT_PITCH_FAR_DEG).toBeGreaterThan(20);
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

  it('carries dolly range and zoom ceiling overrides', () => {
    const dials = parseCameraDials('?minDist=3&maxDist=64&zoomMax=260');
    expect(dials.minDistance).toBe(3);
    expect(dials.maxDistance).toBe(64);
    expect(dials.zoomMax).toBe(260);
  });

  it('ignores non-numeric and empty values instead of poisoning the camera with NaN', () => {
    const dials = parseCameraDials('?pitchFar=&fov=abc&zoomMax=');
    expect(dials.curve).toBeNull();
    expect(dials.fovDeg).toBe(DEFAULT_PERSP_FOV_DEG);
    expect(dials.zoomMax).toBeNull();
    expect(dials.minDistance).toBe(DEFAULT_MIN_DISTANCE);
    expect(dials.maxDistance).toBe(DEFAULT_MAX_DISTANCE);
  });
});
