/**
 * The behaviour Kirk asked for on 2026-08-28: "if the camera is in tabletop or
 * tactical and I move the camera should not center on me. the camera should
 * stay put."
 *
 * cameraDials.test.ts pins WHICH bands follow. This pins that the hook
 * actually obeys them — mounting the real hook in a real R3F tree and moving
 * the focus target, because the policy data being right is worth nothing if
 * the effect ignores it.
 */
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseCameraDials } from './cameraDials';
import { useCameraControls } from './useCameraControls';

const dials = parseCameraDials('');

function Probe({
  target,
  focusTarget,
}: {
  target: THREE.Vector3;
  focusTarget: THREE.Vector3;
}) {
  useCameraControls({
    target,
    focusTarget,
    minZoom: dials.zoomMin,
    maxZoom: dials.zoomMax,
    curve: dials.curve,
    perspective: false,
    minDistance: dials.minDistance,
    maxDistance: dials.maxDistance,
  });
  return null;
}

/** Mount at a zoom that resolves to the band under test, walk the character
 * to a new cell, and report how far the camera's orbit target travelled. */
async function targetDriftAfterMove(zoom: number): Promise<number> {
  const target = new THREE.Vector3(0, 0, 0);
  const renderer = await ReactThreeTestRenderer.create(
    <Probe target={target} focusTarget={new THREE.Vector3(0, 0, 0)} />,
    { orthographic: true, camera: { zoom } }
  );
  await renderer.advanceFrames(10, 16);
  const before = target.clone();

  // The character walks well clear of where they were.
  await renderer.update(
    <Probe target={target} focusTarget={new THREE.Vector3(20, 0, 20)} />
  );
  await renderer.advanceFrames(120, 16);

  return target.distanceTo(before);
}

describe('auto-centre respects the camera band', () => {
  it('stays put in the tactical band', async () => {
    expect(await targetDriftAfterMove(dials.zoomStart)).toBeLessThan(0.01);
  });

  it('stays put in the tabletop band', async () => {
    const tabletopZoom = dials.curve!.bands[1]!.zoom;
    expect(await targetDriftAfterMove(tabletopZoom)).toBeLessThan(0.01);
  });

  it('stays put in the widest overview band', async () => {
    expect(await targetDriftAfterMove(dials.zoomMin)).toBeLessThan(0.01);
  });

  it('still follows in the shoulder band', async () => {
    // The close bands exist to sit behind the character; losing them there
    // would be the opposite bug.
    expect(
      await targetDriftAfterMove(dials.curve!.bands[3]!.zoom)
    ).toBeGreaterThan(1);
  });

  it('still follows in the detail band', async () => {
    expect(await targetDriftAfterMove(dials.zoomMax)).toBeGreaterThan(1);
  });
});
