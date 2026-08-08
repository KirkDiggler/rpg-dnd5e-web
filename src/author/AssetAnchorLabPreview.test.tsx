import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIXTURE_VISIBLE_BOUNDS,
  createInitialAssetAnchorLabState,
  type AssetAnchorLabState,
  type RenderObservation,
} from './assetAnchorExperiment';

const hoisted = vi.hoisted(() => ({
  useGLTFSpy: vi.fn(),
  useTextureSpy: vi.fn(),
  emptyUrls: new Set<string>(),
}));

vi.mock('@react-three/drei', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  const useGLTF = (url: string) => {
    hoisted.useGLTFSpy(url);
    const scene = new THREE.Group();
    if (hoisted.emptyUrls.has(url)) return { scene, animations: [] };
    const rawBoundsByUrl: Record<
      string,
      { min: [number, number, number]; max: [number, number, number] }
    > = {
      '/models/synty/props/SM_Prop_Bookcase_Small_01.glb': {
        min: [0.1694509089, 0, -0.0038582888],
        max: [2.3015906811, 3.3514635563, 0.8825798035],
      },
      '/models/synty/props/SM_Prop_Torch_Ornate_01.glb': {
        min: [-0.1142199039, -0.443867445, -0.1012989059],
        max: [0.1142199039, 0.3584806919, 0.1012988612],
      },
      '/models/synty/characters/fighter.glb': {
        min: [-1.444, 0, -0.324],
        max: [1.444, 1.8532047272, 0.319],
      },
      '/models/synty/characters/fighter-downed.glb': {
        min: [-0.7153402567, -0.3246057332, -2.8743493557],
        max: [0.704826653, 0.3183091879, -0.9977132678],
      },
    };
    const rawBounds = rawBoundsByUrl[url];
    const geometry = rawBounds
      ? new THREE.BoxGeometry(
          rawBounds.max[0] - rawBounds.min[0],
          rawBounds.max[1] - rawBounds.min[1],
          rawBounds.max[2] - rawBounds.min[2]
        ).translate(
          (rawBounds.min[0] + rawBounds.max[0]) / 2,
          (rawBounds.min[1] + rawBounds.max[1]) / 2,
          (rawBounds.min[2] + rawBounds.max[2]) / 2
        )
      : url.includes('/env/')
        ? new THREE.BoxGeometry(1, 1, 0.2)
        : new THREE.BoxGeometry(2, 4, 1);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    mesh.name = url;
    scene.add(mesh);
    return { scene, animations: [] };
  };
  useGLTF.preload = vi.fn();
  return {
    ...actual,
    useGLTF,
    useTexture: (url: string) => {
      hoisted.useTextureSpy(url);
      return new THREE.Texture();
    },
  };
});

import {
  AssetAnchorLabScene,
  LAB_WALL_NOMINAL_Z,
  LAB_WALL_VISIBLE_FAR_FACE_Z,
  LAB_WALL_VISIBLE_ROOM_FACE_Z,
} from './AssetAnchorLabPreview';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

function stateFor(
  changes: Partial<AssetAnchorLabState> = {}
): AssetAnchorLabState {
  return {
    ...createInitialAssetAnchorLabState(),
    candidate: 'bounds-center-floor',
    candidateExplicitlyChosen: true,
    visibilityMode: 'calibrated',
    ...changes,
  };
}

function named(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  name: string
) {
  return renderer.scene.findAll(
    (node) => (node.props as { name?: string }).name === name
  );
}

