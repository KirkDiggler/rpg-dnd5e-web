import type { DungeonShellFloorProfile } from '@/rendering/dungeonShellManifest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const textureState = vi.hoisted(() => ({
  base: undefined as THREE.Texture | undefined,
  mode: 'ready' as 'ready' | 'pending' | 'error',
  pending: new Promise<never>(() => {}),
}));

vi.mock('@react-three/drei', () => ({
  useTexture: vi.fn(() => {
    if (textureState.mode === 'pending') throw textureState.pending;
    if (textureState.mode === 'error') throw new Error('texture failed');
    return textureState.base;
  }),
}));

vi.mock('@/components/session/useDungeonShellCatalog', () => ({
  useDungeonShellCatalog: () => ({
    status: 'ready',
    catalog: {
      profiles: {
        crypt: {
          floor: {
            diffuse: 'textures/Dungeons_Texture_FloorTile_09_01.png',
            sha256:
              'ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841',
            worldUnitsPerRepeat: 6,
          },
        },
      },
    },
  }),
}));

import {
  WorkspaceFloorSurface,
  WorkspaceFloorUnderlay,
} from './WorkspaceFloorUnderlay';
import { createWorkspaceFloorGeometry } from './workspaceFloorGeometry';

const PROFILE: DungeonShellFloorProfile = {
  diffuse: 'textures/Dungeons_Texture_FloorTile_09_01.png',
  sha256: 'ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841',
  worldUnitsPerRepeat: 6,
};

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('workspace floor underlay', () => {
  it.each(['pending', 'error'] as const)(
    'keeps the interactive plain ground present when texture loading is %s',
    async (mode) => {
      textureState.mode = mode;
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const renderer = await ReactThreeTestRenderer.create(
        <>
          <mesh name="world-building-finite-ground" />
          <WorkspaceFloorUnderlay radius={13} />
        </>
      );

      expect(
        renderer.scene.findByProps({ name: 'world-building-finite-ground' })
      ).toBeTruthy();
      expect(
        renderer.scene.findAllByProps({ name: 'workspace-floor-underlay' })
      ).toHaveLength(0);

      await renderer.unmount();
      consoleError.mockRestore();
      textureState.mode = 'ready';
    }
  );

  it('covers the six-sided ground and keeps absolute-world UV density as it grows', () => {
    const small = createWorkspaceFloorGeometry(13, 6);
    const large = createWorkspaceFloorGeometry(21, 6);

    expect(small.parameters.segments).toBe(6);
    expect(large.parameters.segments).toBe(6);

    for (const geometry of [small, large]) {
      const position = geometry.getAttribute('position');
      const uv = geometry.getAttribute('uv');
      for (let index = 0; index < position.count; index += 1) {
        expect(uv.getX(index)).toBeCloseTo(position.getX(index) / 6);
        // The mesh rotates -PI/2 around X, so local +Y is world -Z.
        expect(uv.getY(index)).toBeCloseTo(-position.getY(index) / 6);
      }
    }

    small.dispose();
    large.dispose();
  });

  it('configures and disposes only an owned texture clone', async () => {
    const base = new THREE.Texture();
    const owned = new THREE.Texture();
    base.wrapS = THREE.ClampToEdgeWrapping;
    base.wrapT = THREE.ClampToEdgeWrapping;
    base.repeat.set(1, 1);
    const clone = vi.spyOn(base, 'clone').mockReturnValue(owned);
    const dispose = vi.spyOn(owned, 'dispose');
    textureState.base = base;
    textureState.mode = 'ready';

    const renderer = await ReactThreeTestRenderer.create(
      <WorkspaceFloorSurface radius={13} profile={PROFILE} />
    );
    const floor = renderer.scene.findByProps({
      name: 'workspace-floor-underlay',
    });

    expect(clone).toHaveBeenCalledTimes(1);
    expect(
      (floor.instance as THREE.Mesh<THREE.CircleGeometry>).geometry.parameters
        .radius
    ).toBe(13);
    expect(base.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(base.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(base.repeat.toArray()).toEqual([1, 1]);
    expect(owned.wrapS).toBe(THREE.RepeatWrapping);
    expect(owned.wrapT).toBe(THREE.RepeatWrapping);
    expect(dispose).not.toHaveBeenCalled();

    const surface = floor.instance as THREE.Mesh<
      THREE.CircleGeometry,
      THREE.Material
    >;
    surface.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, -1, 0)
    );
    const control = new THREE.Mesh(surface.geometry, surface.material);
    control.position.copy(surface.position);
    control.rotation.copy(surface.rotation);
    control.updateMatrixWorld(true);
    expect(raycaster.intersectObject(control).length).toBeGreaterThan(0);
    expect(raycaster.intersectObject(surface)).toHaveLength(0);

    await renderer.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
