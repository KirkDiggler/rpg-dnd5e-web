import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';
import type { DungeonShellFloorProfile } from '../../rendering/dungeonShellManifest';

const useTextureMock = vi.hoisted(() => vi.fn(() => new THREE.Texture()));

vi.mock('@react-three/drei', () => ({
  useTexture: useTextureMock,
}));

import { SyntyHexFloor } from './SyntyHexFloor';
import {
  computeFloorPoolColor,
  MAX_FLOOR_POOL_BLEND,
  type FloorPoolLight,
} from './syntyHexFloorHelpers';

function tiles(...coords: Array<[number, number, number]>) {
  const map = new Map<string, AbsoluteFloorTile>();
  for (const [x, y, z] of coords) {
    map.set(`${x},${y},${z}`, { x, y, z, roomId: '' });
  }
  return map;
}

/**
 * Every floor tile renders an unlit `MeshBasicMaterial` regardless of
 * theme (rpg-dnd5e-web#558 follow-up: crypt reverted from a lit
 * `MeshStandardMaterial` back to unlit, tone-mapping-independent
 * rendering — see SyntyHexFloor.tsx's doc comment for why). `isCrypt`
 * only changes the tint COLOR now, not the material family, so these
 * tests count materials by color rather than by `object.type`.
 *
 * Matched via `.type` ('MeshBasicMaterial') rather than `instanceof` —
 * the test renderer's reconciler and this test file can each resolve
 * their own copy of the `three` package (a real, harmless duplicate
 * install already present in this repo's node_modules), so an
 * `instanceof` check across that boundary can silently return false for
 * an object that IS the right class from the OTHER copy.
 */
function floorTileColors(renderer: {
  scene: { findAllByType: (t: string) => unknown[] };
}): THREE.Color[] {
  return renderer.scene
    .findAllByType('MeshBasicMaterial')
    .map(
      (node) => (node as { instance: THREE.MeshBasicMaterial }).instance.color
    );
}

const WHITE = new THREE.Color(1, 1, 1); // meshBasicMaterial's default color
const CRYPT_TINT = new THREE.Color(0.35, 0.38, 0.46);
const CRYPT_FLOOR_PROFILE: DungeonShellFloorProfile = {
  diffuse: 'textures/crypt-floor.png',
  sha256: 'a'.repeat(64),
  worldUnitsPerRepeat: 4,
};
const ALT_CRYPT_FLOOR_PROFILE: DungeonShellFloorProfile = {
  diffuse: 'textures/crypt-floor-alt.png',
  sha256: 'b'.repeat(64),
  worldUnitsPerRepeat: 8,
};

function isCloseTo(a: THREE.Color, b: THREE.Color): boolean {
  return (
    Math.abs(a.r - b.r) < 1e-6 &&
    Math.abs(a.g - b.g) < 1e-6 &&
    Math.abs(a.b - b.b) < 1e-6
  );
}

describe('SyntyHexFloor surface placement', () => {
  it('renders its flat tiles at the dungeon surface height', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor floorTiles={tiles([0, 0, 0])} hexSize={1} />
    );
    const tile = renderer.scene.findByType('Mesh').instance as THREE.Mesh;
    expect(tile.position.y).toBeCloseTo(DUNGEON_SURFACE_Y);
  });
});

function floorMeshes(renderer: {
  scene: { findAllByType: (t: string) => unknown[] };
}): THREE.Mesh[] {
  return renderer.scene
    .findAllByType('Mesh')
    .map((node) => (node as { instance: THREE.Mesh }).instance);
}

