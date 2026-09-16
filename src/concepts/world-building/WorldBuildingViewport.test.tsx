import { HEX_SIZE, hexCorners } from '@/components/hex-grid/hexMath';
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
  Html: () => null,
  OrbitControls: () => null,
  TransformControls: ({ children }: { children?: React.ReactNode }) => children,
  useGLTF: () => {
    if (modelState.value === 'pending') throw modelState.pending;
    if (modelState.value === 'error') throw new Error('model failed');
    return { scene: loadedScene };
  },
}));

vi.mock('./WorkspaceFloorUnderlay', () => ({
  WorkspaceFloorUnderlay: ({ radius }: { radius: number }) => (
    <group name="workspace-floor-underlay-test" userData={{ radius }} />
  ),
}));

import { createWalkableHexFillGeometry } from './roomHexGeometry';
import { resolveWorldSelectionId } from './worldBuildingPointer';
import {
  WorldBuildingFog,
  WorldPropVisual,
  WorldSceneContents,
} from './WorldBuildingViewport';

const TABLE: WorldProp = {
  id: 'table',
  kind: 'prop',
  assetRef: 'dnd5e:props:torture-table',
  label: 'torture table',
  transform: { x: 2, y: 0, z: 3, rotationY: 0 },
};

const GENERATED_PROP: WorldProp = {
  ...TABLE,
  id: 'alchemy-tools',
  assetRef: 'dnd5e:props:dark-fortress:alchemy_tools_01',
  label: 'alchemy tools 01',
  transform: { x: -1, y: 0.2, z: 2, rotationY: 0.5 },
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

describe('editor atmosphere', () => {
  it('removes distance fog for room authoring and restores composer fog', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldBuildingFog roomAuthoring={false} />
    );
    const scene = renderer.scene.instance as THREE.Scene;
    expect(scene.fog).toMatchObject({ isFog: true, near: 15, far: 31 });

    await renderer.update(<WorldBuildingFog roomAuthoring />);
    expect(scene.fog).toBeNull();

    await renderer.update(<WorldBuildingFog roomAuthoring={false} />);
    expect(scene.fog).toMatchObject({ isFog: true, near: 15, far: 31 });
    await renderer.unmount();
  });
});

describe('room walkable fill geometry', () => {
  it('uses inset shared pointy grid corners in the floor X/Z plane', () => {
    const geometry = createWalkableHexFillGeometry();
    const positions = geometry.getAttribute('position');
    const boundary = Array.from({ length: 6 }, (_, index) => ({
      x: positions.getX(index + 1),
      z: positions.getZ(index + 1),
    }));
    const expected = hexCorners({ x: 0, z: 0 }, HEX_SIZE).map((corner) => ({
      x: corner.x * 0.86,
      z: corner.z * 0.86,
    }));

    boundary.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]!.x);
      expect(point.z).toBeCloseTo(expected[index]!.z);
    });
    expect(Math.max(...boundary.map((point) => Math.abs(point.z)))).toBeCloseTo(
      HEX_SIZE * 0.86
    );
    expect(Math.max(...boundary.map((point) => Math.abs(point.x)))).toBeCloseTo(
      (Math.sqrt(3) / 2) * HEX_SIZE * 0.86
    );
  });
});

describe('room-only workspace floor', () => {
  it('mounts only for room authoring and tracks the existing ground radius without mutations', async () => {
    const onWalkableGesture = vi.fn();
    const onTransformCommit = vi.fn();
    const baseProps = {
      scene: {
        version: 1 as const,
        id: 'scene',
        name: 'Room',
        items: [],
        groups: [],
      },
      previewScene: null,
      selectedIds: [],
      tool: 'select' as const,
      activeDrag: null,
      onSelect: vi.fn(),
      onDrop: vi.fn(),
      onDragFinished: vi.fn(),
      onTransformPreview: vi.fn(),
      onTransformCommit,
      onTransformReject: vi.fn(),
      onAssetState: vi.fn(),
      showCompositionBounds: false,
    };
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents {...baseProps} />
    );
    expect(
      renderer.scene.findAllByProps({ name: 'workspace-floor-underlay-test' })
    ).toHaveLength(0);

    await renderer.update(
      <WorldSceneContents
        {...baseProps}
        roomAuthoring={{
          tool: 'select',
          workspace: { hexRadius: 9, horizontalLimit: 20 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture,
        }}
      />
    );
    expect(
      renderer.scene.findByProps({ name: 'workspace-floor-underlay-test' })
        .props.userData.radius
    ).toBe(21);
    expect(onWalkableGesture).not.toHaveBeenCalled();
    expect(onTransformCommit).not.toHaveBeenCalled();
    await renderer.unmount();
  });
});

