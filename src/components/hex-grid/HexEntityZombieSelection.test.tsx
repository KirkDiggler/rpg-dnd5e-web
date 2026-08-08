/**
 * Zombie rendering: stable per-entity style selection through the REAL
 * render path (rpg-dnd5e-web#673).
 *
 * monsterModels.test.ts already proves the pure resolver
 * (resolveMonsterModelUrl / pickStableCandidateIndex) discriminates
 * between the two promoted zombie styles and is stable per entity id. This
 * file proves that same discrimination survives all the way through the
 * REAL component chain a zombie entity actually mounts through on the game
 * screen:
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

const ZOMBIE_MUTANT_URL = '/models/synty/npcs/zombie-mutant.glb';
const ZOMBIE_PEASANT_URL = '/models/synty/npcs/zombie-peasant-female.glb';

const base = {
  name: 'Zombie',
  position: { x: 0, y: 0, z: 0 },
  hexSize: 1,
  type: 'monster' as const,
  monsterRefId: 'zombie',
};

/**
 * Find two entity ids that the REAL resolver maps to the two different
 * promoted zombie styles. Deliberately NOT hardcoded ids picked by hand --
 * searching a small id space with the real resolver means this fixture
 * stays correct even if the hash function's internals change (as long as
 * it still discriminates), and the search itself is an assertion: if the
 * resolver stops discriminating, this throws before any test body's own
 * assertions get a chance to run.
 */
function findIdsForBothStyles(): { mutantId: string; peasantId: string } {
  let mutantId: string | undefined;
  let peasantId: string | undefined;
  for (let i = 0; i < 500 && (!mutantId || !peasantId); i++) {
    const id = `zombie-entity-${i}`;
    const url = resolveMonsterModelUrl('zombie', undefined, false, id);
    if (url === ZOMBIE_MUTANT_URL && !mutantId) mutantId = id;
    if (url === ZOMBIE_PEASANT_URL && !peasantId) peasantId = id;
  }
  if (!mutantId || !peasantId) {
    throw new Error(
      'could not find sample entity ids resolving to both zombie styles -- ' +
        'resolveMonsterModelUrl / pickStableCandidateIndex may no longer ' +
        'discriminate (this throw IS the red signal, not a test bug)'
    );
  }
  return { mutantId, peasantId };
}

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

describe('HexEntity zombie rendering (rpg-dnd5e-web#673, real render path)', () => {
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
    expect(urls.length).toBe(1);
    expect(urls[0]).toMatch(
      /^\/models\/synty\/npcs\/zombie-(mutant|peasant-female)\.glb$/
    );
    // At least one Mesh -- the mocked GLB scene's Box. A MediumHumanoid
    // fallback render contributes zero (its mocked OBJLoader groups carry
    // no geometry) -- see this file's module doc comment.
    expect(renderer.scene.findAllByType('Mesh').length).toBeGreaterThan(0);
  });

  it('renders two different zombie entities with two different resolved styles, simultaneously, in one scene', async () => {
    const { mutantId, peasantId } = findIdsForBothStyles();

    await ReactThreeTestRenderer.create(
      <>
        <HexEntity {...base} entityId={mutantId} onClick={() => {}} />
        <HexEntity {...base} entityId={peasantId} onClick={() => {}} />
      </>
    );

    const urls = uniqueCalledUrls().sort();
    expect(urls).toEqual([ZOMBIE_MUTANT_URL, ZOMBIE_PEASANT_URL].sort());
  });

  it('keeps the SAME resolved style for the SAME entity across a rerender -- no flicker', async () => {
    const { mutantId } = findIdsForBothStyles();

    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity {...base} entityId={mutantId} onClick={() => {}} />
    );
    const firstUrls = uniqueCalledUrls();
    expect(firstUrls).toEqual([
      resolveMonsterModelUrl('zombie', undefined, false, mutantId),
    ]);

    hoisted.useGLTFSpy.mockClear();
    // Same entity, an unrelated prop toggled (isSelected) -- a real rerender
    // this entity would go through on the game screen (selection, HP tick,
    // reconnect replay), not a remount with a fresh id.
    await renderer.update(
      <HexEntity {...base} entityId={mutantId} isSelected onClick={() => {}} />
    );
    expect(uniqueCalledUrls()).toEqual(firstUrls);
  });

  it("downed variant resolves the entity's OWN style's downed GLB, not the other style's", async () => {
    const { mutantId, peasantId } = findIdsForBothStyles();
    const mutantStandingUrl = resolveMonsterModelUrl(
      'zombie',
      undefined,
      false,
      mutantId
    )!;
    const peasantStandingUrl = resolveMonsterModelUrl(
      'zombie',
      undefined,
      false,
      peasantId
    )!;

    await ReactThreeTestRenderer.create(
      <HexEntity {...base} entityId={mutantId} isDead onClick={() => {}} />
    );
    expect(uniqueCalledUrls()).toEqual([
      mutantStandingUrl.replace(/\.glb$/, '-downed.glb'),
    ]);

    hoisted.useGLTFSpy.mockClear();
    await ReactThreeTestRenderer.create(
      <HexEntity {...base} entityId={peasantId} isDead onClick={() => {}} />
    );
    expect(uniqueCalledUrls()).toEqual([
      peasantStandingUrl.replace(/\.glb$/, '-downed.glb'),
    ]);
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