describe('AssetAnchorLabPreview — real R3F scene seam', () => {
  beforeEach(() => {
    hoisted.useGLTFSpy.mockClear();
    hoisted.useTextureSpy.mockClear();
    hoisted.emptyUrls.clear();
  });

  it('starts Raw-only with one actual primitive and anchored RAW/hex/wall labels, while still acknowledging load + measurement', async () => {
    const onBoundsMeasured = vi.fn();
    const onRenderObserved = vi.fn<(value: RenderObservation) => void>();
    const state = stateFor({
      candidate: 'raw-origin',
      candidateExplicitlyChosen: false,
      visibilityMode: 'raw',
    });
    const renderer = await ReactThreeTestRenderer.create(
      <AssetAnchorLabScene
        url="/models/synty/props/SM_Prop_Bookcase_Small_01.glb"
        state={state}
        fallbackBounds={FIXTURE_VISIBLE_BOUNDS.bookcase!}
        onBoundsMeasured={onBoundsMeasured}
        onRenderObserved={onRenderObserved}
        onAssetFailed={() => {}}
      />
    );

    expect(named(renderer, 'anchor-lab-raw-asset')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-calibrated-asset')).toHaveLength(0);
    expect(named(renderer, 'anchor-lab-raw-bounds')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-calibrated-bounds')).toHaveLength(0);
    expect(named(renderer, 'anchor-lab-label-raw')[0]!.props.userData).toEqual({
      label: 'RAW INPUT',
    });
    expect(named(renderer, 'anchor-lab-label-calibrated')).toHaveLength(0);
    expect(
      named(renderer, 'anchor-lab-label-owning-hex')[0]!.props.userData
    ).toEqual({ label: 'OWNING HEX CENTER · q0,r0,s0' });
    expect(
      named(renderer, 'anchor-lab-label-wall-target')[0]!.props.userData
    ).toEqual({ label: 'VISIBLE WALL FACE · Z -0.654m' });
    expect(
      named(renderer, 'anchor-lab-label-wall-nominal')[0]!.props.userData
    ).toEqual({ label: 'NOMINAL EDGE PLANE · Z -0.866m' });

    const assetMeshes = renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        '/models/synty/props/SM_Prop_Bookcase_Small_01.glb'
    );
    expect(assetMeshes).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-real-synty-floor')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-real-synty-wall')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-owning-hex-highlight')).toHaveLength(1);
    expect(hoisted.useTextureSpy).toHaveBeenCalledWith(
      '/models/synty/textures/Dungeons_Texture_FloorTiles_01.png'
    );
    expect(
      hoisted.useGLTFSpy.mock.calls.some(([url]) =>
        String(url).includes('/models/synty/env/')
      )
    ).toBe(true);

    const visibleFace = named(renderer, 'anchor-lab-visible-wall-face')[0]!;
    const nominalPlane = named(renderer, 'anchor-lab-nominal-wall-plane')[0]!;
    expect(visibleFace.props.position[2]).toBeCloseTo(
      LAB_WALL_VISIBLE_ROOM_FACE_Z,
      6
    );
    expect(nominalPlane.props.position[2]).toBeCloseTo(LAB_WALL_NOMINAL_Z, 6);
    expect(LAB_WALL_VISIBLE_FAR_FACE_Z).toBeCloseTo(-0.980874, 5);
    expect(LAB_WALL_VISIBLE_ROOM_FACE_Z).toBeCloseTo(-0.654086, 5);

    const exactOrigin = named(renderer, 'anchor-lab-exact-raw-origin')[0]!;
    const leader = named(renderer, 'anchor-lab-origin-visibility-leader')[0]!;
    const elevated = named(renderer, 'anchor-lab-elevated-origin-glyph')[0]!;
    expect(exactOrigin.props.position).toEqual([0, 0, 0]);
    expect(leader.props.position).toEqual([0, 0.17, 0]);
    expect(elevated.props.position).toEqual([0, 0.34, 0]);
    const measured = onBoundsMeasured.mock.calls[0]![0] as {
      center: number[];
    };
    FIXTURE_VISIBLE_BOUNDS.bookcase!.center.forEach((value, index) =>
      expect(measured.center[index]).toBeCloseTo(value, 6)
    );
    expect(onRenderObserved).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: 'raw-origin',
        visibilityMode: 'raw',
        bounds: expect.objectContaining({ center: measured.center }),
      })
    );
  });

  it.each([
    {
      label: 'bookcase recommended centering',
      url: '/models/synty/props/SM_Prop_Bookcase_Small_01.glb',
      state: stateFor(),
      fallback: FIXTURE_VISIBLE_BOUNDS.bookcase!,
      expected: [-0.9266405963, 0, -0.329520568] as const,
      sceneLabel: 'CALIBRATED',
    },
    {
      label: 'torch wall-face with provisional height',
      url: '/models/synty/props/SM_Prop_Torch_Ornate_01.glb',
      state: stateFor({
        caseId: 'torch-ornate',
        candidate: 'wall-face',
      }),
      fallback: FIXTURE_VISIBLE_BOUNDS['torch-ornate']!,
      expected: [0, 1.1820200324, -0.7900516182] as const,
      sceneLabel: 'CALIBRATED',
    },
    {
      label: 'downed fighter diagnostic centering',
      url: '/models/synty/characters/fighter-downed.glb',
      state: stateFor({
        caseId: 'fighter-pair',
        variant: 'downed',
      }),
      fallback: FIXTURE_VISIBLE_BOUNDS['fighter-pair:downed']!,
      expected: [0.0039426014, 0.2434542999, 1.4520234838] as const,
      sceneLabel: 'DIAGNOSTIC · CENTER ONLY',
    },
  ])('renders Calibrated-only exact placement for $label', async (fixture) => {
    const onRenderObserved = vi.fn<(value: RenderObservation) => void>();
    const renderer = await ReactThreeTestRenderer.create(
      <AssetAnchorLabScene
        url={fixture.url}
        state={fixture.state}
        fallbackBounds={fixture.fallback}
        onBoundsMeasured={() => {}}
        onRenderObserved={onRenderObserved}
        onAssetFailed={() => {}}
      />
    );
    expect(named(renderer, 'anchor-lab-raw-asset')).toHaveLength(0);
    expect(named(renderer, 'anchor-lab-calibrated-asset')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-label-raw')).toHaveLength(0);
    expect(
      named(renderer, 'anchor-lab-label-calibrated')[0]!.props.userData
    ).toEqual({ label: fixture.sceneLabel });
    const position = named(renderer, 'anchor-lab-calibrated-asset')[0]!.props
      .position as number[];
    fixture.expected.forEach((value, index) =>
      expect(position[index]).toBeCloseTo(value, 5)
    );
    expect(onRenderObserved).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: fixture.state.candidate,
        visibilityMode: 'calibrated',
      })
    );
  });

  it('renders both explicitly labelled copies only in Overlay mode', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AssetAnchorLabScene
        url="/models/synty/characters/fighter-downed.glb"
        state={stateFor({
          caseId: 'fighter-pair',
          variant: 'downed',
          visibilityMode: 'overlay',
        })}
        fallbackBounds={FIXTURE_VISIBLE_BOUNDS['fighter-pair:downed']!}
        onBoundsMeasured={() => {}}
        onRenderObserved={() => {}}
        onAssetFailed={() => {}}
      />
    );
    expect(named(renderer, 'anchor-lab-raw-asset')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-calibrated-asset')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-label-raw')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-label-calibrated')).toHaveLength(1);
    const assetMeshes = renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        '/models/synty/characters/fighter-downed.glb'
    );
    expect(assetMeshes).toHaveLength(2);
  });

  it('keeps standing raw centered on the owning hex and mounts the shared Play camera', async () => {
    const onBoundsMeasured = vi.fn();
    const onRenderObserved = vi.fn<(value: RenderObservation) => void>();
    const renderer = await ReactThreeTestRenderer.create(
      <AssetAnchorLabScene
        url="/models/synty/characters/fighter.glb"
        state={stateFor({
          caseId: 'fighter-pair',
          candidate: 'raw-origin',
          visibilityMode: 'raw',
          cameraMode: 'play',
          facing: 4,
        })}
        fallbackBounds={FIXTURE_VISIBLE_BOUNDS['fighter-pair:standing']!}
        onBoundsMeasured={onBoundsMeasured}
        onRenderObserved={onRenderObserved}
        onAssetFailed={() => {}}
      />
    );
    expect(named(renderer, 'anchor-lab-shared-tactical-camera')).toHaveLength(
      1
    );
    expect(named(renderer, 'anchor-lab-orbit-camera')).toHaveLength(0);
    const measured = onBoundsMeasured.mock.calls[0]![0] as {
      min: number[];
      center: number[];
    };
    expect(measured.min[1]).toBeCloseTo(0, 6);
    expect(measured.center[0]).toBeCloseTo(0, 6);
    expect(measured.center[2]).toBeCloseTo(-0.001875, 5);
    expect(onRenderObserved).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraMode: 'play',
        facing: 4,
        visibilityMode: 'raw',
      })
    );
  });

  it('reports unusable geometry and never emits a render observation', async () => {
    const onRenderObserved = vi.fn();
    const onAssetFailed = vi.fn();
    hoisted.emptyUrls.add('/models/synty/props/unmeasured.glb');
    await ReactThreeTestRenderer.create(
      <AssetAnchorLabScene
        url="/models/synty/props/unmeasured.glb"
        state={stateFor()}
        fallbackBounds={FIXTURE_VISIBLE_BOUNDS.bookcase!}
        onBoundsMeasured={() => {}}
        onRenderObserved={onRenderObserved}
        onAssetFailed={onAssetFailed}
      />
    );
    expect(onAssetFailed).toHaveBeenCalledWith('unmeasured');
    expect(onRenderObserved).not.toHaveBeenCalled();
  });
});