describe('room floor pointer ownership', () => {
  it('captures brush drags so off-ground release commits once and cancel cannot leave stale cells', async () => {
    const onWalkableGesture = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        scene={{
          version: 1,
          id: 'scene',
          name: 'Room',
          items: [],
          groups: [],
        }}
        previewScene={null}
        selectedIds={[]}
        tool="select"
        activeDrag={null}
        onSelect={vi.fn()}
        onDrop={vi.fn()}
        onDragFinished={vi.fn()}
        onTransformPreview={vi.fn()}
        onTransformCommit={vi.fn()}
        onTransformReject={vi.fn()}
        onAssetState={vi.fn()}
        roomAuthoring={{
          tool: 'paint',
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture,
        }}
        showCompositionBounds={false}
      />
    );
    const ground = renderer.scene.findByProps({
      name: 'world-building-finite-ground',
    });
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    };
    const event = (point: THREE.Vector3) => ({
      button: 0,
      buttons: 1,
      pointerId: 7,
      point,
      target,
      shiftKey: false,
      stopPropagation: vi.fn(),
    });

    await renderer.fireEvent(
      ground,
      'pointerDown',
      event(new THREE.Vector3(0, 0, 0))
    );
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
    await renderer.fireEvent(
      ground,
      'pointerMove',
      event(new THREE.Vector3(1.8, 0, 0))
    );
    await renderer.fireEvent(
      ground,
      'pointerUp',
      event(new THREE.Vector3(50, 0, 50))
    );
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onWalkableGesture).toHaveBeenCalledTimes(1);
    expect(onWalkableGesture).toHaveBeenLastCalledWith(
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      'paint'
    );

    await renderer.fireEvent(
      ground,
      'pointerDown',
      event(new THREE.Vector3(0, 0, 0))
    );
    await renderer.fireEvent(
      ground,
      'pointerCancel',
      event(new THREE.Vector3(0, 0, 0))
    );
    await renderer.fireEvent(
      ground,
      'pointerUp',
      event(new THREE.Vector3(3.5, 0, 0))
    );
    expect(onWalkableGesture).toHaveBeenCalledTimes(1);
    expect(target.releasePointerCapture).toHaveBeenCalledTimes(2);
  });
});

