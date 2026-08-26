import { render } from '@testing-library/react';
import { PerspectiveCamera, Vector3, type Camera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrayPlaneProjection } from './trayPlaneProjection';

type TestThreeState = {
  camera: Camera;
  gl: { domElement: HTMLElement };
  size: { width: number; height: number };
};

const threeState = vi.hoisted(() => ({
  camera: undefined as Camera | undefined,
  gl: { domElement: undefined as HTMLElement | undefined },
  size: { width: 200, height: 200 },
}));

vi.mock('@react-three/fiber', () => ({
  useThree: <T,>(selector: (state: TestThreeState) => T): T =>
    selector(threeState as TestThreeState),
}));

import { TrayPlaneProjectionBridge } from './TrayPlaneProjectionBridge';

const rectWithPosition = (
  left: number,
  top: number,
  width = 200,
  height = 200
): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({ left, top, width, height }),
  }) as DOMRect;

describe('TrayPlaneProjectionBridge lifecycle', () => {
  afterEach(() => {
    threeState.camera = undefined;
    threeState.gl.domElement = undefined;
  });

  it('refreshes same-size canvas position at query time and clears on unmount', () => {
    const camera = new PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 4, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(new Vector3(0, 0, 0));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const canvas = document.createElement('canvas');
    let rect = rectWithPosition(10, 20);
    canvas.getBoundingClientRect = () => rect;
    threeState.camera = camera;
    threeState.gl.domElement = canvas;

    const projectionRef: {
      current: TrayPlaneProjection | undefined;
    } = { current: undefined };
    const onProjection = vi.fn();
    const view = render(
      <TrayPlaneProjectionBridge
        origin={[0, 0, 0]}
        xAxis={[1, 0, 0]}
        yAxis={[0, 0, 1]}
        width={2}
        height={2}
        projectionRef={projectionRef}
        onProjection={onProjection}
      />
    );

    const initial = projectionRef.current?.planeToScreen([0, 0]);
    expect(initial).toBeDefined();

    rect = rectWithPosition(50, 70);
    const moved = projectionRef.current?.planeToScreen([0, 0]);
    expect(moved).toEqual([initial![0] + 40, initial![1] + 50]);

    view.unmount();
    expect(projectionRef.current).toBeUndefined();
    expect(onProjection).toHaveBeenLastCalledWith(undefined);
  });
});
