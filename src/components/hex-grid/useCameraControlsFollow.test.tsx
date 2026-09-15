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
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCameraDials, touchViewAtZoom } from './cameraDials';
import { useCameraControls } from './useCameraControls';

const dials = parseCameraDials('');
beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

function Probe({
  target,
  focusTarget,
  onQuickRightClick,
  onCanvas,
  touchPanEnabled,
  touchPinchEnabled,
  touchRotateEnabled,
  focusRequest,
  onCamera,
}: {
  target: THREE.Vector3;
  focusTarget: THREE.Vector3;
  onQuickRightClick?: () => void;
  onCanvas?: (canvas: HTMLCanvasElement) => void;
  touchPanEnabled?: boolean;
  touchPinchEnabled?: boolean;
  touchRotateEnabled?: boolean;
  focusRequest?: number;
  onCamera?: (camera: THREE.Camera) => void;
}) {
  const { gl, camera } = useThree();
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
    touchPanEnabled,
    touchPinchEnabled,
    touchRotateEnabled,
    focusRequest,
  });
  useEffect(() => {
    onCanvas?.(gl.domElement);
    onCamera?.(camera);
  }, [gl.domElement, camera, onCanvas, onCamera]);
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

describe('opt-in touch camera pan', () => {
  it('anchors clockwise twist and centers on demand without resetting zoom or heading', async () => {
    const target = new THREE.Vector3();
    const focus = new THREE.Vector3();
    let canvas: HTMLCanvasElement | undefined;
    const rig = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
    rig.zoom = 80;
    rig.updateProjectionMatrix();
    const probe = (request: number) => (
      <Probe
        target={target}
        focusTarget={focus}
        touchPanEnabled
        touchPinchEnabled
        touchRotateEnabled
        focusRequest={request}
        onCanvas={(value) => {
          canvas = value;
        }}
      />
    );
    const renderer = await ReactThreeTestRenderer.create(probe(0), {
      camera: rig,
    });
    if (!canvas) throw new Error('missing canvas');
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    rig.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), rig);
    const anchor = ray.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Vector3()
    )!;
    const emit = (type: string, id: number, x: number, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      Object.defineProperties(event, {
        pointerId: { value: id },
        pointerType: { value: 'touch' },
      });
      (type === 'pointerdown' ? canvas! : window).dispatchEvent(event);
    };
    const angle = (20 * Math.PI) / 180;
    const x = 300 + 260 * Math.cos(angle),
      y = 300 + 260 * Math.sin(angle);
    emit('pointerdown', 1, 300, 300);
    emit('pointerdown', 2, 500, 300);
    emit('pointermove', 2, x, y);
    expect(rig.zoom).toBeCloseTo(104);
    const direction = rig.getWorldDirection(new THREE.Vector3());
    expect(Math.atan2(-direction.z, -direction.x)).toBeCloseTo(
      Math.PI / 4 - (12 * Math.PI) / 180
    );
    rig.updateMatrixWorld();
    expect(anchor.clone().project(rig).x).toBeCloseTo(
      ((300 + x) / 2 / 800) * 2 - 1,
      7
    );
    expect(anchor.clone().project(rig).y).toBeCloseTo(
      1 - ((300 + y) / 2 / 600) * 2,
      7
    );
    emit('pointerup', 1, 300, 300);
    emit('pointerup', 2, x, y);
    const rotation = rig.quaternion.clone();
    expect(target.length()).toBeGreaterThan(0.01);
    await renderer.update(probe(1));
    await renderer.advanceFrames(180, 1 / 60);
    expect(target.distanceTo(focus)).toBeLessThan(0.01);
    expect(rig.zoom).toBeCloseTo(104);
    expect(rig.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    await renderer.unmount();
  });
  it('smoothly reaches shoulder while anchoring pinch, then resumes the PC wheel bands', async () => {
    const target = new THREE.Vector3();
    let canvas: HTMLCanvasElement | undefined;
    let camera: THREE.OrthographicCamera | undefined;
    // The external test renderer imports its own Three instance. Supply the
    // same concrete camera class as this hook so instanceof branches are tested.
    const rig = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
    rig.zoom = 80;
    rig.updateProjectionMatrix();
    const renderer = await ReactThreeTestRenderer.create(
      <Probe
        target={target}
        focusTarget={new THREE.Vector3()}
        touchPanEnabled
        touchPinchEnabled
        onCanvas={(value) => {
          canvas = value;
        }}
        onCamera={(value) => {
          camera = value as THREE.OrthographicCamera;
        }}
      />,
      { camera: rig }
    );
    if (!camera || !canvas) throw new Error('missing camera/canvas');
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
    const rotation = camera.quaternion.clone();
    const polar = () =>
      Math.acos(-camera!.getWorldDirection(new THREE.Vector3()).y);
    camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(-0.25, 0), camera);
    const anchor = ray.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Vector3()
    )!;
    const emit = (type: string, id: number, x: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: 300,
      });
      Object.defineProperties(event, {
        pointerId: { value: id },
        pointerType: { value: 'touch' },
      });
      (type === 'pointerdown' ? canvas! : window).dispatchEvent(event);
    };
    emit('pointerdown', 1, 200);
    emit('pointerdown', 2, 400);
    emit('pointermove', 2, 460);
    expect(camera.zoom).toBeCloseTo(104);
    expect(polar()).toBeCloseTo(
      touchViewAtZoom({ zoom: 104, bands: dials.curve!.bands })!.polar
    );
    expect(camera.quaternion.angleTo(rotation)).toBeGreaterThan(0.01);
    camera.updateMatrixWorld();
    expect(anchor.clone().project(camera).x).toBeCloseTo(
      (330 / 800) * 2 - 1,
      7
    );
    expect(anchor.clone().project(camera).y).toBeCloseTo(0, 7);
    emit('pointermove', 2, 1200);
    expect(camera.zoom).toBe(dials.zoomMax);
    expect(polar()).toBeCloseTo(dials.curve!.bands[3]!.polar);
    emit('pointermove', 2, 220);
    expect(camera.zoom).toBe(dials.zoomMin);
    expect(camera.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    emit('pointerup', 1, 200);
    emit('pointerup', 2, 220);
    canvas.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, cancelable: true })
    );
    expect(camera.zoom).toBe(dials.curve!.bands[1]!.zoom);
    expect(polar()).toBeCloseTo(dials.curve!.bands[1]!.polar);
    await renderer.unmount();
  });
  it.each([false, true])(
    'uses the existing pan projection only when enabled=%s',
    async (enabled) => {
      let canvas: HTMLCanvasElement | undefined;
      const target = new THREE.Vector3();
      const renderer = await ReactThreeTestRenderer.create(
        <Probe
          target={target}
          focusTarget={new THREE.Vector3()}
          touchPanEnabled={enabled}
          onCanvas={(element) => {
            canvas = element;
          }}
        />,
        { orthographic: true, camera: { zoom: 80 } }
      );
      if (!canvas) throw new Error('missing canvas');
      const emit = (type: string, x: number) => {
        const event = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: 20,
        });
        Object.defineProperties(event, {
          pointerId: { value: 1 },
          pointerType: { value: 'touch' },
        });
        (type === 'pointerdown' ? canvas! : window).dispatchEvent(event);
      };
      emit('pointerdown', 20);
      emit('pointermove', 60);
      emit('pointerup', 60);
      if (enabled) {
        expect(target.length()).toBeCloseTo(40 / 80);
        const parked = target.clone();
        await renderer.advanceFrames(10, 0.016);
        expect(target.distanceTo(parked)).toBeLessThan(0.001);
      } else {
        expect(target.length()).toBe(0);
      }
      await renderer.unmount();
    }
  );
});

