/**
 * Zombie rendering through the REAL render path.
 *
 * rpg-dnd5e-web#673 mapped two promoted zombie looks and this file proved the
 * per-entity discrimination between them survived the real component chain.
 * Kirk narrowed the ref to ONE look (gaunt) on 2026-09-11, so every assertion
 * here now proves the opposite property — no entity id produces anything but
 * `zombie-peasant-female.glb`. The render-path plumbing this file exercises is
 * unchanged and is why it was worth keeping rather than deleting.
 *
 * monsterModels.test.ts already proves the pure resolver
 * (resolveMonsterModelUrl / pickStableCandidateIndex) returns the single
 * mapped look for any entity id. This file proves that result survives all
 * the way through the REAL component chain a zombie entity actually mounts
 * through on the game screen:
 *
 *   HexEntity -> resolveMonsterModelUrl(...) -> ClassCharacterModel(url)
 *     -> useGLTF(url)
 *
 * Only the GLTF network fetch itself is stubbed -- same "stub the loader,
 * not the logic" line HexEntity.test.tsx already draws for MediumHumanoid's
 * OBJLoader. resolveMonsterModelUrl, HexEntity's branch selection, and
 * ClassCharacterModel's prop wiring all run for real, unmocked. Nothing
 * here calls resolveMonsterModelUrl directly and asserts on its return
 * value in place of rendering -- every assertion below reads what
 * useGLTF was actually called with, downstream of HexEntity's real
 * decision.
 */

import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference this spy from inside the vi.mock factory
// below (which is hoisted above imports) AND from the test bodies.
const hoisted = vi.hoisted(() => ({
  useGLTFSpy: vi.fn<
    (url: string) => { scene: THREE.Group; animations: never[] }
  >(() => {
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      )
    );
    return { scene, animations: [] };
  }),
}));

// MediumHumanoid loads a .obj per body part via useLoader, which has no URL
// base under vitest -- stub it the same way HexEntity.test.tsx does. Its
// mocked return (an empty THREE.Group, no geometry) is what makes the
// "never the MediumHumanoid fallback" assertion below meaningful: a
// fallback mount would contribute zero Mesh nodes to the scene, versus the
// mocked GLTF scene's one Box mesh.
vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/fiber')>();
  const useLoader = (loader: unknown) =>
    loader === THREE.TextureLoader ? new THREE.Texture() : new THREE.Group();
  useLoader.preload = () => {};
  useLoader.clear = () => {};
  return { ...actual, useLoader };
});

vi.mock('@react-three/drei', () => ({
  useGLTF: hoisted.useGLTFSpy,
  useTexture: () => new THREE.Texture(),
  useAnimations: () => ({
    actions: {},
    names: [],
    mixer: new THREE.AnimationMixer(new THREE.Group()),
  }),
}));

// Imported AFTER the mocks so both the mocked drei/fiber AND the REAL
// resolveMonsterModelUrl are in effect for HexEntity's module graph.
import { HexEntity } from './HexEntity';
import { resolveMonsterModelUrl } from './monsterModels';

const ZOMBIE_GAUNT_URL = '/models/synty/npcs/zombie-peasant-female.glb';
const ZOMBIE_GAUNT_DOWNED_URL =
  '/models/synty/npcs/zombie-peasant-female-downed.glb';

const base = {
  name: 'Zombie',
  position: { x: 0, y: 0, z: 0 },
  hexSize: 1,
  type: 'monster' as const,
  monsterRefId: 'zombie',
};

/**
 * Entity ids whose hashes landed on DIFFERENT candidates back when `zombie`
 * mapped to two looks (rpg-dnd5e-web#673's `findIdsForBothStyles` search
 * found this pair). Kept as the sample precisely because of that history:
 * if a second candidate were ever reintroduced by accident, these two are
 * the ids most likely to diverge, so asserting they agree is a sharper
 * check than two arbitrary strings would be.
 */
const DIVERGENT_ID_A = 'zombie-entity-0';
const DIVERGENT_ID_B = 'zombie-entity-1';

