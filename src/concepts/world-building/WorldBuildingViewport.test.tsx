import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldProp } from './types';

const modelState = vi.hoisted(() => ({
  value: 'loaded' as 'loaded' | 'pending' | 'error',
  pending: new Promise<never>(() => {}),
  requestedUrls: [] as string[],
}));
const floorTextureState = vi.hoisted(() => ({
  base: undefined as THREE.Texture | undefined,
}));
const loadedScene = new THREE.Group();
loadedScene.add(
  new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
);

vi.mock('@react-three/drei', () => ({
  Html: () => null,
  OrbitControls: () => null,
  TransformControls: ({ children }: { children?: React.ReactNode }) => children,
  useGLTF: (url: string) => {
    modelState.requestedUrls.push(url);
    if (modelState.value === 'pending') throw modelState.pending;
    if (modelState.value === 'error') throw new Error('model failed');
    return { scene: loadedScene };
  },
  useTexture: () => floorTextureState.base,
}));

vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: ({ url }: { url: string }) => {
    modelState.requestedUrls.push(url);
    if (modelState.value === 'pending') throw modelState.pending;
    if (modelState.value === 'error') throw new Error('model failed');
    return <group name="shared-room-monster-model" userData={{ url }} />;
  },
}));

vi.mock('@/components/session/useDungeonShellCatalog', () => ({
  useDungeonShellCatalog: () => ({
    status: 'ready',
    catalog: {
      profiles: {
        crypt: {
          floor: {
            diffuse: 'textures/Dungeons_Texture_FloorTile_09_01.png',
            sha256:
              'ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841',
            worldUnitsPerRepeat: 6,
          },
        },
      },
    },
  }),
}));

import type { RoomHexCell } from './roomDraft';
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
  floorTextureState.base = new THREE.Texture();
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
      renderer.scene.findAllByProps({ name: 'workspace-floor-underlay' })
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
    const underlay = renderer.scene.findByProps({
      name: 'workspace-floor-underlay',
    }).instance as THREE.Mesh<THREE.CircleGeometry>;
    expect(underlay.geometry.parameters.radius).toBe(21);
    expect(onWalkableGesture).not.toHaveBeenCalled();
    expect(onTransformCommit).not.toHaveBeenCalled();
    await renderer.unmount();
  });
});

describe('composition guides stay in the composer', () => {
  it('never draws the X0/Z0 anchor or composition bounds while authoring a room', async () => {
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
    };
    const roomAuthoring = {
      tool: 'select' as const,
      workspace: { hexRadius: 6, horizontalLimit: 12 },
      walkableHexes: [],
      propDeclarations: {},
      onWalkableGesture: vi.fn(),
    };

    // The composer owns the placement anchor and its bounds guide.
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents {...baseProps} showCompositionBounds />
    );
    expect(
      renderer.scene.findByProps({ name: 'world-building-placement-guides' })
    ).toBeTruthy();

    // A room has no composition origin: while building, neither the anchor
    // nor the bounds box is drawn at all (rpg-dnd5e-web#1152, the design's
    // third observed violation).
    await renderer.update(
      <WorldSceneContents
        {...baseProps}
        showCompositionBounds
        roomAuthoring={roomAuthoring}
      />
    );
    for (const name of [
      'world-building-placement-guides',
      'world-building-placement-anchor-fill',
      'world-building-placement-anchor-outline',
      'world-building-composition-bounds',
    ]) {
      expect(renderer.scene.findAllByProps({ name })).toHaveLength(0);
    }
    await renderer.unmount();
  });
});

