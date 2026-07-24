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

// A tinted mesh's base material color (the mocked GLB's pure-white
// MeshStandardMaterial) multiplied by any WALL_TINT_BY_THEME entry lands
// with every channel under 0.5 — same pattern the locked-door tint test
// above already relies on.
function findTintedMeshes(renderer: {
  scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
}) {
  return renderer.scene.findAll((node) => {
    const mesh = (node as { instance: unknown }).instance as THREE.Mesh;
    return (
      mesh instanceof THREE.Mesh &&
      mesh.material instanceof THREE.MeshStandardMaterial &&
      mesh.material.color.r < 0.5 &&
      mesh.material.color.g < 0.5 &&
      mesh.material.color.b < 0.5
    );
  });
}

describe('SyntyHexWall spaceTheme (rpg-dnd5e-web#558 real-route theme consumption)', () => {
  it('spaceTheme="crypt" tints a solid wall segment even with no themeWallHexKeys at all — the real-route case, where there is no per-hex demo mix to opt in via', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.SOLID)]}
        hexSize={1}
        spaceTheme="crypt"
      />
    );
    expect(findTintedMeshes(renderer).length).toBeGreaterThan(0);
  });

  it('no spaceTheme and no themeWallHexKeys renders untinted — byte-identical to pre-#558 behavior for every real dungeon wall today', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall walls={[wall(WallKind.SOLID)]} hexSize={1} />
    );
    expect(findTintedMeshes(renderer)).toEqual([]);
  });

  it('spaceTheme="crypt" themes EVERY wall hex, not just ones named in themeWallHexKeys — multiple independent walls all tint', async () => {
    const secondWall = {
      from: { x: 5, y: -5, z: 0 },
      to: { x: 6, y: -6, z: 0 },
      kind: WallKind.SOLID,
    } as Wall;
    const walls = [wall(WallKind.SOLID), secondWall];
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall walls={walls} hexSize={1} spaceTheme="crypt" />
    );
    // One tinted mesh per wall segment (2 walls -> 2 segments -> 2 tints).
    expect(findTintedMeshes(renderer).length).toBe(2);
  });

  it('spaceTheme is additive with themeWallHexKeys, not a replacement — a hex named in themeWallHexKeys still themes when spaceTheme is absent (the ?cryptdemo=1 harness path keeps working)', async () => {
    const solidWall = wall(WallKind.SOLID);
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[solidWall]}
        hexSize={1}
        themeWallHexKeys={new Set(['0,0,0'])}
      />
    );
    expect(findTintedMeshes(renderer).length).toBeGreaterThan(0);
  });
});
