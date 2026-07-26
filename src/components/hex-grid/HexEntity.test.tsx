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
    useAnimations: () => ({
      actions: {},
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
