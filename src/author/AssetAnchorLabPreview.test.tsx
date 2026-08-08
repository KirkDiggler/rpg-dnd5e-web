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
    const mesh = new THREE.Mesh(
      url.includes('/env/')
        ? new THREE.BoxGeometry(1, 1, 0.2)
        : new THREE.BoxGeometry(2, 4, 1),
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

import { AssetAnchorLabScene } from './AssetAnchorLabPreview';

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

  it('connects actual asset raw+calibrated primitives, real Synty floor/wall, bounds/origin path, and post-commit measurement acknowledgement', async () => {
    const onBoundsMeasured = vi.fn();
    const onRenderObserved = vi.fn<(value: RenderObservation) => void>();
    const onAssetFailed = vi.fn();
    const state = stateFor();

    const renderer = await ReactThreeTestRenderer.create(
      <AssetAnchorLabScene
        url="/models/synty/props/SM_Prop_Bookcase_Small_01.glb"
        state={state}
        fallbackBounds={FIXTURE_VISIBLE_BOUNDS.bookcase!}
        onBoundsMeasured={onBoundsMeasured}
        onRenderObserved={onRenderObserved}
        onAssetFailed={onAssetFailed}
      />
    );

    expect(hoisted.useGLTFSpy).toHaveBeenCalledWith(
      '/models/synty/props/SM_Prop_Bookcase_Small_01.glb'
    );
    expect(
      hoisted.useGLTFSpy.mock.calls.some(([url]) =>
        String(url).includes('/models/synty/env/')
      )
    ).toBe(true);
    expect(hoisted.useTextureSpy).toHaveBeenCalledWith(
      '/models/synty/textures/Dungeons_Texture_FloorTiles_01.png'
    );

    expect(named(renderer, 'anchor-lab-raw-asset')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-calibrated-asset')).toHaveLength(1);
    const assetMeshes = renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        '/models/synty/props/SM_Prop_Bookcase_Small_01.glb'
    );
    expect(assetMeshes).toHaveLength(2);
    expect(named(renderer, 'anchor-lab-real-synty-floor')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-real-synty-wall')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-raw-bounds')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-calibrated-bounds')).toHaveLength(1);
    expect(named(renderer, 'anchor-lab-owning-hex-highlight')).toHaveLength(1);

    const exactOrigin = named(renderer, 'anchor-lab-exact-raw-origin')[0]!;
    const leader = named(renderer, 'anchor-lab-origin-visibility-leader')[0]!;
    const elevated = named(renderer, 'anchor-lab-elevated-origin-glyph')[0]!;
    expect(exactOrigin.props.position).toEqual([0, 0, 0]);
    expect(leader.props.position).toEqual([0, 0.17, 0]);
    expect(elevated.props.position).toEqual([0, 0.34, 0]);

    expect(onAssetFailed).not.toHaveBeenCalled();
    expect(onBoundsMeasured).toHaveBeenCalledTimes(1);
    expect(onRenderObserved).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'bookcase',
        variant: 'standing',
        candidate: 'bounds-center-floor',
        cameraMode: 'orbit',
        facing: 0,
        bounds: expect.objectContaining({ size: [1.5, 3, 0.75] }),
      })
    );
  });

  it('mounts the shared tactical Play camera and acknowledges that exact committed camera selection', async () => {
    const onRenderObserved = vi.fn<(value: RenderObservation) => void>();
    const renderer = await ReactThreeTestRenderer.create(
      <AssetAnchorLabScene
        url="/models/synty/props/SM_Prop_Bookcase_Small_01.glb"
        state={stateFor({ cameraMode: 'play', facing: 4 })}
        fallbackBounds={FIXTURE_VISIBLE_BOUNDS.bookcase!}
        onBoundsMeasured={() => {}}
        onRenderObserved={onRenderObserved}
        onAssetFailed={() => {}}
      />
    );

    expect(named(renderer, 'anchor-lab-shared-tactical-camera')).toHaveLength(
      1
    );
    expect(named(renderer, 'anchor-lab-orbit-camera')).toHaveLength(0);
    expect(onRenderObserved).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: 'bounds-center-floor',
        cameraMode: 'play',
        facing: 4,
      })
    );
  });

  it('reports unusable geometry and never emits a render observation', async () => {
    const onRenderObserved = vi.fn();
    const onAssetFailed = vi.fn();
    // The loader still succeeds, but its exact asset scene has no measurable
    // geometry. Fixture fallback bounds may render diagnostically but cannot
    // produce a positive observation.
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
