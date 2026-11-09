import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import type { GroundCatalogSnapshot } from '@/rendering/groundCatalog';
import { useThree } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GroundFloor } from './GroundFloor';

const textures = vi.hoisted(() => ({
  value: undefined as THREE.Texture | undefined,
}));
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useLoader: () => textures.value,
}));
vi.mock('@react-three/drei', async () => ({
  // Keep the real convenience hook's eager GPU upload observable.
  useTexture: (await import('@react-three/drei/core/Texture.js')).useTexture,
  Html: () => null,
}));

const REF = 'dnd5e:ground:fantasy-kingdom:grass_01';
const SHA = 'a'.repeat(64);
const catalog: GroundCatalogSnapshot = {
  status: 'ready',
  catalog: {
    schemaVersion: 1,
    styles: [
      {
        ref: REF,
        displayName: 'Grass',
        diffuse: `ground/images/${SHA}.png`,
        sha256: SHA,
        width: 2048,
        height: 2048,
        worldUnitsPerRepeat: 6,
      },
    ],
  },
};
const profile = { diffuse: 'textures/stone.png', worldUnitsPerRepeat: 6 };
const tiles = [
  { cell: { x: 0, y: 0, z: 0 }, ref: REF },
  { cell: { x: 1, y: -1, z: 0 }, ref: REF },
];
beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('shared ground drawing', () => {
  it('does not allocate a GPU copy of the unused cached source before a draw', async () => {
    const shared = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1
    );
    shared.needsUpdate = true;
    textures.value = shared;
    let renderer: THREE.WebGLRenderer | undefined;
    function ObservedSurface() {
      renderer = useThree((state) => state.gl);
      return <GroundFloor tiles={tiles} catalog={catalog} hexSize={1} />;
    }
    const view = await ReactThreeTestRenderer.create(<ObservedSurface />);
    // Test renderer has not advanced a frame: the material-owned clone must
    // upload only when drawn, and its unused cached source must never upload.
    expect(renderer!.info.memory.textures).toBe(0);
    await view.unmount();
  });
  it('draws one level batch per style and disposes only instance-owned resources', async () => {
    const shared = new THREE.Texture();
    textures.value = shared;
    const sharedDispose = vi.spyOn(shared, 'dispose');
    const view = await ReactThreeTestRenderer.create(
      <GroundFloor
        tiles={tiles}
        catalog={catalog}
        defaultProfile={profile}
        hexSize={1}
      />
    );
    const mesh = view.scene.findByProps({ name: `ground-style-${REF}` })
      .instance as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(mesh.position.y).toBe(DUNGEON_SURFACE_Y);
    expect(mesh.geometry.getAttribute('position').count).toBe(12);
    expect(mesh.material.map).not.toBe(shared);
    expect(mesh.material.toneMapped).toBe(false);
    const ownGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const ownTexture = vi.spyOn(mesh.material.map!, 'dispose');
    await view.unmount();
    expect(ownGeometry).toHaveBeenCalledOnce();
    expect(ownTexture).toHaveBeenCalledOnce();
    expect(sharedDispose).not.toHaveBeenCalled();
  });

  it('shows a diagnostic instead of rendering stone for an unavailable explicit style', async () => {
    textures.value = new THREE.Texture();
    const view = await ReactThreeTestRenderer.create(
      <GroundFloor
        tiles={tiles}
        catalog={{ status: 'error', message: 'Ground catalog missing' }}
        defaultProfile={profile}
        hexSize={1}
      />
    );
    const mesh = view.scene.findByProps({ name: 'ground-diagnostic' })
      .instance as THREE.Mesh;
    expect(mesh.userData.message).toContain('Ground catalog missing');
    expect(
      view.scene.findAllByProps({ name: 'ground-style-default' })
    ).toHaveLength(0);
    await view.unmount();
  });
});