/**
 * Every unique url `useGLTF` was called with across the render, in call
 * order. Some real-path renders here go through more than one commit pass
 * (e.g. `useHexMovePath`/`useEntityFacing`'s mount effects triggering a
 * benign re-render with unchanged resolved props) -- exact call COUNT is a
 * @react-three/test-renderer implementation detail, not something this
 * suite is testing. What matters, and what every assertion below checks,
 * is which url(s) were used and whether they're stable -- not how many
 * times the mocked loader happened to be invoked to get there.
 */
function calledUrls(): string[] {
  return hoisted.useGLTFSpy.mock.calls.map((call) => call[0] as string);
}

function uniqueCalledUrls(): string[] {
  return Array.from(new Set(calledUrls()));
}

describe('HexEntity zombie rendering (one look, real render path)', () => {
  beforeEach(() => {
    hoisted.useGLTFSpy.mockClear();
  });

  it('mounts a zombie entity through the real GLB path, never the MediumHumanoid fallback', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        entityId="zombie-fallback-check"
        onClick={() => {}}
      />
    );

    const urls = uniqueCalledUrls();
    // Exactly one DISTINCT url across however many render passes -- the
    // mocked loader was never asked to load two different things for one
    // stable entity.
    expect(urls).toEqual([ZOMBIE_GAUNT_URL]);
    // At least one Mesh -- the mocked GLB scene's Box. A MediumHumanoid
    // fallback render contributes zero (its mocked OBJLoader groups carry
    // no geometry) -- see this file's module doc comment.
    expect(renderer.scene.findAllByType('Mesh').length).toBeGreaterThan(0);
  });

  it('renders two zombie entities with the SAME look, simultaneously, in one scene', async () => {
    // The inverse of what rpg-dnd5e-web#673 asserted here, through the same
    // real render path and with the same pair of ids that used to diverge.
    await ReactThreeTestRenderer.create(
      <>
        <HexEntity {...base} entityId={DIVERGENT_ID_A} onClick={() => {}} />
        <HexEntity {...base} entityId={DIVERGENT_ID_B} onClick={() => {}} />
      </>
    );

    expect(uniqueCalledUrls()).toEqual([ZOMBIE_GAUNT_URL]);
  });

  it('keeps the SAME resolved model for the SAME entity across a rerender -- no flicker', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity {...base} entityId={DIVERGENT_ID_A} onClick={() => {}} />
    );
    const firstUrls = uniqueCalledUrls();
    expect(firstUrls).toEqual([
      resolveMonsterModelUrl('zombie', undefined, false, DIVERGENT_ID_A),
    ]);

    hoisted.useGLTFSpy.mockClear();
    // Same entity, an unrelated prop toggled (isSelected) -- a real rerender
    // this entity would go through on the game screen (selection, HP tick,
    // reconnect replay), not a remount with a fresh id.
    await renderer.update(
      <HexEntity
        {...base}
        entityId={DIVERGENT_ID_A}
        isSelected
        onClick={() => {}}
      />
    );
    expect(uniqueCalledUrls()).toEqual(firstUrls);
  });

  it('downed variant resolves the gaunt downed GLB, for any entity id', async () => {
    await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        entityId={DIVERGENT_ID_A}
        isDead
        onClick={() => {}}
      />
    );
    expect(uniqueCalledUrls()).toEqual([ZOMBIE_GAUNT_DOWNED_URL]);

    hoisted.useGLTFSpy.mockClear();
    await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        entityId={DIVERGENT_ID_B}
        isDead
        onClick={() => {}}
      />
    );
    expect(uniqueCalledUrls()).toEqual([ZOMBIE_GAUNT_DOWNED_URL]);
  });

  it('leaves a non-zombie monster (skeleton) on its single deterministic GLB, unaffected by entityId', async () => {
    await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        monsterRefId="skeleton"
        entityId="skeleton-entity-A"
        onClick={() => {}}
      />
    );
    expect(uniqueCalledUrls()).toEqual([
      '/models/synty/npcs/skeleton-soldier-01.glb',
    ]);

    hoisted.useGLTFSpy.mockClear();
    await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        monsterRefId="skeleton"
        entityId="skeleton-entity-B-totally-different-id"
        onClick={() => {}}
      />
    );
    expect(uniqueCalledUrls()).toEqual([
      '/models/synty/npcs/skeleton-soldier-01.glb',
    ]);
  });
});