describe('SyntyHexFloor profile UVs', () => {
  it('loads the profile diffuse, repeats it once, and maps UVs in world space', async () => {
    useTextureMock.mockClear();
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
      />
    );
    const material = renderer.scene.findByType('MeshBasicMaterial')
      .instance as unknown as THREE.MeshBasicMaterial;
    const map = material.map;

    expect(useTextureMock).toHaveBeenCalledWith(
      '/models/synty/textures/crypt-floor.png'
    );
    expect(map?.wrapS).toBe(THREE.RepeatWrapping);
    expect(map?.wrapT).toBe(THREE.RepeatWrapping);
    expect(map?.repeat.x).toBe(1);
    expect(map?.repeat.y).toBe(1);
    expect(material.toneMapped).toBe(false);
    expect(floorMeshes(renderer)).toHaveLength(1);

    const mesh = floorMeshes(renderer)[0];
    const position = mesh.geometry.getAttribute('position');
    const uv = mesh.geometry.getAttribute('uv');
    expect(uv.getX(0)).toBeCloseTo(
      (mesh.position.x + position.getX(0)) /
        CRYPT_FLOOR_PROFILE.worldUnitsPerRepeat
    );
    expect(uv.getY(0)).toBeCloseTo(
      (mesh.position.z + position.getZ(0)) /
        CRYPT_FLOOR_PROFILE.worldUnitsPerRepeat
    );
  });

  it('replaces and disposes the owned texture clone when the profile changes without mutating the shared cache', async () => {
    const sharedTexture = new THREE.Texture();
    useTextureMock.mockImplementationOnce(() => sharedTexture);
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
      />
    );
    const firstMap = (
      renderer.scene.findByType('MeshBasicMaterial')
        .instance as unknown as THREE.MeshBasicMaterial
    ).map!;
    const dispose = vi.spyOn(firstMap, 'dispose');

    expect(firstMap).not.toBe(sharedTexture);
    expect(sharedTexture.repeat.x).toBe(1);
    expect(sharedTexture.repeat.y).toBe(1);

    await renderer.update(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        profile={ALT_CRYPT_FLOOR_PROFILE}
      />
    );

    const secondMap = (
      renderer.scene.findByType('MeshBasicMaterial')
        .instance as unknown as THREE.MeshBasicMaterial
    ).map!;
    expect(secondMap).not.toBe(firstMap);
    expect(secondMap.repeat.x).toBe(1);
    expect(secondMap.repeat.y).toBe(1);
    expect(dispose).toHaveBeenCalled();
    await renderer.unmount();
  });

  it('keeps exact UVs at shared vertices for adjacent cells and when a distant cell is added', async () => {
    const oneCell = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
      />
    );
    const withDistantCell = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [100, -100, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
      />
    );
    const originalUvs = Array.from(
      floorMeshes(oneCell)[0].geometry.getAttribute('uv').array
    );
    const distantCellUvs = Array.from(
      floorMeshes(withDistantCell)[0].geometry.getAttribute('uv').array
    );

    expect(distantCellUvs).toEqual(originalUvs);

    const meshes = floorMeshes(
      await ReactThreeTestRenderer.create(
        <SyntyHexFloor
          floorTiles={tiles([0, 0, 0], [1, -1, 0])}
          hexSize={1}
          profile={CRYPT_FLOOR_PROFILE}
        />
      )
    );
    const sharedUvs: number[][] = [];
    const aPos = meshes[0].geometry.getAttribute('position');
    const aUv = meshes[0].geometry.getAttribute('uv');
    const bPos = meshes[1].geometry.getAttribute('position');
    const bUv = meshes[1].geometry.getAttribute('uv');
    for (let i = 0; i < aPos.count; i++) {
      const ax = meshes[0].position.x + aPos.getX(i);
      const az = meshes[0].position.z + aPos.getZ(i);
      for (let j = 0; j < bPos.count; j++) {
        const bx = meshes[1].position.x + bPos.getX(j);
        const bz = meshes[1].position.z + bPos.getZ(j);
        if (Math.abs(ax - bx) < 1e-6 && Math.abs(az - bz) < 1e-6) {
          sharedUvs.push([aUv.getX(i), aUv.getY(i), bUv.getX(j), bUv.getY(j)]);
        }
      }
    }

    expect(sharedUvs.length).toBeGreaterThanOrEqual(2);
    for (const [au, av, bu, bv] of sharedUvs) {
      expect(au).toBeCloseTo(bu, 6);
      expect(av).toBeCloseTo(bv, 6);
    }
  });

  it('uses the same profile geometry UVs for remembered and visible state of a cell', async () => {
    const visible = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
      />
    );
    const remembered = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
        rememberedFloorHexKeys={new Set(['0,0,0'])}
      />
    );

    expect(
      Array.from(floorMeshes(remembered)[0].geometry.getAttribute('uv').array)
    ).toEqual(
      Array.from(floorMeshes(visible)[0].geometry.getAttribute('uv').array)
    );
    expect(floorTileColors(remembered)[0].getHexString()).toBe('465366');
    expect(
      floorMeshes(visible)[0].geometry.getAttribute('uv').count
    ).toBeGreaterThan(0);
  });

  it('preserves normalized legacy UVs and repeat 2 by 2 without a profile', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor floorTiles={tiles([0, 0, 0])} hexSize={1} />
    );
    const material = renderer.scene.findByType('MeshBasicMaterial')
      .instance as unknown as THREE.MeshBasicMaterial;
    const uv = floorMeshes(renderer)[0].geometry.getAttribute('uv');

    expect(material.map?.repeat.x).toBe(2);
    expect(material.map?.repeat.y).toBe(2);
    for (const value of uv.array) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('SyntyHexFloor spaceTheme (rpg-dnd5e-web#558 real-route theme consumption)', () => {
  it('renders remembered tiles opaque charcoal before the crypt theme', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        spaceTheme="crypt"
        rememberedFloorHexKeys={new Set(['0,0,0'])}
      />
    );
    const material = renderer.scene.findByType('MeshBasicMaterial')
      .instance as unknown as THREE.MeshBasicMaterial;
    expect(material?.color.getHexString()).toBe('465366');
    expect(material?.transparent).toBe(false);
    expect(material?.depthWrite).toBe(true);
  });

  it('renders every tile with the default (untinted, unlit) material when no theme/keys are set — byte-identical to the pre-#558 #481/#485 fix', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor floorTiles={tiles([0, 0, 0], [1, -1, 0])} hexSize={1} />
    );
    const colors = floorTileColors(renderer);
    expect(colors).toHaveLength(2);
    for (const color of colors) {
      expect(isCloseTo(color, WHITE)).toBe(true);
    }
  });

  it("spaceTheme='crypt' tints EVERY tile, even with no themeFloorHexKeys at all — the real-route case", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [1, -1, 0], [2, -2, 0])}
        hexSize={1}
        spaceTheme="crypt"
      />
    );
    const colors = floorTileColors(renderer);
    expect(colors).toHaveLength(3);
    for (const color of colors) {
      expect(isCloseTo(color, CRYPT_TINT)).toBe(true);
    }
  });

  it('themeFloorHexKeys alone (no spaceTheme) still themes only the named tile — the ?cryptdemo=1 harness path keeps working unchanged', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [1, -1, 0])}
        hexSize={1}
        themeFloorHexKeys={new Set(['0,0,0'])}
      />
    );
    const colors = floorTileColors(renderer);
    expect(colors.filter((c) => isCloseTo(c, CRYPT_TINT))).toHaveLength(1);
    expect(colors.filter((c) => isCloseTo(c, WHITE))).toHaveLength(1);
  });

  it('spaceTheme is additive with themeFloorHexKeys, not exclusive — spaceTheme alone already covers every tile regardless of which keys themeFloorHexKeys names', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [1, -1, 0])}
        hexSize={1}
        spaceTheme="crypt"
        themeFloorHexKeys={new Set(['1,-1,0'])}
      />
    );
    const colors = floorTileColors(renderer);
    expect(colors).toHaveLength(2);
    for (const color of colors) {
      expect(isCloseTo(color, CRYPT_TINT)).toBe(true);
    }
  });
});

