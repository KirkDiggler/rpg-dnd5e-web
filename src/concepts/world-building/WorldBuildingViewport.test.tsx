import ReactThreeTestRenderer from '@react-three/test-renderer';
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
  TransformControls: ({ children }: { children?: React.ReactNode }) => children,
  useGLTF: () => {
    if (modelState.value === 'pending') throw modelState.pending;
    if (modelState.value === 'error') throw new Error('model failed');
    return { scene: loadedScene };
  },
}));

import { resolveWorldSelectionId } from './worldBuildingPointer';
import { WorldPropVisual } from './WorldBuildingViewport';

const TABLE: WorldProp = {
  id: 'table',
  kind: 'prop',
  assetRef: 'dnd5e:props:torture-table',
  label: 'torture table',
  transform: { x: 2, y: 0, z: 3, rotationY: 0 },
};

function renderVisual(
  options: {
    selected?: boolean;
    onSelect?: (ids: string[]) => void;
    isGizmoPointer?: () => boolean;
  } = {}
) {
  const {
    selected = false,
    onSelect = vi.fn(),
    isGizmoPointer = () => false,
  } = options;
  return ReactThreeTestRenderer.create(
    <WorldPropVisual
      item={TABLE}
      selected={selected}
      onSelect={onSelect}
      selectedIds={selected ? ['table'] : []}
      isGizmoPointer={isGizmoPointer}
      resolveSelectionId={() => TABLE.id}
      onAssetState={vi.fn()}
    />
  );
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  modelState.value = 'loaded';
});

describe('WorldPropVisual surface and pointer ownership', () => {
  it('prefers an overlapping supported decoration so Shift-left can add it after its support', () => {
    const tableHitbox = new THREE.Mesh();
    tableHitbox.userData.worldBuildingInteractionId = 'table';
    const candleHitbox = new THREE.Mesh();
    candleHitbox.userData.worldBuildingInteractionId = 'candle';
    const scene = {
      version: 1 as const,
      id: 'scene',
      name: 'Scene',
      groups: [],
      items: [
        TABLE,
        {
          ...TABLE,
          id: 'candle',
          assetRef: 'dnd5e:props:candles',
          supportId: 'table',
        },
      ],
    };
    const intersection = (object: THREE.Object3D, distance: number) =>
      ({ object, distance, point: new THREE.Vector3() }) as THREE.Intersection;

    expect(
      resolveWorldSelectionId(scene, [
        intersection(tableHitbox, 1),
        intersection(candleHitbox, 2),
      ])
    ).toBe('candle');
  });

  it('tags only the confirmed loaded PropModel subtree as a support drop surface', async () => {
    const renderer = await renderVisual({ selected: true });
    const eligible = renderer.scene.findByProps({
      name: 'world-building-loaded-surface-table',
    });

    expect(eligible.props.userData).toEqual({
      worldBuildingSupportId: 'table',
    });
    const overlay = renderer.scene.findByProps({
      name: 'world-building-selection-table',
    });
    expect(overlay.props.userData).toBeUndefined();
    expect(overlay.props.raycast).toBeTypeOf('function');
  });

  it('does not expose a support tag while the real model is loading', async () => {
    modelState.value = 'pending';
    const renderer = await renderVisual();
    expect(
      renderer.scene.findByProps({ name: 'world-building-model-loading' })
    ).toBeTruthy();
    expect(
      renderer.scene.findAllByProps({
        name: 'world-building-loaded-surface-table',
      })
    ).toHaveLength(0);
  });

  it('does not expose a support tag on the model error fallback', async () => {
    modelState.value = 'error';
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const renderer = await renderVisual();
    expect(
      renderer.scene.findByProps({ name: 'world-building-model-error' })
    ).toBeTruthy();
    expect(
      renderer.scene.findAllByProps({
        name: 'world-building-loaded-surface-table',
      })
    ).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('reserves left click for selection and leaves middle/right gestures alone', async () => {
    const onSelect = vi.fn();
    const renderer = await renderVisual({ onSelect });
    const interaction = renderer.scene.findByProps({
      name: 'world-building-interaction-table',
    });

    await renderer.fireEvent(interaction, 'pointerDown', {
      button: 1,
      shiftKey: false,
      stopPropagation: vi.fn(),
    });
    await renderer.fireEvent(interaction, 'pointerDown', {
      button: 2,
      shiftKey: false,
      stopPropagation: vi.fn(),
    });
    expect(onSelect).not.toHaveBeenCalled();

    await renderer.fireEvent(interaction, 'pointerDown', {
      button: 0,
      shiftKey: false,
      stopPropagation: vi.fn(),
    });
    expect(onSelect).toHaveBeenCalledWith(['table']);
  });

  it('does not change selection when a visible gizmo owns the pointer', async () => {
    const onSelect = vi.fn();
    const renderer = await renderVisual({
      onSelect,
      isGizmoPointer: () => true,
    });
    const interaction = renderer.scene.findByProps({
      name: 'world-building-interaction-table',
    });

    await renderer.fireEvent(interaction, 'pointerDown', {
      button: 0,
      shiftKey: false,
      stopPropagation: vi.fn(),
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
