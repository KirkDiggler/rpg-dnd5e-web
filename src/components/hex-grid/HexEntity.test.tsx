/**
 * Remembered entity rendering (rpg-dnd5e-web#604).
 *
 * Task 1 (#602) made remembered GEOMETRY inert and crypt-tinted, and kept
 * remembered entities out of pathing, occupancy, turn order, and clicks. What
 * it did not do is tell `HexEntity` that it is a memory — so a remembered
 * goblin still renders in full colour, animating, as though it were live.
 *
 * These tests are the difference: a memory must look like one.
 */

import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// MediumHumanoid loads a .obj per body part, which has no URL base under
// vitest. Stub the loader so these tests are about interaction, not assets.
vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/fiber')>();
  const useLoader = (loader: unknown) =>
    loader === THREE.TextureLoader ? new THREE.Texture() : new THREE.Group();
  useLoader.preload = () => {};
  useLoader.clear = () => {};
  return { ...actual, useLoader };
});

vi.mock('@react-three/drei', () => {
  const make = () => {
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      )
    );
    return scene;
  };
  return {
    useGLTF: () => ({ scene: make(), animations: [] }),
    useTexture: () => new THREE.Texture(),
    // `names: []` (not omitted) — ClassCharacterModel's
    // resolveIdleClipName(names) reads this unconditionally on every
    // render; an undefined `names` throws past HexEntity's ErrorBoundary
    // and silently swaps in the MediumHumanoid fallback, which would make
    // every "monster"/"player" test below exercise the WRONG model path
    // without any test ever noticing (resolveIdleClipName's own doc
    // comment: `resolveIdleClipName([])` is the documented, safe
    // zero-clip case — matches a real clip-less GLB, not a broken mock).
    useAnimations: () => ({
      actions: {},
      names: [],
      mixer: new THREE.AnimationMixer(new THREE.Group()),
    }),
  };
});

import { HexEntity } from './HexEntity';

const base = {
  entityId: 'goblin-1',
  name: 'Goblin',
  position: { x: 0, y: 0, z: 0 },
  hexSize: 1,
} as const;

const handlerCount = (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  prop: 'onClick' | 'onPointerOver' | 'onPointerOut'
) =>
  renderer.scene.findAll((node) => typeof node.props[prop] === 'function')
    .length;

describe('remembered entities are inert', () => {
  it('gives a remembered monster no pointer handlers at all', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        type="monster"
        monsterRefId="skeleton"
        knowledgeState="remembered"
        onClick={() => {}}
      />
    );

    // Not even the stop-propagating no-op a ghost keeps: a memory is scenery.
    expect(handlerCount(renderer, 'onClick')).toBe(0);
    expect(handlerCount(renderer, 'onPointerOver')).toBe(0);
    expect(handlerCount(renderer, 'onPointerOut')).toBe(0);
  });

  it('leaves an ordinary ghost its stop-propagating click', async () => {
    // Regression guard: remembered is a NEW state, not a rename of ghosting.
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        type="monster"
        monsterRefId="skeleton"
        isGhost
        onClick={() => {}}
      />
    );

    expect(handlerCount(renderer, 'onClick')).toBeGreaterThan(0);
  });

  it('keeps a live monster interactive', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        type="monster"
        monsterRefId="skeleton"
        onClick={() => {}}
      />
    );

    expect(handlerCount(renderer, 'onClick')).toBeGreaterThan(0);
    expect(handlerCount(renderer, 'onPointerOver')).toBeGreaterThan(0);
  });

  it('renders a remembered obstacle without handlers', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        type="obstacle"
        knowledgeState="remembered"
        onClick={() => {}}
      />
    );

    expect(handlerCount(renderer, 'onClick')).toBe(0);
  });
});

