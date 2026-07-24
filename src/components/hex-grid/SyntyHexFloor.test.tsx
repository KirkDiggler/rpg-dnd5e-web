import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';

vi.mock('@react-three/drei', () => ({
  useTexture: () => new THREE.Texture(),
}));

import { SyntyHexFloor } from './SyntyHexFloor';

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

describe('SyntyHexFloor spaceTheme (rpg-dnd5e-web#558 real-route theme consumption)', () => {
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
