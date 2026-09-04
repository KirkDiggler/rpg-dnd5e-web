import { CAMERA_OFFSET } from '@/rendering/calibrationConstants';
import { describe, expect, it } from 'vitest';
import { startCameraOffset } from './startCamera';

describe('startCameraOffset — aiming the first frame', () => {
  it('is TODAY’S SEAT, identically, when no facing is stated', () => {
    // `AtlasStart.facing`'s own contract: empty means the author stated
    // none, and a client that finds it empty "aims the camera exactly as
    // it does today". Identity, not approximation — the cheapest possible
    // proof that nothing moved.
    expect(startCameraOffset(undefined)).toBe(CAMERA_OFFSET);
    expect(startCameraOffset('')).toBe(CAMERA_OFFSET);
  });

  it('is today’s seat for an unrecognised word, too', () => {
    // The eight names are the server's to enforce. A camera pointed at a
    // guess is worse than one pointed where it has always pointed.
    expect(startCameraOffset('widdershins')).toBe(CAMERA_OFFSET);
    // And not fooled by an inherited property name.
    expect(startCameraOffset('constructor')).toBe(CAMERA_OFFSET);
  });

  it('proves today’s fixed seat IS the north-west seat', () => {
    // `CAMERA_OFFSET` is [8, 10, 8] — south-east of the target, looking
    // north-west. So the old always-the-same behaviour was never
    // arbitrary, and this change is a rotation of it rather than a
    // replacement.
    const [x, y, z] = startCameraOffset('nw');
    expect(x).toBeCloseTo(CAMERA_OFFSET[0]);
    expect(y).toBe(CAMERA_OFFSET[1]);
    expect(z).toBeCloseTo(CAMERA_OFFSET[2]);
  });

  it('puts the camera BEHIND the party for each of the eight', () => {
    // East is +X and south is +Z (facingYaw.ts's table-angle convention),
    // so a party looking east has the camera to its west: negative X.
    const radius = Math.hypot(CAMERA_OFFSET[0], CAMERA_OFFSET[2]);
    const cases: Record<string, [number, number]> = {
      e: [-radius, 0],
      w: [radius, 0],
      s: [0, -radius],
      n: [0, radius],
    };
    for (const [facing, [x, z]] of Object.entries(cases)) {
      const seat = startCameraOffset(facing);
      expect(seat[0]).toBeCloseTo(x);
      expect(seat[2]).toBeCloseTo(z);
    }
  });

  it('keeps the calibrated height and radius for every facing', () => {
    // Only the compass bearing moves. The tabletop pitch Kirk calibrated
    // is the ratio of height to radius, and a facing that changed either
    // would change the whole look of the board.
    const radius = Math.hypot(CAMERA_OFFSET[0], CAMERA_OFFSET[2]);
    for (const facing of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      const [x, y, z] = startCameraOffset(facing);
      expect(y).toBe(CAMERA_OFFSET[1]);
      expect(Math.hypot(x, z)).toBeCloseTo(radius);
    }
  });
});