describe('SyntyHexFloor floor pooling (look-lab lighting experiment, rpg-dnd5e-web#558 follow-up)', () => {
  it('blends a crypt tile toward a nearby pool light, matching computeFloorPoolColor directly', async () => {
    // tile [0,0,0] -> world (0,0); a light at world (0, 1.2, 0) sits exactly
    // on top of it (hexMath's cubeToWorld), so this is the deterministic
    // full-weight case computeFloorPoolColor.test.ts already covers on its
    // own — asserting the SAME expected value here proves the wiring
    // (prop -> tile -> material color), not just the math.
    const lights: FloorPoolLight[] = [
      { position: [0, 1.2, 0], color: '#ff9d52', distance: 5.5 },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        spaceTheme="crypt"
        poolLights={lights}
      />
    );
    const [color] = floorTileColors(renderer);
    const expected = computeFloorPoolColor(CRYPT_TINT, 0, 0, lights);
    expect(isCloseTo(color, expected)).toBe(true);
    // Sanity: this really did move away from the flat tint, not a no-op.
    expect(isCloseTo(color, CRYPT_TINT)).toBe(false);
  });

  it('never pools a non-crypt tile, even with poolLights sitting right on top of it', async () => {
    const lights: FloorPoolLight[] = [
      { position: [0, 1.2, 0], color: '#ff9d52', distance: 5.5 },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        poolLights={lights}
      />
    );
    const [color] = floorTileColors(renderer);
    expect(isCloseTo(color, WHITE)).toBe(true);
  });

  it('is a no-op (flat CRYPT_TINT) when poolLights is empty/undefined — every caller before this experiment', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        spaceTheme="crypt"
      />
    );
    const [color] = floorTileColors(renderer);
    expect(isCloseTo(color, CRYPT_TINT)).toBe(true);
  });

  it('caps the blend at MAX_FLOOR_POOL_BLEND even directly under the light — never fully replaces the stone tint', async () => {
    const lights: FloorPoolLight[] = [
      { position: [0, 1.2, 0], color: '#ff9d52', distance: 5.5 },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        spaceTheme="crypt"
        poolLights={lights}
      />
    );
    const [color] = floorTileColors(renderer);
    const fullyReplaced = new THREE.Color('#ff9d52');
    expect(isCloseTo(color, fullyReplaced)).toBe(false);
    expect(MAX_FLOOR_POOL_BLEND).toBeLessThan(1);
  });
});

