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
import { useThree } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useEffect } from 'react';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { parseCameraDials } from './cameraDials';
import { useCameraControls } from './useCameraControls';

const dials = parseCameraDials('');

function Probe({
  target,
  focusTarget,
  onQuickRightClick,
  onCanvas,
}: {
  target: THREE.Vector3;
  focusTarget: THREE.Vector3;
  onQuickRightClick?: () => void;
  onCanvas?: (canvas: HTMLCanvasElement) => void;
}) {
  const { gl } = useThree();
  useCameraControls({
    target,
    focusTarget,
    minZoom: dials.zoomMin,
    maxZoom: dials.zoomMax,
    curve: dials.curve,
    perspective: false,
    minDistance: dials.minDistance,
    maxDistance: dials.maxDistance,
    onQuickRightClick,
  });
  useEffect(() => {
    onCanvas?.(gl.domElement);
  }, [gl.domElement, onCanvas]);
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

describe('right mouse gesture', () => {
  async function mountGesture(onQuickRightClick: () => void) {
    let canvas: HTMLCanvasElement | undefined;
    const target = new THREE.Vector3(0, 0, 0);
    const renderer = await ReactThreeTestRenderer.create(
      <Probe
        target={target}
        focusTarget={new THREE.Vector3(0, 0, 0)}
        onQuickRightClick={onQuickRightClick}
        onCanvas={(element) => {
          canvas = element;
        }}
      />,
      { orthographic: true }
    );
    if (!canvas) throw new Error('camera canvas was not captured');
    return { canvas, renderer, target };
  }

  it('reports a quick right click', async () => {
    const cancel = vi.fn();
    const { canvas } = await mountGesture(cancel);

    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 40, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: 43, clientY: 64 })
    );
    const menu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(menu);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(menu.defaultPrevented).toBe(true);

    // The camera listens on its own map canvas, not on global UI surfaces.
    document.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 40, clientY: 60 })
    );
    document.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: 40, clientY: 60 })
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('pans without cancelling after an out-and-back right drag', async () => {
    const cancel = vi.fn();
    const { canvas, target } = await mountGesture(cancel);

    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 40, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: 50, clientY: 60 })
    );
    expect(target.length()).toBeGreaterThan(0);
    window.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: 40, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: 40, clientY: 60 })
    );

    expect(cancel).not.toHaveBeenCalled();
  });

  it('tracks a right drag outside the canvas and releases it without cancelling', async () => {
    const cancel = vi.fn();
    const { canvas, renderer, target } = await mountGesture(cancel);
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 2, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: -40, clientY: 60 })
    );
    expect(target.length()).toBeGreaterThan(0);
    window.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: 2, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: 2, clientY: 60 })
    );
    expect(cancel).not.toHaveBeenCalled();

    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 2, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: -40, clientY: 60 })
    );
    const released = target.clone();
    canvas.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: 50, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: 50, clientY: 60 })
    );
    expect(target.equals(released)).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
    await renderer.unmount();
  });

  it('abandons an active right gesture on focus loss without cancelling', async () => {
    const cancel = vi.fn();
    const { canvas, renderer, target } = await mountGesture(cancel);
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 40, clientY: 60 })
    );
    window.dispatchEvent(new Event('blur'));
    canvas.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: 80, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: 80, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: 40, clientY: 60 })
    );
    expect(target.length()).toBe(0);
    expect(cancel).not.toHaveBeenCalled();
    await renderer.unmount();
  });

  it('removes quick-right-click listeners on cleanup', async () => {
    const cancel = vi.fn();
    const { canvas, renderer, target } = await mountGesture(cancel);
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 40, clientY: 60 })
    );
    await renderer.unmount();
    window.dispatchEvent(
      new MouseEvent('mousemove', { button: 2, clientX: 80, clientY: 60 })
    );
    window.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: 40, clientY: 60 })
    );
    expect(target.length()).toBe(0);

    canvas.dispatchEvent(
      new MouseEvent('mousedown', { button: 2, clientX: 40, clientY: 60 })
    );
    canvas.dispatchEvent(
      new MouseEvent('mouseup', { button: 2, clientX: 40, clientY: 60 })
    );

    expect(cancel).not.toHaveBeenCalled();
  });
});

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
