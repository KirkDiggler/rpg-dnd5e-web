import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';
import type { DungeonShellFloorProfile } from '../../rendering/dungeonShellManifest';

const useTextureMock = vi.hoisted(() => vi.fn(() => new THREE.Texture()));

vi.mock('@react-three/drei', () => ({
  useTexture: useTextureMock,
}));

import { SyntyHexFloor } from './SyntyHexFloor';
import {
  computeFloorPoolColor,
  CRYPT_DARK_FLOOR_TINT,
  cryptFloorBaseColor,
  MAX_FLOOR_POOL_BLEND,
  type DungeonFloorLighting,
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

beforeEach(() => {
  useTextureMock.mockReset();
  useTextureMock.mockImplementation(() => new THREE.Texture());
});

function textureState(texture: THREE.Texture) {
  return {
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    repeat: texture.repeat.toArray(),
    offset: texture.offset.toArray(),
    center: texture.center.toArray(),
    rotation: texture.rotation,
    matrixAutoUpdate: texture.matrixAutoUpdate,
    magFilter: texture.magFilter,
    minFilter: texture.minFilter,
    anisotropy: texture.anisotropy,
    generateMipmaps: texture.generateMipmaps,
    premultiplyAlpha: texture.premultiplyAlpha,
    flipY: texture.flipY,
    unpackAlignment: texture.unpackAlignment,
    colorSpace: texture.colorSpace,
    channel: texture.channel,
    version: texture.version,
  };
}

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

  it('configures owned profile and legacy clones without mutating shared cache textures', async () => {
    const profileUrl = '/models/synty/textures/crypt-floor.png';
    const alternateUrl = '/models/synty/textures/crypt-floor-alt.png';
    const legacyUrl =
      '/models/synty/textures/Dungeons_Texture_FloorTiles_01.png';
    const profileShared = new THREE.Texture();
    profileShared.wrapS = THREE.MirroredRepeatWrapping;
    profileShared.wrapT = THREE.RepeatWrapping;
    profileShared.repeat.set(3, 5);
    profileShared.offset.set(0.25, 0.75);
    profileShared.center.set(0.1, 0.2);
    profileShared.rotation = 0.4;
    profileShared.matrixAutoUpdate = false;
    profileShared.magFilter = THREE.NearestFilter;
    profileShared.minFilter = THREE.NearestMipmapNearestFilter;
    profileShared.anisotropy = 4;
    profileShared.generateMipmaps = false;
    profileShared.premultiplyAlpha = true;
    profileShared.flipY = false;
    profileShared.unpackAlignment = 1;
    profileShared.colorSpace = THREE.SRGBColorSpace;
    profileShared.channel = 1;
    const alternateShared = new THREE.Texture();
    alternateShared.wrapS = THREE.MirroredRepeatWrapping;
    alternateShared.wrapT = THREE.MirroredRepeatWrapping;
    alternateShared.repeat.set(6, 7);
    alternateShared.offset.set(0.3, 0.4);
    const legacyShared = new THREE.Texture();
    legacyShared.wrapS = THREE.MirroredRepeatWrapping;
    legacyShared.wrapT = THREE.ClampToEdgeWrapping;
    legacyShared.repeat.set(9, 10);
    legacyShared.offset.set(0.5, 0.6);
    const sharedBefore = new Map([
      [profileUrl, textureState(profileShared)],
      [alternateUrl, textureState(alternateShared)],
      [legacyUrl, textureState(legacyShared)],
    ]);
    const profileSharedDispose = vi.spyOn(profileShared, 'dispose');
    const alternateSharedDispose = vi.spyOn(alternateShared, 'dispose');
    const legacySharedDispose = vi.spyOn(legacyShared, 'dispose');
    useTextureMock.mockImplementation((url?: string) => {
      const shared = new Map([
        [profileUrl, profileShared],
        [alternateUrl, alternateShared],
        [legacyUrl, legacyShared],
      ]).get(url ?? '');
      if (!shared) throw new Error(`unexpected texture URL: ${url}`);
      return shared;
    });

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
    const firstMapDispose = vi.spyOn(firstMap, 'dispose');

    expect(useTextureMock).toHaveBeenLastCalledWith(profileUrl);
    expect(firstMap).not.toBe(profileShared);
    expect(firstMap.wrapS).toBe(THREE.RepeatWrapping);
    expect(firstMap.wrapT).toBe(THREE.RepeatWrapping);
    expect(firstMap.repeat.toArray()).toEqual([1, 1]);
    expect(textureState(profileShared)).toEqual(sharedBefore.get(profileUrl));

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

    const alternateMapDispose = vi.spyOn(secondMap, 'dispose');

    expect(useTextureMock).toHaveBeenLastCalledWith(alternateUrl);
    expect(secondMap).not.toBe(firstMap);
    expect(secondMap).not.toBe(alternateShared);
    expect(firstMapDispose).toHaveBeenCalledTimes(1);
    expect(secondMap.wrapS).toBe(THREE.RepeatWrapping);
    expect(secondMap.wrapT).toBe(THREE.RepeatWrapping);
    expect(secondMap.repeat.toArray()).toEqual([1, 1]);
    expect(textureState(alternateShared)).toEqual(
      sharedBefore.get(alternateUrl)
    );

    await renderer.update(
      <SyntyHexFloor floorTiles={tiles([0, 0, 0])} hexSize={1} />
    );
    const legacyMap = (
      renderer.scene.findByType('MeshBasicMaterial')
        .instance as unknown as THREE.MeshBasicMaterial
    ).map!;

    const legacyMapDispose = vi.spyOn(legacyMap, 'dispose');

    expect(useTextureMock).toHaveBeenLastCalledWith(legacyUrl);
    expect(legacyMap).not.toBe(secondMap);
    expect(legacyMap).not.toBe(firstMap);
    expect(legacyMap).not.toBe(legacyShared);
    expect(alternateMapDispose).toHaveBeenCalledTimes(1);
    expect(legacyMap.wrapS).toBe(THREE.RepeatWrapping);
    expect(legacyMap.wrapT).toBe(THREE.RepeatWrapping);
    expect(legacyMap.repeat.toArray()).toEqual([2, 2]);
    expect(textureState(profileShared)).toEqual(sharedBefore.get(profileUrl));
    expect(textureState(alternateShared)).toEqual(
      sharedBefore.get(alternateUrl)
    );
    expect(textureState(legacyShared)).toEqual(sharedBefore.get(legacyUrl));
    expect(profileSharedDispose).not.toHaveBeenCalled();
    expect(alternateSharedDispose).not.toHaveBeenCalled();
    expect(legacySharedDispose).not.toHaveBeenCalled();
    await renderer.unmount();
    expect(legacyMapDispose).toHaveBeenCalledTimes(1);
    expect(profileSharedDispose).not.toHaveBeenCalled();
    expect(alternateSharedDispose).not.toHaveBeenCalled();
    expect(legacySharedDispose).not.toHaveBeenCalled();
  });

  it('maps adjacent pointy cells to equal absolute UVs at their shared world vertices', async () => {
    const meshes = floorMeshes(
      await ReactThreeTestRenderer.create(
        <SyntyHexFloor
          floorTiles={tiles([0, 0, 0], [0, -1, 1])}
          hexSize={1}
          profile={CRYPT_FLOOR_PROFILE}
        />
      )
    );
    const sharedVertices: Array<{
      x: number;
      z: number;
      aU: number;
      aV: number;
      bU: number;
      bV: number;
    }> = [];
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
          sharedVertices.push({
            x: ax,
            z: az,
            aU: aUv.getX(i),
            aV: aUv.getY(i),
            bU: bUv.getX(j),
            bV: bUv.getY(j),
          });
        }
      }
    }

    expect(sharedVertices).toHaveLength(2);
    for (const [expectedX, expectedZ] of [
      [0, 1],
      [Math.sqrt(3) / 2, 0.5],
    ]) {
      const vertex = sharedVertices.find(
        (candidate) =>
          Math.abs(candidate.x - expectedX) < 1e-6 &&
          Math.abs(candidate.z - expectedZ) < 1e-6
      );
      expect(vertex).toBeDefined();
      if (!vertex) continue;
      expect(vertex.x).toBeCloseTo(expectedX, 6);
      expect(vertex.z).toBeCloseTo(expectedZ, 6);
      expect(vertex.aU).toBeCloseTo(
        expectedX / CRYPT_FLOOR_PROFILE.worldUnitsPerRepeat,
        6
      );
      expect(vertex.aV).toBeCloseTo(
        expectedZ / CRYPT_FLOOR_PROFILE.worldUnitsPerRepeat,
        6
      );
      expect(vertex.bU).toBeCloseTo(
        expectedX / CRYPT_FLOOR_PROFILE.worldUnitsPerRepeat,
        6
      );
      expect(vertex.bV).toBeCloseTo(
        expectedZ / CRYPT_FLOOR_PROFILE.worldUnitsPerRepeat,
        6
      );
      expect(vertex.aU).toBeCloseTo(vertex.bU, 6);
      expect(vertex.aV).toBeCloseTo(vertex.bV, 6);
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

describe('SyntyHexFloor regional floor lighting', () => {
  it('composes per-cell exposure and pools without changing profile UVs or remembered precedence', async () => {
    const floorLighting: DungeonFloorLighting = {
      exposureByCell: new Map([
        ['0,0,0', 0],
        ['1,-1,0', 1],
      ]),
      poolsByCell: new Map([
        [
          '0,0,0',
          [
            {
              position: [0, 1.2, 0],
              color: '#ff9d52',
              distance: 5.5,
            },
          ],
        ],
      ]),
    };
    const noPool = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [1, -1, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
        spaceTheme="crypt"
        floorLighting={{
          exposureByCell: new Map([
            ['0,0,0', 0],
            ['1,-1,0', 1],
          ]),
          poolsByCell: new Map(),
        }}
      />
    );
    const noPoolColors = floorTileColors(noPool);
    expect(noPoolColors[0]!.getHexString()).toBe('101318');
    expect(noPoolColors[1]!.getHexString()).toBe(CRYPT_TINT.getHexString());
    const plainUvs = floorMeshes(noPool).map((mesh) =>
      Array.from(mesh.geometry.getAttribute('uv').array)
    );
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [1, -1, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
        spaceTheme="crypt"
        floorLighting={floorLighting}
      />
    );
    const meshes = floorMeshes(renderer);
    const materials = renderer.scene
      .findAllByType('MeshBasicMaterial')
      .map(
        (node) =>
          (node as unknown as { instance: THREE.MeshBasicMaterial }).instance
      );
    const colors = floorTileColors(renderer);

    expect(colors[0]!.r).toBeGreaterThan(CRYPT_DARK_FLOOR_TINT.r);
    expect(colors[0]!.r).toBeGreaterThan(cryptFloorBaseColor(0).r);
    expect(isCloseTo(colors[1]!, CRYPT_TINT)).toBe(true);
    expect(materials).toHaveLength(2);
    expect(
      materials.every((material) => material.type === 'MeshBasicMaterial')
    ).toBe(true);
    expect(materials.every((material) => material.toneMapped === false)).toBe(
      true
    );
    expect(
      meshes.map((mesh) => Array.from(mesh.geometry.getAttribute('uv').array))
    ).toEqual(plainUvs);

    await renderer.update(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [1, -1, 0])}
        hexSize={1}
        profile={CRYPT_FLOOR_PROFILE}
        spaceTheme="crypt"
        floorLighting={floorLighting}
        rememberedFloorHexKeys={new Set(['0,0,0'])}
      />
    );
    expect(floorTileColors(renderer)[0]!.getHexString()).toBe('465366');
    expect(
      Array.from(floorMeshes(renderer)[0]!.geometry.getAttribute('uv').array)
    ).toEqual(plainUvs[0]);
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
