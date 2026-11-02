import { useThree } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, expect, it } from 'vitest';
import { parseCameraDials } from './cameraDials';
import {
  useCameraControls,
  type CameraPresentationFocus,
} from './useCameraControls';
const dials = parseCameraDials('');
beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
function Probe({
  target,
  presentationFocus,
  focusRequest = 0,
  capture,
}: {
  target: THREE.Vector3;
  presentationFocus?: CameraPresentationFocus | null;
  focusRequest?: number;
  capture: (camera: THREE.Camera) => void;
}) {
  const { camera } = useThree();
  capture(camera);
  useCameraControls({
    target,
    focusTarget: new THREE.Vector3(0, 0, 0),
    presentationFocus,
    focusRequest,
    curve: dials.curve,
  });
  return null;
}
it('centers once per presentation key without changing zoom/angle or Center on me', async () => {
  const target = new THREE.Vector3();
  let camera!: THREE.Camera;
  const capture = (value: THREE.Camera) => {
    camera = value;
  };
  const renderer = await ReactThreeTestRenderer.create(
    <Probe target={target} capture={capture} />,
    { orthographic: true, camera: { zoom: 80 } }
  );
  await renderer.advanceFrames(2, 0.016);
  const rotation = camera.quaternion.clone();
  const request = { key: 'turn-1', position: new THREE.Vector3(20, 0, 10) };
  await renderer.update(
    <Probe target={target} capture={capture} presentationFocus={request} />
  );
  await renderer.advanceFrames(240, 0.016);
  expect(target.distanceTo(request.position)).toBeLessThan(0.02);
  expect((camera as THREE.OrthographicCamera).zoom).toBe(80);
  expect(camera.quaternion.angleTo(rotation)).toBeLessThan(0.0001);
  await renderer.update(
    <Probe
      target={target}
      capture={capture}
      presentationFocus={{
        key: 'turn-1',
        position: new THREE.Vector3(40, 0, 20),
      }}
    />
  );
  await renderer.advanceFrames(240, 0.016);
  expect(target.distanceTo(request.position)).toBeLessThan(0.02);
  await renderer.update(
    <Probe
      target={target}
      capture={capture}
      presentationFocus={null}
      focusRequest={1}
    />
  );
  await renderer.advanceFrames(240, 0.016);
  expect(target.length()).toBeLessThan(0.02);
  await renderer.unmount();
});
it('cancels only its own unfinished automatic pan when disabled', async () => {
  const target = new THREE.Vector3();
  const capture = () => {};
  const renderer = await ReactThreeTestRenderer.create(
    <Probe target={target} capture={capture} />,
    { orthographic: true, camera: { zoom: 80 } }
  );
  await renderer.update(
    <Probe
      target={target}
      capture={capture}
      presentationFocus={{ key: 'turn', position: new THREE.Vector3(50, 0, 0) }}
    />
  );
  await renderer.advanceFrames(1, 0.016);
  await renderer.update(
    <Probe target={target} capture={capture} presentationFocus={null} />
  );
  expect(target.length()).toBeGreaterThan(0);
  const stopped = target.clone();
  await renderer.advanceFrames(240, 0.016);
  expect(target.distanceTo(stopped)).toBeLessThan(0.001);
  await renderer.unmount();
});
