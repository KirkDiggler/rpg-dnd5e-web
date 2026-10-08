import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { StructuralConcealmentGuides } from './StructuralConcealmentGuides';
import type { StructuralWall } from './structuralWalls';

const wall: StructuralWall = {
  id: 'wall',
  label: 'Wall',
  line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
  appearance: {
    assetRef: 'unused-by-guides',
    height: 3,
    thickness: 0.3,
    elevation: 0,
  },
  blocker: {
    footprint: { width: 12, depth: 0.5, offsetX: 1, offsetZ: 0.4 },
    blocksMovement: true,
    blocksLineOfSight: true,
  },
  openings: [
    {
      id: 'opening',
      position: 7,
      width: 2,
      door: { id: 'door', assetRef: 'unused-by-guides' },
    },
  ],
};

describe('explicit structural concealment targets', () => {
  it('picks wall spans and attached doors separately without a wall target over the hole', async () => {
    const onPick = vi.fn();
    const view = await ReactThreeTestRenderer.create(
      <StructuralConcealmentGuides
        walls={[wall]}
        activeId="secret"
        onPick={onPick}
      />
    );
    const left = view.scene.findByProps({ name: 'concealment-wall-wall-0' });
    const right = view.scene.findByProps({ name: 'concealment-wall-wall-1' });
    const door = view.scene.findByProps({ name: 'concealment-door-door' });
    expect(left.instance.position.x).toBe(3);
    expect(right.instance.position.x).toBe(9);
    expect(door.instance.position.x).toBe(7);
    expect(
      ((left.instance as THREE.Mesh).geometry as THREE.BoxGeometry).parameters
        .width
    ).toBe(6);
    expect(
      ((right.instance as THREE.Mesh).geometry as THREE.BoxGeometry).parameters
        .width
    ).toBe(2);
    const stopPropagation = vi.fn();
    await view.fireEvent(left, 'pointerDown', { button: 0, stopPropagation });
    await view.fireEvent(door, 'pointerDown', { button: 0, stopPropagation });
    expect(onPick.mock.calls).toEqual([['wall'], ['door']]);
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    await view.fireEvent(door, 'pointerDown', { button: 1, stopPropagation });
    expect(onPick).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it('does not intercept other tools and does not infer door membership from its wall', async () => {
    const onPick = vi.fn();
    const view = await ReactThreeTestRenderer.create(
      <StructuralConcealmentGuides
        walls={[wall]}
        concealments={{
          secret: {
            checks: [{ ability: 'perception', dc: 15 }],
            props: ['wall'],
          },
        }}
        onPick={onPick}
      />
    );
    const guide = view.scene.findByProps({ name: 'concealment-wall-wall-0' });
    const mesh = guide.instance as THREE.Mesh;
    expect(mesh.raycast(new THREE.Raycaster(), [])).toBeNull();
    expect(guide.props.onPointerDown).toBeUndefined();
    expect(
      view.scene.findAllByProps({ name: 'concealment-door-door' })
    ).toHaveLength(0);
    expect(onPick).not.toHaveBeenCalled();
    await view.unmount();
  });
});