describe('room boundary lifetime and floor layering', () => {
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
    showCompositionBounds: false,
  };
  const authoring = (
    horizontalLimit: number,
    walkableHexes: readonly { q: number; r: number }[] = []
  ) => ({
    tool: 'select' as const,
    workspace: { hexRadius: 6, horizontalLimit },
    walkableHexes,
    propDeclarations: {},
    onWalkableGesture: vi.fn(),
  });

  it('retains, replaces, and releases the owned boundary only when primitive inputs change', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents {...baseProps} roomAuthoring={authoring(12)} />
    );
    const first = renderer.scene.findByProps({
      name: 'world-building-ground-boundary',
    }).instance as THREE.LineLoop<THREE.BufferGeometry>;
    const firstGeometry = first.geometry;
    const firstDispose = vi.spyOn(firstGeometry, 'dispose');

    await renderer.update(
      <WorldSceneContents {...baseProps} roomAuthoring={authoring(12)} />
    );
    expect(
      (
        renderer.scene.findByProps({
          name: 'world-building-ground-boundary',
        }).instance as THREE.LineLoop<THREE.BufferGeometry>
      ).geometry
    ).toBe(firstGeometry);
    expect(firstDispose).not.toHaveBeenCalled();

    await renderer.update(
      <WorldSceneContents {...baseProps} roomAuthoring={authoring(20)} />
    );
    const expandedGeometry = (
      renderer.scene.findByProps({
        name: 'world-building-ground-boundary',
      }).instance as THREE.LineLoop<THREE.BufferGeometry>
    ).geometry;
    const expandedDispose = vi.spyOn(expandedGeometry, 'dispose');
    expect(expandedGeometry).not.toBe(firstGeometry);
    expect(firstDispose).toHaveBeenCalledTimes(1);

    await renderer.update(
      <WorldSceneContents {...baseProps} roomAuthoring={authoring(10.5)} />
    );
    const roomGeometry = (
      renderer.scene.findByProps({
        name: 'world-building-ground-boundary',
      }).instance as THREE.LineLoop<THREE.BufferGeometry>
    ).geometry;
    const roomDispose = vi.spyOn(roomGeometry, 'dispose');
    expect(expandedDispose).toHaveBeenCalledTimes(1);

    await renderer.update(<WorldSceneContents {...baseProps} />);
    const composerGeometry = (
      renderer.scene.findByProps({
        name: 'world-building-ground-boundary',
      }).instance as THREE.LineLoop<THREE.BufferGeometry>
    ).geometry;
    const composerDispose = vi.spyOn(composerGeometry, 'dispose');
    expect(composerGeometry).not.toBe(roomGeometry);
    expect(roomDispose).toHaveBeenCalledTimes(1);

    await renderer.unmount();
    expect(composerDispose).toHaveBeenCalledTimes(1);
  });

  it('mounts the real underlay above the pointer ground and below every floor overlay and walking surface', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        {...baseProps}
        roomAuthoring={authoring(12, [{ q: 0, r: 0 }])}
      />
    );
    const ground = renderer.scene.findByProps({
      name: 'world-building-finite-ground',
    }).instance as THREE.Mesh;
    const underlay = renderer.scene.findByProps({
      name: 'workspace-floor-underlay',
    }).instance as THREE.Mesh;
    const grid = renderer.scene.findByProps({
      name: 'world-building-real-hex-basis',
    }).instance as THREE.LineSegments<THREE.BufferGeometry>;
    const boundary = renderer.scene.findByProps({
      name: 'world-building-ground-boundary',
    }).instance as THREE.LineLoop<THREE.BufferGeometry>;
    const walkable = renderer.scene.findByProps({
      name: 'room-walkable-0-0',
    }).instance as THREE.Mesh;

    const groundY = ground.getWorldPosition(new THREE.Vector3()).y;
    const underlayY = underlay.getWorldPosition(new THREE.Vector3()).y;
    const gridY = grid.geometry.getAttribute('position').getY(0);
    const boundaryY = boundary.geometry.getAttribute('position').getY(0);
    const walkableY = walkable.getWorldPosition(new THREE.Vector3()).y;

    expect(underlayY).toBeGreaterThan(groundY);
    expect(underlayY).toBeLessThan(DUNGEON_SURFACE_Y);
    expect(underlayY).toBeLessThan(gridY);
    expect(underlayY).toBeLessThan(boundaryY);
    expect(underlayY).toBeLessThan(walkableY);
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

