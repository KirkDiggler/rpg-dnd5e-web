import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => {
  const scene = new THREE.Group();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    )
  );
  return { useGLTF: () => ({ scene }) };
});

import { SyntyHexWall } from './SyntyHexWall';

function wall(kind: WallKind, id = 'boss-door'): Wall {
  return {
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: -1, z: 0 },
    kind,
    id,
  } as Wall;
}

describe('SyntyHexWall R3F scene', () => {
  it('renders a tinted locked door hit target that forwards its exact Wall.id', async () => {
    const onDoorClick = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.DOOR_LOCKED, 'locked-42')]}
        hexSize={1}
        onDoorClick={onDoorClick}
      />
    );
    const target = renderer.scene.find(
      (node) => typeof node.props.onClick === 'function'
    );
    expect(target).toBeDefined();
    await renderer.fireEvent(target, 'click');
    expect(onDoorClick).toHaveBeenCalledWith('locked-42');
    const tintedMeshes = renderer.scene.findAll((node) => {
      const mesh = node.instance as THREE.Mesh;
      return (
        mesh instanceof THREE.Mesh &&
        mesh.material instanceof THREE.MeshStandardMaterial
      );
    });
    expect(
      tintedMeshes.some((node) => {
        const material = (node.instance as THREE.Mesh)
          .material as THREE.MeshStandardMaterial;
        return (
          material.color.r < 0.5 &&
          material.color.g < 0.5 &&
          material.color.b < 0.5
        );
      })
    ).toBe(true);
  });

  it.each([WallKind.DOOR_CLOSED, WallKind.DOOR_OPEN])(
    '%s preserves a door hit target',
    async (kind) => {
      const renderer = await ReactThreeTestRenderer.create(
        <SyntyHexWall walls={[wall(kind)]} hexSize={1} />
      );
      expect(
        renderer.scene.find((node) => typeof node.props.onClick === 'function')
      ).toBeDefined();
    }
  );

  it('does not make a solid wall a door hit target', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall walls={[wall(WallKind.SOLID)]} hexSize={1} />
    );
    expect(
      renderer.scene.findAll((node) => typeof node.props.onClick === 'function')
    ).toEqual([]);
  });
});
