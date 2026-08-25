import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PropVariant } from './propManifest';

// Same stub convention as GlbInstance.test.tsx/SyntyHexWall.test.tsx, but
// tags each returned scene's single mesh with the requested url (via
// `.name`) so a test can tell a companion's GLB apart from its parent's —
// the real useGLTF cache is keyed by url and would naturally return
// different scenes for different files; this mock preserves that
// distinguishing behavior instead of collapsing every call to one shared
// scene.
vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial()
    );
    mesh.name = url;
    scene.add(mesh);
    return { scene };
  },
}));

import { PropModel } from './PropModel';

// Matched via `.findAllByType('Mesh'/'Group')` (a type-name STRING),
// never `instanceof` — the test renderer's reconciler creates JSX
// intrinsics (`<group>`, `<mesh>`) using its OWN resolved copy of the
// `three` package, a real, harmless duplicate install already present in
// this repo's node_modules (same caveat SyntyHexFloor.test.tsx's own doc
// comment calls out), so an `instanceof THREE.Group` check using THIS
// file's `three` import can silently return false for a group that IS a
// Group from the other copy. `<primitive object={x}>` elements don't hit
// this (they re-parent the exact object `x` the caller already
// constructed, never a fresh one), which is why only the intrinsics
// below need the string-typed lookup.
function meshNames(renderer: {
  scene: { findAllByType: (t: string) => unknown[] };
}): string[] {
  return renderer.scene
    .findAllByType('Mesh')
    .map((n) => (n as { instance: THREE.Mesh }).instance.name);
}

const BASE_VARIANT: PropVariant = {
  name: 'SM_Prop_Candles_01',
  file: 'props/SM_Prop_Candles_01.glb',
  role: 'decor',
  footprintHexes: 1,
  blocksLoS: false,
};

describe('PropModel companion rendering (rpg-game-assets#36 wave-1, issue #623)', () => {
  it('renders only the parent mesh when the variant has no companions — every pre-wave-1 caller, unchanged', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={BASE_VARIANT} position={[1, 0, 2]} />
    );
    const names = meshNames(renderer);
    expect(names).toEqual(['/models/synty/props/SM_Prop_Candles_01.glb']);
  });

  it('renders a companion mesh alongside the parent when the variant carries one', async () => {
    const variant: PropVariant = {
      ...BASE_VARIANT,
      companions: [
        {
          name: 'SM_Prop_Candles_01_Particle',
          file: 'props/SM_Prop_Candles_01_Particle.glb',
        },
      ],
    };
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={variant} position={[1, 0, 2]} />
    );
    const names = meshNames(renderer);
    expect(names).toHaveLength(2);
    expect(names).toContain('/models/synty/props/SM_Prop_Candles_01.glb');
    expect(names).toContain(
      '/models/synty/props/SM_Prop_Candles_01_Particle.glb'
    );
  });

  it('renders every companion when a variant carries more than one', async () => {
    const variant: PropVariant = {
      ...BASE_VARIANT,
      companions: [
        { name: 'A', file: 'props/A.glb' },
        { name: 'B', file: 'props/B.glb' },
      ],
    };
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={variant} position={[0, 0, 0]} />
    );
    const names = meshNames(renderer);
    expect(names).toHaveLength(3);
  });

  it('places the companion at the SAME anchor as the parent — one shared group transform, no independent companion position', async () => {
    const variant: PropVariant = {
      ...BASE_VARIANT,
      companions: [
        {
          name: 'SM_Prop_Candles_01_Particle',
          file: 'props/SM_Prop_Candles_01_Particle.glb',
        },
      ],
    };
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={variant} position={[3, 0, 4]} rotationY={1.2} />
    );
    // Three Groups exist in the tree: the outer transform-holding group
    // PropModel renders, plus each cloned GLB scene's own root Group (the
    // mock's `useGLTF` returns a bare THREE.Group per file) — find the
    // outer one by its distinguishing position instead of assuming
    // there's only one Group in the tree.
    const groups = renderer.scene
      .findAllByType('Group')
      .map((n) => (n as unknown as { instance: THREE.Group }).instance);
    const outer = groups.find((g) => g.position.x === 3);
    expect(outer).toBeDefined();
    expect(outer!.position.toArray()).toEqual([3, DUNGEON_SURFACE_Y, 4]);
    expect(outer!.rotation.y).toBeCloseTo(1.2);
    // Both meshes are children of this one group — neither the parent
    // primitive nor the companion primitive carries its own position, so
    // both inherit the identical world transform from here.
    expect(renderer.scene.findAllByType('Mesh')).toHaveLength(2);
  });
});

describe('PropModel shared placement', () => {
  it('renders every prop at the shared SYNTY_SCALE', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={BASE_VARIANT} position={[0, 0, 9]} />
    );
    const groups = renderer.scene
      .findAllByType('Group')
      .map((n) => (n as unknown as { instance: THREE.Group }).instance);
    const outer = groups.find((group) => group.position.z === 9);
    expect(outer?.scale.x).toBeCloseTo(SYNTY_SCALE);
  });

  it('adds the dungeon surface height to the caller-provided Y position', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={BASE_VARIANT} position={[2, 0.07, 5]} />
    );
    const groups = renderer.scene
      .findAllByType('Group')
      .map((n) => (n as unknown as { instance: THREE.Group }).instance);
    const outer = groups.find(
      (group) => group.position.x === 2 && group.position.z === 5
    );
    expect(outer?.position.y).toBeCloseTo(0.07 + DUNGEON_SURFACE_Y);
  });
});

describe('PropModel remembered tinting (rpg-dnd5e-web#605/#609)', () => {
  function meshMaterials(renderer: {
    scene: { findAllByType: (t: string) => unknown[] };
  }): THREE.MeshStandardMaterial[] {
    return renderer.scene
      .findAllByType('Mesh')
      .map(
        (n) =>
          (n as { instance: THREE.Mesh }).instance
            .material as THREE.MeshStandardMaterial
      );
  }

  it('leaves the parent mesh untinted when remembered is omitted — every pre-existing caller, unchanged', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={BASE_VARIANT} position={[0, 0, 0]} />
    );
    const [material] = meshMaterials(renderer);
    expect(`#${material!.color.getHexString()}`).toBe('#ffffff');
  });

  it('tints the parent mesh with the shared crypt-memory color when remembered', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={BASE_VARIANT} position={[0, 0, 0]} remembered />
    );
    const [material] = meshMaterials(renderer);
    // White (the mock's default MeshStandardMaterial color) multiplied by
    // CRYPT_MEMORY_COLOR is exactly CRYPT_MEMORY_COLOR itself.
    expect(`#${material!.color.getHexString()}`).toBe('#465366');
  });

  it('tints every companion mesh alongside the parent when remembered — a remembered candle prop does not leave its flame at full brightness', async () => {
    const variant: PropVariant = {
      ...BASE_VARIANT,
      companions: [
        {
          name: 'SM_Prop_Candles_01_Particle',
          file: 'props/SM_Prop_Candles_01_Particle.glb',
        },
      ],
    };
    const renderer = await ReactThreeTestRenderer.create(
      <PropModel variant={variant} position={[0, 0, 0]} remembered />
    );
    const materials = meshMaterials(renderer);
    expect(materials).toHaveLength(2);
    for (const material of materials) {
      expect(`#${material.color.getHexString()}`).toBe('#465366');
    }
  });
});