describe('raycast proxy (rpg-dnd5e-web unit/game-fidelity Bug A)', () => {
  // A THREE.SkinnedMesh raycasts against its BIND-POSE geometry, not the
  // pose the idle/walk clip actually renders — clicks on the visible
  // (animated) body hit-or-miss by animation frame with no console signal
  // on a miss. HexEntity now mounts an invisible, static capsule alongside
  // the model and the model's own meshes opt OUT of raycasting entirely
  // (ClassCharacterModel's `cloned` useMemo), so the proxy is the only
  // thing left for R3F's raycaster to ever hit.
  function meshes(
    renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
  ) {
    return renderer.scene.findAllByType('Mesh') as unknown as {
      instance: THREE.Mesh;
    }[];
  }

  it('mounts an invisible capsule raycast proxy alongside a live monster model', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        type="monster"
        monsterRefId="skeleton"
        onClick={() => {}}
      />
    );

    const proxy = meshes(renderer).find(
      (m) => m.instance.geometry.type === 'CapsuleGeometry'
    );
    expect(proxy).toBeDefined();
    const material = proxy!.instance.material as THREE.MeshBasicMaterial;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0);
    // Untouched — only ClassCharacterModel's own GLB meshes opt out. A
    // real THREE.Mesh.raycast takes (raycaster, intersects); the no-op
    // override installed on the model's own meshes takes neither — arity
    // is a robust way to tell them apart without an identity comparison
    // against THREE.Mesh.prototype (this test environment can end up with
    // more than one loaded copy of three.js, which would make a strict
    // `toBe` comparison meaningless either way).
    expect(proxy!.instance.raycast.length).toBe(2);
  });

  it('disables raycasting on the GLB-sourced model mesh so only the proxy is hittable', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        type="monster"
        monsterRefId="skeleton"
        onClick={() => {}}
      />
    );

    // The mocked useGLTF scene (top of this file) is a single BoxGeometry
    // mesh standing in for the real skinned GLB.
    const modelMesh = meshes(renderer).find(
      (m) => m.instance.geometry.type === 'BoxGeometry'
    );
    expect(modelMesh).toBeDefined();
    // Arity, not identity (see the proxy test's own comment for why) — a
    // real THREE.Mesh.raycast takes (raycaster, intersects); the no-op
    // override takes neither.
    expect(modelMesh!.instance.raycast.length).toBe(0);

    // The override is a genuine no-op, not merely a different function —
    // calling it must never append an intersection.
    const intersects: THREE.Intersection[] = [];
    expect(() =>
      modelMesh!.instance.raycast(new THREE.Raycaster(), intersects)
    ).not.toThrow();
    expect(intersects).toHaveLength(0);
  });

  it('mounts the same invisible capsule proxy for a live player entity', async () => {
    // characters are skinned too (ClassCharacterModel renders both player
    // and monster GLBs through the same component) — same proxy, same fix.
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity
        {...base}
        type="player"
        classRefId="rogue"
        onClick={() => {}}
      />
    );

    const proxy = meshes(renderer).find(
      (m) => m.instance.geometry.type === 'CapsuleGeometry'
    );
    expect(proxy).toBeDefined();
  });
});

describe('remembered entities look like a memory (rpg-dnd5e-web#605/#609)', () => {
  // An obstacle with no obstacleType/propRefId resolves no prop variant
  // (obstaclePropKeys.ts), so HexEntity falls back to the plain capsule —
  // the same fallback a real pillar/prop renders through whenever its GLB
  // hasn't synced (HexGrid's ErrorBoundary lineage), so this capsule path
  // is not a toy case.
  function capsuleMaterial(
    renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
  ) {
    const mesh = renderer.scene.findAllByType('Mesh')[0] as unknown as {
      instance: THREE.Mesh;
    };
    return mesh.instance.material as THREE.MeshStandardMaterial;
  }

  it('tints a remembered obstacle capsule with the shared crypt-memory color', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity {...base} type="obstacle" knowledgeState="remembered" />
    );
    // '#805ad5' (COLORS.obstacle.default) multiplied by CRYPT_MEMORY_COLOR
    // '#465366' is exactly CRYPT_MEMORY_COLOR's own hex — matches
    // cloneCryptMaterials' `color.multiply(CRYPT_MEMORY_COLOR)` when the
    // fallback capsule is built directly from cryptHex rather than routed
    // through that helper; either way the visible result is the same
    // shared memory tint.
    const color = capsuleMaterial(renderer).color;
    expect(`#${color.getHexString()}`).toBe('#465366');
  });

  it('renders a live (non-remembered) obstacle capsule in its normal color, unchanged', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HexEntity {...base} type="obstacle" />
    );
    const color = capsuleMaterial(renderer).color;
    expect(`#${color.getHexString()}`).toBe('#805ad5');
  });
});
