/**
 * Animated armor rendering through the REAL render path.
 *
 * The armor is the first monster promoted STANDING-ONLY: no `-downed.glb`
 * sibling exists and none was requested (rpg-game-assets#172 asked for it to
 * disappear instead; Kirk confirmed 2026-09-11). `monsterModels.test.ts`
 * proves the resolver returns no url once it is downed. That alone is not
 * enough — an undefined url is ALSO what an unmapped ref produces, and that
 * case must still render the generic MediumHumanoid placeholder. Only the
 * real component decides between "draw nothing" and "draw the placeholder",
 * so only a render test can prove it chose right.
 *
 * Same mocking line as HexEntityZombieSelection.test.tsx: stub the loaders,
 * never the logic. resolveMonsterModelUrl, monsterHidesWhenDowned, and
 * HexEntity's branch all run for real.
 */

import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// MediumHumanoid's OBJ parts have no URL base under vitest. Its mocked return
// is an empty THREE.Group carrying NO geometry, which is what makes the mesh
// counts below discriminate: a placeholder mount contributes zero meshes, a
// GLB mount contributes the mocked scene's one Box.
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

import { HexEntity } from './HexEntity';

const ARMOR_URL = '/models/synty/npcs/animated-armor-open-helm.glb';

const base = {
  name: 'Animated Armor',
  position: { x: 0, y: 0, z: 0 },
  hexSize: 1,
  type: 'monster' as const,
  monsterRefId: 'animated-armor',
  entityId: 'animated-armor-1',
};

/**
 * The raycast proxy capsule HexEntity always mounts (zero-opacity material,
 * so the cell stays clickable). Every render below includes it, which is why
 * assertions count meshes ABOVE this baseline rather than against zero.
 */
const RAYCAST_PROXY_MESHES = 1;

/**
 * Total nodes in a rendered scene.
 *
 * Mesh counts are NOT a usable signal for "was a body drawn": MediumHumanoid's
 * OBJ parts are mocked to empty groups carrying no geometry, so the placeholder
 * contributes ZERO meshes and a mesh count cannot tell it apart from drawing
 * nothing at all. It mounts a sizeable group subtree though, so node count can.
 * Measured with the hide branch in place: hidden armor 4 nodes, placeholder 30.
 */
function countNodes(node: { children?: unknown[] }): number {
  return (
    1 +
    ((node.children ?? []) as { children?: unknown[] }[]).reduce(
      (sum, child) => sum + countNodes(child),
      0
    )
  );
}

describe('HexEntity animated armor (standing-only, real render path)', () => {
  beforeEach(() => {
    hoisted.useGLTFSpy.mockClear();
  });

  it('mounts the open-helm GLB while standing', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity {...base} onClick={() => {}} />
    );

    expect(
      Array.from(new Set(hoisted.useGLTFSpy.mock.calls.map((c) => c[0])))
    ).toEqual([ARMOR_URL]);
    expect(renderer.scene.findAllByType('Mesh').length).toBeGreaterThan(
      RAYCAST_PROXY_MESHES
    );
  });

  it('draws NO body once downed, and never requests a -downed.glb', async () => {
    const downedArmor = await ReactThreeTestRenderer.create(
      <HexEntity {...base} isDead onClick={() => {}} />
    );
    // Baseline for "a body WAS drawn": an unmapped ref is undefined-url just
    // like the downed armor, but keeps its MediumHumanoid placeholder.
    const placeholder = await ReactThreeTestRenderer.create(
      <HexEntity {...base} monsterRefId="ghost" isDead onClick={() => {}} />
    );

    // Nothing was loaded at all -- not the standing GLB, and crucially not a
    // derived '-downed.glb' that would 404 and degrade to MediumHumanoid.
    expect(hoisted.useGLTFSpy).not.toHaveBeenCalled();

    // No placeholder took its place either. Compared against the placeholder
    // render rather than a magic number, because a MESH count cannot tell
    // these apart -- see countNodes.
    expect(countNodes(downedArmor.scene)).toBeLessThan(
      countNodes(placeholder.scene)
    );

    // The raycast proxy still mounts, so the hex remains clickable and
    // selectable: the entity did not stop existing, its body stopped being
    // drawn.
    expect(downedArmor.scene.findAllByType('Mesh').length).toBe(
      RAYCAST_PROXY_MESHES
    );
  });

  it('still shows the placeholder for an unmapped dead monster -- undefined url alone must not hide a body', async () => {
    // The control case, and the entire reason monsterHidesWhenDowned exists.
    // 'ghost' resolves to undefined when downed EXACTLY as the armor does,
    // but it is unmapped rather than standing-only, so it must keep its
    // MediumHumanoid placeholder.
    //
    // Asserting "the ghost tree is non-empty" would be a test that cannot
    // fail -- the raycast proxy alone satisfies it. The two renders are
    // compared against each other instead: the placeholder mounts a subtree
    // the hidden armor does not, so the ghost's node count must be strictly
    // larger. Make HexEntity hide the ghost too and this goes red.
    const hiddenArmor = await ReactThreeTestRenderer.create(
      <HexEntity {...base} isDead onClick={() => {}} />
    );
    const unmappedGhost = await ReactThreeTestRenderer.create(
      <HexEntity {...base} monsterRefId="ghost" isDead onClick={() => {}} />
    );

    expect(hoisted.useGLTFSpy).not.toHaveBeenCalled();

    expect(countNodes(unmappedGhost.scene)).toBeGreaterThan(
      countNodes(hiddenArmor.scene)
    );
  });
});
