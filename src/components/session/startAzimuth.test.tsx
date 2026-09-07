/**
 * Where the camera actually ends up.
 *
 * THIS TEST EXISTS BECAUSE THE FIRST CUT OF THIS FEATURE MOVED NOTHING.
 * It set the `<Canvas camera={{ position }}>` prop, which
 * `useCameraControls`' mount effect overwrites before the first frame by
 * computing the seat from its own azimuth and calling
 * `camera.position.set(...)`. Every unit test passed and every wiring
 * test passed, because none of them ever asked where a camera was.
 *
 * So this one mounts the REAL hook through `@react-three/test-renderer`
 * and reads `camera.position` after mount. Ask of it what has to break for
 * it to fail, and the answer is the azimuth seed — which is the thing the
 * feature is.
 *
 * The expected seats are computed from the hook's OWN unchanged geometry
 * rather than typed as floats, so a change to distance, polar angle or
 * focus lead moves the baseline with the code instead of failing here for
 * the wrong reason. What is asserted is the relationship: same height,
 * same radius, bearing rotated.
 */
import { useCameraControls } from '@/components/hex-grid/useCameraControls';
import { useThree } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useEffect } from 'react';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AZIMUTH, startAzimuth } from './startAzimuth';

/** The origin — the hook orbits whatever it is given, so the simplest
 * target keeps the arithmetic in these assertions readable. */
const TARGET = new THREE.Vector3(0, 0, 0);

/** Mounts the real hook and reports where it left the camera. Reading the
 * camera through `useThree` rather than the renderer's internals: the
 * component sees the same object the hook writes to, and no test here
 * depends on R3F's private shape. */
function Probe({
  facing,
  onSeat,
}: {
  facing?: string;
  onSeat: (seat: { x: number; y: number; z: number }) => void;
}) {
  const { camera } = useThree();
  useCameraControls({
    target: TARGET,
    initialAzimuth: startAzimuth(facing),
  });
  // AFTER the hook's own mount effect, which is what seats the camera:
  // effects run in declaration order, and this component declares its
  // one second.
  useEffect(() => {
    const { x, y, z } = camera.position;
    onSeat({ x, y, z });
  });
  return null;
}

async function seatFor(facing?: string) {
  let seat: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  const renderer = await ReactThreeTestRenderer.create(
    <Probe facing={facing} onSeat={(s) => (seat = s)} />
  );
  await renderer.unmount();
  const { x, y, z } = seat;
  return { x, y, z, radius: Math.hypot(x, z), bearing: Math.atan2(z, x) };
}

const TWO_PI = Math.PI * 2;
/** Signed difference between two bearings, wrapped to (-π, π]. */
const bearingDelta = (a: number, b: number) =>
  ((a - b + Math.PI * 3) % TWO_PI) - Math.PI;

describe('the camera seat after the hook has mounted', () => {
  it('is the SAME seat for no start, an empty facing, and nw', async () => {
    // Today's behaviour, unchanged, three ways of asking for it. The
    // historical azimuth is 45°, which is the seat for a party facing
    // nw — so this feature is a rotation of the seat we already had, and
    // every dungeon written before it keeps exactly what it had.
    const none = await seatFor(undefined);
    const empty = await seatFor('');
    const nw = await seatFor('nw');
    expect(empty).toEqual(none);
    expect(nw.x).toBeCloseTo(none.x, 6);
    expect(nw.y).toBeCloseTo(none.y, 6);
    expect(nw.z).toBeCloseTo(none.z, 6);
    // And that seat really is the hook's own default bearing.
    expect(startAzimuth('nw')).toBeCloseTo(DEFAULT_AZIMUTH, 6);
  });

  it('is today’s seat for a word the client does not know', async () => {
    const none = await seatFor(undefined);
    expect(await seatFor('widdershins')).toEqual(none);
    // Not fooled by an inherited property name, either.
    expect(await seatFor('constructor')).toEqual(none);
  });

  it('puts the camera BEHIND a party facing north — at +Z', async () => {
    // North is -90° in the table-angle convention, so a party looking
    // north has the camera to its south: +Z.
    const north = await seatFor('n');
    const none = await seatFor(undefined);
    expect(north.z).toBeGreaterThan(0);
    expect(north.x).toBeCloseTo(0, 6);
    // Same height and same radius as always — only the bearing moved.
    expect(north.y).toBeCloseTo(none.y, 6);
    expect(north.radius).toBeCloseTo(none.radius, 6);
  });

  it('rotates the bearing by exactly the facing, for east and south', async () => {
    const none = await seatFor(undefined);
    for (const [facing, turnDeg] of [
      // Each is measured against nw, the facing today's seat already is.
      ['e', 180 - -135 - 180],
      ['s', 90 - -135],
    ] as const) {
      const seat = await seatFor(facing);
      expect(seat.y).toBeCloseTo(none.y, 6);
      expect(seat.radius).toBeCloseTo(none.radius, 6);
      expect(bearingDelta(seat.bearing, none.bearing)).toBeCloseTo(
        bearingDelta((turnDeg * Math.PI) / 180, 0),
        6
      );
    }
  });

  it('every facing keeps the calibrated height and radius', async () => {
    // Only the compass bearing moves. Height and radius are free of the
    // azimuth in `updateCamera`, and this proves it end to end rather
    // than by reading the formula.
    const none = await seatFor(undefined);
    for (const facing of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      const seat = await seatFor(facing);
      expect(seat.y).toBeCloseTo(none.y, 6);
      expect(seat.radius).toBeCloseTo(none.radius, 6);
    }
  });
});
