import ReactThreeTestRenderer, {
  ReactThreeTest,
} from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldProp } from './types';

const modelState = vi.hoisted(() => ({
  value: 'loaded' as 'loaded' | 'pending' | 'error',
  pending: new Promise<never>(() => {}),
}));
const loadedScene = new THREE.Group();
loadedScene.add(
  new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
);

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  useGLTF: () => {
    if (modelState.value === 'pending') throw modelState.pending;
    if (modelState.value === 'error') throw new Error('model failed');
    return { scene: loadedScene };
  },
}));

import { WorldPropVisual } from './WorldBuildingViewport';

const TABLE: WorldProp = {
  id: 'table',
  kind: 'prop',
  assetRef: 'dnd5e:props:torture-table',
  label: 'torture table',
  transform: { x: 2, y: 0, z: 3, rotationY: 0 },
};

function renderVisual(onPlaceSurface = vi.fn(), selected = false) {
  return ReactThreeTestRenderer.create(
    <WorldPropVisual
      item={TABLE}
      selected={selected}
      dragDelta={null}
      placement={{ kind: 'prop', id: 'dnd5e:props:candles' }}
      onSelect={vi.fn()}
      selectedIds={selected ? ['table'] : []}
      onDragStart={vi.fn()}
      onDragChange={vi.fn()}
      onDragEnd={vi.fn()}
      onPlaceSurface={onPlaceSurface}
      onAssetState={vi.fn()}
    />
  );
}

function hasPlacementHandlerInAncestry(
  node: ReactThreeTest.ReactThreeTestInstance
): boolean {
  let current: ReactThreeTest.ReactThreeTestInstance | null = node;
  while (current) {
    if (typeof current.props.onPointerDown === 'function') return true;
    current = current.parent;
  }
  return false;
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  modelState.value = 'loaded';
});

describe('WorldPropVisual surface eligibility', () => {
  it('authors support placement only from the confirmed loaded PropModel subtree', async () => {
    const onPlaceSurface = vi.fn();
    const renderer = await renderVisual(onPlaceSurface, true);
    const eligible = renderer.scene.findByProps({
      name: 'world-building-loaded-surface-table',
    });
    const modelMesh = eligible.findByType('Mesh');

    expect(hasPlacementHandlerInAncestry(modelMesh)).toBe(true);
    await renderer.fireEvent(eligible, 'pointerDown', {
      face: { normal: new THREE.Vector3(0, 1, 0) },
      object: modelMesh.instance,
      point: new THREE.Vector3(2.2, 1.1, 3.1),
      stopPropagation: vi.fn(),
    });
    expect(onPlaceSurface).toHaveBeenCalledTimes(1);
    expect(onPlaceSurface.mock.calls[0]?.[0]).toMatchObject({ x: 2.2, z: 3.1 });
    expect(onPlaceSurface.mock.calls[0]?.[0].y).toBeCloseTo(0.9);
    expect(onPlaceSurface.mock.calls[0]?.[1]).toBe('table');

    const overlay = renderer.scene.findByProps({
      name: 'world-building-selection-table',
    });
    expect(hasPlacementHandlerInAncestry(overlay)).toBe(false);
  });

  it('does not make the loading fallback eligible for support placement', async () => {
    modelState.value = 'pending';
    const renderer = await renderVisual();
    const fallback = renderer.scene.findByProps({
      name: 'world-building-model-loading',
    });

    expect(hasPlacementHandlerInAncestry(fallback)).toBe(false);
    expect(
      renderer.scene.findAllByProps({
        name: 'world-building-loaded-surface-table',
      })
    ).toHaveLength(0);
  });

  it('does not make the error fallback eligible for support placement', async () => {
    modelState.value = 'error';
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const renderer = await renderVisual();
    const fallback = renderer.scene.findByProps({
      name: 'world-building-model-error',
    });

    expect(hasPlacementHandlerInAncestry(fallback)).toBe(false);
    expect(
      renderer.scene.findAllByProps({
        name: 'world-building-loaded-surface-table',
      })
    ).toHaveLength(0);
    consoleError.mockRestore();
  });
});