describe('room repeat pointer ownership', () => {
  it('previews captured primary-pointer movement, ignores another pointer, commits once, and cancels cleanly while models load', async () => {
    modelState.value = 'pending';
    const onRepeatGesture = vi.fn();
    const baseProps = {
      scene: {
        version: 1 as const,
        id: 'scene',
        name: 'Room',
        items: [],
        groups: [],
      },
      previewScene: null,
      selectedIds: [],
      tool: 'select' as const,
      activeDrag: null,
      onSelect: vi.fn(),
      onDrop: vi.fn(),
      onDragFinished: vi.fn(),
      onTransformPreview: vi.fn(),
      onTransformCommit: vi.fn(),
      onTransformReject: vi.fn(),
      onAssetState: vi.fn(),
      roomAuthoring: {
        tool: 'repeat' as const,
        workspace: { hexRadius: 6, horizontalLimit: 12 },
        walkableHexes: [],
        propDeclarations: {},
        repeat: {
          assetRef: 'dnd5e:props:dark-fortress:barricade_02',
          step: 2,
          originOffset: 1,
          maxCount: 10,
        },
        onWalkableGesture: vi.fn(),
        onRepeatGesture,
      },
      showCompositionBounds: false,
    };
    let canvas: HTMLCanvasElement | undefined;
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents {...baseProps} />,
      { beforeReturn: (value) => (canvas = value) }
    );
    const ground = renderer.scene.findByProps({
      name: 'world-building-finite-ground',
    });
    const target = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    };
    const event = (
      pointerId: number,
      x: number,
      z = 0,
      eventTarget = target
    ) => ({
      button: 0,
      buttons: 1,
      pointerId,
      point: new THREE.Vector3(x, 0, z),
      target: eventTarget,
      shiftKey: false,
      stopPropagation: vi.fn(),
    });
    const secondTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    };

    await renderer.fireEvent(ground, 'pointerDown', event(7, 0));
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
    await renderer.fireEvent(
      ground,
      'pointerDown',
      event(8, 2, 0, secondTarget)
    );
    expect(secondTarget.setPointerCapture).not.toHaveBeenCalled();
    await renderer.fireEvent(ground, 'pointerCancel', event(8, 2));
    const unrelatedLostCapture = new Event('lostpointercapture');
    Object.defineProperty(unrelatedLostCapture, 'pointerId', { value: 8 });
    canvas!.dispatchEvent(unrelatedLostCapture);
    expect(target.releasePointerCapture).not.toHaveBeenCalled();
    expect(
      renderer.scene.findByProps({ name: 'repeat-placement-preview' }).props
        .userData.count
    ).toBe(1);
    await renderer.fireEvent(ground, 'pointerMove', event(8, 10));
    expect(
      renderer.scene.findByProps({ name: 'repeat-placement-preview' }).props
        .userData.count
    ).toBe(1);
    await renderer.fireEvent(ground, 'pointerMove', event(7, 6.2));
    expect(
      renderer.scene.findByProps({ name: 'repeat-placement-preview' }).props
        .userData.count
    ).toBe(3);
    await renderer.fireEvent(ground, 'pointerUp', event(8, 6.2));
    expect(onRepeatGesture).not.toHaveBeenCalled();
    await renderer.fireEvent(ground, 'pointerUp', event(7, 50));
    expect(onRepeatGesture).toHaveBeenCalledTimes(1);
    expect(onRepeatGesture.mock.calls[0]![1]).toHaveLength(3);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);

    await renderer.fireEvent(ground, 'pointerDown', event(7, 0));
    await renderer.fireEvent(ground, 'pointerMove', event(7, 100));
    expect(baseProps.onTransformReject).toHaveBeenCalledWith(
      expect.stringMatching(/capacity/i)
    );
    expect(
      renderer.scene.findAllByProps({ name: 'repeat-placement-preview' })
    ).toHaveLength(0);
    await renderer.fireEvent(ground, 'pointerUp', event(7, 100));
    expect(onRepeatGesture).toHaveBeenCalledTimes(1);

    await renderer.fireEvent(ground, 'pointerDown', event(7, 0));
    await renderer.fireEvent(ground, 'pointerCancel', event(7, 0));
    await renderer.fireEvent(ground, 'pointerUp', event(7, 4));
    expect(onRepeatGesture).toHaveBeenCalledTimes(1);
    expect(
      renderer.scene.findAllByProps({ name: 'repeat-placement-preview' })
    ).toHaveLength(0);

    await renderer.fireEvent(ground, 'pointerDown', event(7, 0));
    await renderer.unmount();
    expect(target.releasePointerCapture).toHaveBeenCalledTimes(4);
  });
});

describe('WorldPropVisual surface and pointer ownership', () => {
  it('routes generated exact refs through WorldAssetModel and reports their provider bounds to placement guides', async () => {
    const onAssetState = vi.fn();
    const onBoundsMeasured = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldPropVisual
        item={GENERATED_PROP}
        selected={false}
        onSelect={vi.fn()}
        selectedIds={[]}
        isGizmoPointer={() => false}
        resolveSelectionId={() => GENERATED_PROP.id}
        onAssetState={onAssetState}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    expect(model.instance.position.x).toBe(-1);
    expect(model.instance.position.z).toBe(2);
    expect(model.instance.rotation.y).toBeCloseTo(0.5);
    expect(onAssetState).toHaveBeenCalledWith('alchemy-tools', 'loaded');
    expect(onBoundsMeasured).toHaveBeenCalledWith('alchemy-tools', {
      assetRef: GENERATED_PROP.assetRef,
      bounds: expect.objectContaining({
        minY: 0,
        width: expect.any(Number),
        height: expect.any(Number),
        depth: expect.any(Number),
      }),
    });
  });

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
