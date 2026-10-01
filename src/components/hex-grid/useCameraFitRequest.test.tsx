import { useThree } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useEffect } from 'react';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCameraDials } from './cameraDials';
import { useCameraControls } from './useCameraControls';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
const dials = parseCameraDials('');
const bounds = { centerX: 12, centerZ: 7, width: 8, height: 4 };
function Probe({
  target,
  fitRequest,
  centerX = 12,
}: {
  target: THREE.Vector3;
  fitRequest?: number;
  centerX?: number;
}): null {
  const { gl } = useThree();
  useEffect(() => {
    Object.defineProperties(gl.domElement, {
      clientWidth: { value: 1200, configurable: true },
      clientHeight: { value: 800, configurable: true },
    });
  }, [gl]);
  useCameraControls({
    target,
    minZoom: dials.zoomMin,
    maxZoom: dials.zoomMax,
    curve: dials.curve,
    revealedBounds: { ...bounds, centerX },
    fitRequest,
  });
  return null;
}

describe('explicit known-floor camera fit requests', () => {
  it('fits on a supplied initial request and changed counter, not bounds changes', async () => {
    const target = new THREE.Vector3(0, 0, 0);
    const renderer = await ReactThreeTestRenderer.create(
      <Probe target={target} fitRequest={0} />,
      { camera: new THREE.OrthographicCamera(-600, 600, 400, -400, 0.1, 1000) }
    );
    await renderer.advanceFrames(1, 0.016);
    expect(target.x).toBe(12);
    expect(target.z).toBe(7);
    target.x = 99; // A manual pan must survive unrelated renders.
    await renderer.update(
      <Probe target={target} fitRequest={0} centerX={20} />
    );
    await renderer.advanceFrames(1, 0.016);
    expect(target.x).toBe(99);
    await renderer.update(
      <Probe target={target} fitRequest={1} centerX={20} />
    );
    await renderer.advanceFrames(1, 0.016);
    expect(target.x).toBe(20);
    await renderer.unmount();
  });

  it('preserves existing callers when fitRequest is omitted', async () => {
    const target = new THREE.Vector3(3, 0, 2);
    const renderer = await ReactThreeTestRenderer.create(
      <Probe target={target} />,
      { camera: new THREE.OrthographicCamera(-600, 600, 400, -400, 0.1, 1000) }
    );
    await renderer.advanceFrames(1, 0.016);
    expect(target.x).toBe(3);
    expect(target.z).toBe(2);
    await renderer.update(<Probe target={target} centerX={30} />);
    await renderer.advanceFrames(1, 0.016);
    expect(target.x).toBe(3);
    await renderer.unmount();
  });
});
