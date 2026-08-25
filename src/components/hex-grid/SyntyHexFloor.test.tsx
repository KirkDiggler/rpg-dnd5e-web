import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';

vi.mock('@react-three/drei', () => ({
  useTexture: () => new THREE.Texture(),
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