describe('SyntyHexFloor litSurfaces dev/Kirk-only A/B (look-lab lighting experiment)', () => {
  it('defaults to the unlit MeshBasicMaterial family — litSurfaces omitted', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        spaceTheme="crypt"
      />
    );
    expect(renderer.scene.findAllByType('MeshBasicMaterial')).toHaveLength(1);
    expect(renderer.scene.findAllByType('MeshStandardMaterial')).toHaveLength(
      0
    );
  });

  it('renders a lit MeshStandardMaterial for crypt tiles when litSurfaces is true', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0])}
        hexSize={1}
        spaceTheme="crypt"
        litSurfaces
      />
    );
    expect(renderer.scene.findAllByType('MeshStandardMaterial')).toHaveLength(
      1
    );
    expect(renderer.scene.findAllByType('MeshBasicMaterial')).toHaveLength(0);
  });

  it('leaves non-crypt tiles unlit even when litSurfaces is true — the toggle only ever affects the crypt branch', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor floorTiles={tiles([0, 0, 0])} hexSize={1} litSurfaces />
    );
    expect(renderer.scene.findAllByType('MeshBasicMaterial')).toHaveLength(1);
    expect(renderer.scene.findAllByType('MeshStandardMaterial')).toHaveLength(
      0
    );
  });
});