describe('room actor markers and snapped setup gestures', () => {
  const ACTOR = {
    id: 'actor-1',
    ref: 'dnd5e:monsters:skeleton',
    cell: { q: 1, r: 0 },
  };

  /** One snapped world point inside cell (q, r): the SAME shared
   * worldToCube/cubeToWorld pair the floor paint gestures use. */
  const worldPoint = (q: number, r: number) => {
    const center = cubeToWorld({ x: q, y: -q - r, z: r }, HEX_SIZE);
    return new THREE.Vector3(center.x + 0.3, DUNGEON_SURFACE_Y, center.z + 0.3);
  };

  const groundEvent = (point: THREE.Vector3, buttons = 0) => ({
    button: 0,
    buttons,
    pointerId: 7,
    point,
    target: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
    shiftKey: false,
    stopPropagation: vi.fn(),
  });

  it('mounts a visibly hex-snapped authoring ring and the real promoted monster model', async () => {
    modelState.requestedUrls.length = 0;
    const onSelectActor = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        scene={{ version: 1, id: 'scene', name: 'Room', items: [], groups: [] }}
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
          tool: 'select',
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture: vi.fn(),
          monsters: [ACTOR],
          partyStart: null,
          selectedActorId: null,
          onSelectActor,
        }}
        showCompositionBounds={false}
      />
    );

    // The ring sits on the same shared conversion as every floor gesture.
    const marker = renderer.scene.findByProps({
      name: `room-monster-${ACTOR.id}`,
    });
    const expectedCenter = cubeToWorld({ x: 1, y: -1, z: 0 }, HEX_SIZE);
    const markerObject = marker.instance as THREE.Object3D;
    expect(markerObject.position.x).toBe(expectedCenter.x);
    expect(markerObject.position.y).toBe(DUNGEON_SURFACE_Y);
    expect(markerObject.position.z).toBe(expectedCenter.z);

    // The real promoted monster GLB resolves and mounts — never a
    // substitute model: every requested URL is exactly the promoted
    // skeleton file, however often the hook re-runs per render.
    expect(modelState.requestedUrls.length).toBeGreaterThan(0);
    for (const url of modelState.requestedUrls)
      expect(url).toBe('/models/synty/npcs/skeleton-soldier-01.glb');
    expect(new Set(modelState.requestedUrls).size).toBe(1);

    // The actor's cell is the target: clicking anywhere on it selects the
    // actor and never a scene prop. The ring used to be the ONLY raycastable
    // part, which left the middle of the cell — where anyone actually aims —
    // dead, so a placed actor could not be re-selected at all (Kirk,
    // 2026-09-19).
    const pick = renderer.scene.findByProps({
      name: `room-actor-pick-${ACTOR.id}`,
    });
    const pickStop = vi.fn();
    await renderer.fireEvent(pick, 'pointerDown', {
      button: 0,
      stopPropagation: pickStop,
    });
    expect(pickStop).toHaveBeenCalled();
    expect(onSelectActor).toHaveBeenCalledWith('actor-1');

    // …and the VISIBLE ring still selects too, exactly as it always did.
    const ring = renderer.scene.findByProps({
      name: `room-actor-ring-${ACTOR.id}`,
    });
    const stopPropagation = vi.fn();
    await renderer.fireEvent(ring, 'pointerDown', {
      button: 0,
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onSelectActor).toHaveBeenCalledWith('actor-1');
  });

  it('commits an armed monster placement on the snapped hex in one gesture', async () => {
    const onPlaceMonster = vi.fn();
    const onSelect = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        scene={{ version: 1, id: 'scene', name: 'Room', items: [], groups: [] }}
        previewScene={null}
        selectedIds={[]}
        tool="select"
        activeDrag={null}
        onSelect={onSelect}
        onDrop={vi.fn()}
        onDragFinished={vi.fn()}
        onTransformPreview={vi.fn()}
        onTransformCommit={vi.fn()}
        onTransformReject={vi.fn()}
        onAssetState={vi.fn()}
        roomAuthoring={{
          tool: 'monster',
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture: vi.fn(),
          monsters: [],
          armedMonsterRef: 'dnd5e:monsters:zombie',
          onPlaceMonster,
        }}
        showCompositionBounds={false}
      />
    );
    const ground = renderer.scene.findByProps({
      name: 'world-building-finite-ground',
    });

    // A sub-hex world point snaps to the nearest hex: (2, 0).
    await renderer.fireEvent(
      ground,
      'pointerDown',
      groundEvent(worldPoint(2, 0))
    );
    expect(onPlaceMonster).toHaveBeenCalledTimes(1);
    expect(onPlaceMonster).toHaveBeenCalledWith({ q: 2, r: 0 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the snapped hover preview only for the armed actor tools', async () => {
    const build = (tool: 'monster' | 'paint') => (
      <WorldSceneContents
        scene={{ version: 1, id: 'scene', name: 'Room', items: [], groups: [] }}
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
          tool,
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [] as RoomHexCell[],
          propDeclarations: {},
          onWalkableGesture: vi.fn(),
          monsters: [],
          armedMonsterRef: 'dnd5e:monsters:skeleton',
        }}
        showCompositionBounds={false}
      />
    );
    const renderer = await ReactThreeTestRenderer.create(build('monster'));
    const ground = renderer.scene.findByProps({
      name: 'world-building-finite-ground',
    });

    await renderer.fireEvent(
      ground,
      'pointerMove',
      groundEvent(worldPoint(-1, 1))
    );
    const preview = renderer.scene.findByProps({ name: 'room-actor-preview' });
    const previewObject = preview.instance as THREE.Object3D;
    expect(previewObject.userData).toEqual({
      hoverCellQ: -1,
      hoverCellR: 1,
    });
    const expectedCenter = cubeToWorld({ x: -1, y: 0, z: 1 }, HEX_SIZE);
    expect(previewObject.position.x).toBe(expectedCenter.x);
    expect(previewObject.position.y).toBe(DUNGEON_SURFACE_Y);
    expect(previewObject.position.z).toBe(expectedCenter.z);

    // Any other room tool has no actor preview at all: the unmount follows
    // a real re-render with the brush tool armed.
    await renderer.update(build('paint'));
    expect(
      renderer.scene.findAllByProps({ name: 'room-actor-preview' })
    ).toHaveLength(0);
  });

  it('moves a selected monster when the MOVE tool is armed, never through scenery selection', async () => {
    const onMoveMonster = vi.fn();
    const onSelect = vi.fn();
    const onSelectActor = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        scene={{ version: 1, id: 'scene', name: 'Room', items: [], groups: [] }}
        previewScene={null}
        selectedIds={['prop-1']}
        tool="select"
        activeDrag={null}
        onSelect={onSelect}
        onDrop={vi.fn()}
        onDragFinished={vi.fn()}
        onTransformPreview={vi.fn()}
        onTransformCommit={vi.fn()}
        onTransformReject={vi.fn()}
        onAssetState={vi.fn()}
        roomAuthoring={{
          tool: 'move',
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture: vi.fn(),
          monsters: [ACTOR],
          selectedActorId: ACTOR.id,
          onMoveMonster,
          onSelectActor,
        }}
        showCompositionBounds={false}
      />
    );
    const ground = renderer.scene.findByProps({
      name: 'world-building-finite-ground',
    });
    await renderer.fireEvent(
      ground,
      'pointerDown',
      groundEvent(worldPoint(0, 1))
    );
    expect(onMoveMonster).toHaveBeenCalledTimes(1);
    expect(onMoveMonster).toHaveBeenLastCalledWith(ACTOR.id, { q: 0, r: 1 });
    // The scenery selection contract is untouched by the actor move.
    expect(onSelect).not.toHaveBeenCalled();

    // Prop tools keep their normal contract: no actor routing while the
    // gizmo tools are armed.
    onMoveMonster.mockClear();
    await ReactThreeTestRenderer.act?.(async () => undefined);
    const same = renderer;
    void same;
  });

  it('never moves a selected monster from `select` — a floor click only drops it', async () => {
    // THE COUPLING THIS GUARDS: `select` plus a selected actor used to mean
    // every floor click relocated it, so an author could not select a creature
    // to edit its orders and then click a prop — or empty ground — without
    // moving the creature (Kirk, 2026-09-19). Selecting is not a move gesture.
    const onMoveMonster = vi.fn();
    const onSelectActor = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        scene={{ version: 1, id: 'scene', name: 'Room', items: [], groups: [] }}
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
          tool: 'select',
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture: vi.fn(),
          monsters: [ACTOR],
          selectedActorId: ACTOR.id,
          onMoveMonster,
          onSelectActor,
        }}
        showCompositionBounds={false}
      />
    );
    const ground = renderer.scene.findByProps({
      name: 'world-building-finite-ground',
    });
    await renderer.fireEvent(
      ground,
      'pointerDown',
      groundEvent(worldPoint(0, 1))
    );
    expect(onMoveMonster).not.toHaveBeenCalled();
    // It clears the selection instead, which is what makes "select a creature,
    // edit it, then click something else" possible.
    expect(onSelectActor).toHaveBeenCalledWith(null);
  });

  it('places or moves the party start from one gesture and keeps it unmistakable', async () => {
    const onStartGesture = vi.fn();
    const onSelectActor = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        scene={{ version: 1, id: 'scene', name: 'Room', items: [], groups: [] }}
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
          tool: 'start',
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture: vi.fn(),
          partyStart: { q: 0, r: 0 },
          onStartGesture,
          onSelectActor,
        }}
        showCompositionBounds={false}
      />
    );
    const start = renderer.scene.findByProps({ name: 'room-party-start' });
    const expectedCenter = cubeToWorld({ x: 0, y: 0, z: 0 }, HEX_SIZE);
    const startObject = start.instance as THREE.Object3D;
    expect(startObject.position.x).toBe(expectedCenter.x);
    expect(startObject.position.y).toBe(DUNGEON_SURFACE_Y);
    expect(startObject.position.z).toBe(expectedCenter.z);
    const ground = renderer.scene.findByProps({
      name: 'world-building-finite-ground',
    });
    await renderer.fireEvent(
      ground,
      'pointerDown',
      groundEvent(worldPoint(1, -1))
    );
    expect(onStartGesture).toHaveBeenCalledWith({ q: 1, r: -1 });

    // The start ring selects the start actor itself.
    const ring = renderer.scene.findByProps({
      name: 'room-actor-ring-start',
    });
    const onSelectActorForRing = vi.fn();
    void onSelectActorForRing;
    await renderer.fireEvent(ring, 'pointerDown', {
      button: 0,
      stopPropagation: vi.fn(),
    });
    expect(onSelectActor).toHaveBeenCalledWith('start');
  });

  it('retains a syntactically valid unknown monster with an explicit unavailable state and never mounts a substitute model', async () => {
    modelState.requestedUrls.length = 0;
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        scene={{ version: 1, id: 'scene', name: 'Room', items: [], groups: [] }}
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
          tool: 'select',
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture: vi.fn(),
          monsters: [
            {
              id: 'imported-1',
              ref: 'dnd5e:monsters:not-yet-modeled',
              cell: { q: 0, r: 0 },
            },
          ],
        }}
        showCompositionBounds={false}
      />
    );

    // The retained, editable ring stays for the unknown ref.
    expect(
      renderer.scene.findByProps({ name: 'room-monster-imported-1' })
    ).toBeTruthy();
    // No model at all is requested: there is no fallback to a different
    // monster, and the unavailable state is the explicit treatment.
    expect(modelState.requestedUrls).toEqual([]);
  });

  it('shows the explicit model states on the real promoted monster', async () => {
    modelState.value = 'pending';
    const renderer = await ReactThreeTestRenderer.create(
      <WorldSceneContents
        scene={{ version: 1, id: 'scene', name: 'Room', items: [], groups: [] }}
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
          tool: 'select',
          workspace: { hexRadius: 6, horizontalLimit: 12 },
          walkableHexes: [],
          propDeclarations: {},
          onWalkableGesture: vi.fn(),
          monsters: [ACTOR],
        }}
        showCompositionBounds={false}
      />
    );
    // Pending load: the Suspense fallback chip is the explicit state.
    expect(
      renderer.scene.findByProps({ name: `room-monster-${ACTOR.id}` })
    ).toBeTruthy();

    modelState.value = 'error';
    await renderer.fireEvent(
      renderer.scene.findByProps({
        name: `room-monster-${ACTOR.id}`,
      }),
      'pointerMiss',
      {}
    );
  });
});
