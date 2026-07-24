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
 * Count materials of a given THREE class by their `object.type` string
 * (e.g. 'MeshBasicMaterial'/'MeshStandardMaterial') rather than
 * `instanceof` — the test renderer's reconciler and this test file can
 * each resolve their own copy of the `three` package (a real, harmless
 * duplicate-install already present in this repo's node_modules), so an
 * `instanceof` check across that boundary can silently return false for
 * an object that IS the right class from the OTHER copy. `.type` is a
 * plain string every THREE material subclass sets on itself, identical
 * across either copy.
 */
function countMaterialsByType(
  renderer: { scene: { findAllByType: (t: string) => unknown[] } },
  type: 'MeshBasicMaterial' | 'MeshStandardMaterial'
): number {
  return renderer.scene.findAllByType(type).length;
}

describe('SyntyHexFloor spaceTheme (rpg-dnd5e-web#558 real-route theme consumption)', () => {
  it('renders every tile with the default unlit MeshBasicMaterial when no theme/keys are set — byte-identical to the pre-#558 #481/#485 fix', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor floorTiles={tiles([0, 0, 0], [1, -1, 0])} hexSize={1} />
    );
    expect(countMaterialsByType(renderer, 'MeshBasicMaterial')).toBe(2);
    expect(countMaterialsByType(renderer, 'MeshStandardMaterial')).toBe(0);
  });

  it("spaceTheme='crypt' swaps EVERY tile to the lit MeshStandardMaterial, even with no themeFloorHexKeys at all — the real-route case", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [1, -1, 0], [2, -2, 0])}
        hexSize={1}
        spaceTheme="crypt"
      />
    );
    expect(countMaterialsByType(renderer, 'MeshStandardMaterial')).toBe(3);
    expect(countMaterialsByType(renderer, 'MeshBasicMaterial')).toBe(0);
  });

  it('themeFloorHexKeys alone (no spaceTheme) still themes only the named tile — the ?cryptdemo=1 harness path keeps working unchanged', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexFloor
        floorTiles={tiles([0, 0, 0], [1, -1, 0])}
        hexSize={1}
        themeFloorHexKeys={new Set(['0,0,0'])}
      />
    );
    expect(countMaterialsByType(renderer, 'MeshStandardMaterial')).toBe(1);
    expect(countMaterialsByType(renderer, 'MeshBasicMaterial')).toBe(1);
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
    expect(countMaterialsByType(renderer, 'MeshStandardMaterial')).toBe(2);
    expect(countMaterialsByType(renderer, 'MeshBasicMaterial')).toBe(0);
  });
});