describe('auto-centre respects the camera band', () => {
  it.each([
    { start: 80, end: 120, follow: true },
    { start: 140, end: 42, follow: false },
    { start: 80, end: 94, follow: false },
    { start: 80, end: 96, follow: true },
  ])(
    'uses the nearest CURRENT band after pinch $start -> $end (follow=$follow)',
    async ({ start, end, follow }) => {
      const target = new THREE.Vector3();
      let canvas: HTMLCanvasElement | undefined;
      const rig = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
      rig.zoom = start;
      rig.updateProjectionMatrix();
      const probe = (focus: THREE.Vector3) => (
        <Probe
          target={target}
          focusTarget={focus}
          touchPanEnabled
          touchPinchEnabled
          onCanvas={(value) => {
            canvas = value;
          }}
        />
      );
      const renderer = await ReactThreeTestRenderer.create(
        probe(new THREE.Vector3()),
        { camera: rig }
      );
      try {
        if (!canvas) throw new Error('missing canvas');
        canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
        await renderer.advanceFrames(10, 1 / 60);
        const emit = (type: string, id: number, x: number) => {
          const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: 300,
          });
          Object.defineProperties(event, {
            pointerId: { value: id },
            pointerType: { value: 'touch' },
          });
          (type === 'pointerdown' ? canvas! : window).dispatchEvent(event);
        };
        const endX = 200 + (200 * end) / start;
        emit('pointerdown', 1, 200);
        emit('pointerdown', 2, 400);
        emit('pointermove', 2, endX);
        emit('pointerup', 1, 200);
        emit('pointerup', 2, endX);
        expect(rig.zoom).toBeCloseTo(end);
        // Measure follow separately from the pinch's deliberate anchor translation.
        const parked = target.clone();
        const moved = new THREE.Vector3(20, 0, 20);
        await renderer.update(probe(moved));
        await renderer.advanceFrames(240, 1 / 60);
        if (follow) expect(target.distanceTo(moved)).toBeLessThan(0.01);
        else expect(target.distanceTo(parked)).toBeLessThan(0.001);
      } finally {
        await renderer.unmount();
      }
    }
  );
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
