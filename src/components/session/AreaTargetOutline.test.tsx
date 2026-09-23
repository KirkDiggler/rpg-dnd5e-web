import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { expect, it } from 'vitest';
import { NON_INTERACTIVE_FOOTPRINT_RAYCAST } from './AreaFootprintPreview';
import { AreaTargetOutline } from './AreaTargetOutline';
it('draws an opaque noninteractive outline above the area overlay', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <AreaTargetOutline position={{ x: 1, y: -1, z: 0 }} hexSize={1} />
  );
  const line = renderer.scene.findByType('LineLoop').instance as THREE.LineLoop;
  expect(line.renderOrder).toBeGreaterThan(22);
  expect(line.position.y).toBeGreaterThan(0.21);
  expect(line.raycast).toBe(NON_INTERACTIVE_FOOTPRINT_RAYCAST);
  const material = line.material as THREE.LineBasicMaterial;
  expect(material.opacity).toBe(1);
  expect(material.depthWrite).toBe(false);
  expect(material.depthTest).toBe(false);
  await renderer.unmount();
});
