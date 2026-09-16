import {
  GENERATED_WORLD_ASSETS,
  resolveWorldAsset,
} from '@/generated/worldAssetCatalog';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

const loadedUrls = vi.hoisted(() => [] as string[]);
vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
    loadedUrls.push(url);
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.24207866191864014,
          0.2667747139930725,
          0.23023077845573425
        ),
        new THREE.MeshStandardMaterial()
      )
    );
    return { scene };
  },
}));

import { WorldAssetModel } from './WorldAssetModel';

const REF = 'dnd5e:props:dark-fortress:alchemy_tools_01';

describe('generated exact world asset resolution', () => {
  it('returns only the concrete generated entry and diagnoses unsupported exact refs without fallback', () => {
    expect(resolveWorldAsset(REF)).toEqual(GENERATED_WORLD_ASSETS[REF]);
    expect(resolveWorldAsset(REF)).toMatchObject({
      ref: REF,
      displayName: 'Alchemy Tools 01',
      category: 'props',
      url: '/models/synty/world-assets/props/dark-fortress/alchemy_tools_01.glb',
      supportsDecoration: false,
    });
    const diagnostic = vi.fn();
    expect(
      resolveWorldAsset('dnd5e:props:dark-fortress:missing', diagnostic)
    ).toBeUndefined();
    expect(diagnostic).toHaveBeenCalledWith({
      ref: 'dnd5e:props:dark-fortress:missing',
      reason: 'unsupported-exact-ref',
    });
  });
});

describe('WorldAssetModel provider-baked placement', () => {
  it('loads the exact URL with shared scale while preserving authored transform and baked grounding', async () => {
    loadedUrls.length = 0;
    const onBoundsMeasured = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={REF}
        position={[2, 0.3, -4]}
        rotationY={0.7}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    expect(loadedUrls).toEqual([GENERATED_WORLD_ASSETS[REF]!.url]);
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    expect(model.instance.position.toArray()).toEqual([
      2,
      0.3 + DUNGEON_SURFACE_Y,
      -4,
    ]);
    expect(model.instance.rotation.y).toBeCloseTo(0.7);
    expect(model.instance.scale.x).toBeCloseTo(SYNTY_SCALE);
    expect(
      renderer.scene.findAllByProps({ name: 'prop-model-bounds-anchor' })
    ).toHaveLength(0);
    const [width, height, depth] = GENERATED_WORLD_ASSETS[REF]!.boundsMeters;
    expect(onBoundsMeasured).toHaveBeenCalledWith({
      minY: 0,
      maxY: height,
      width,
      height,
      depth,
    });
    await renderer.unmount();
  });

  it('applies grounded Y-only height scaling to generated bounds', async () => {
    const onBoundsMeasured = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={REF}
        position={[0, 0, 0]}
        heightScale={1.5}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    expect(model.instance.scale.toArray()).toEqual([
      SYNTY_SCALE,
      SYNTY_SCALE * 1.5,
      SYNTY_SCALE,
    ]);
    const [width, height, depth] = GENERATED_WORLD_ASSETS[REF]!.boundsMeters;
    expect(onBoundsMeasured).toHaveBeenCalledWith({
      minY: 0,
      maxY: height * 1.5,
      width,
      height: height * 1.5,
      depth,
    });
  });

  it('reports the actual rendered source geometry size exactly once', async () => {
    const onBoundsMeasured = vi.fn();
    const [width, height, depth] = GENERATED_WORLD_ASSETS[REF]!.boundsMeters;
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef={REF}
        position={[0, 0, 0]}
        rotationY={0}
        onBoundsMeasured={onBoundsMeasured}
      />
    );
    const model = renderer.scene.findByProps({ name: 'world-asset-model' });
    model.instance.updateWorldMatrix(true, true);
    const actual = new THREE.Box3()
      .setFromObject(model.instance)
      .getSize(new THREE.Vector3());
    expect(actual.x).toBeCloseTo(width);
    expect(actual.y).toBeCloseTo(height);
    expect(actual.z).toBeCloseTo(depth);
    expect(onBoundsMeasured).toHaveBeenCalledTimes(1);
    expect(onBoundsMeasured).toHaveBeenCalledWith({
      minY: 0,
      maxY: height,
      width,
      height,
      depth,
    });
    await renderer.unmount();
  });

  it('renders empty and reports a diagnostic for an unsupported exact ref', async () => {
    loadedUrls.length = 0;
    const onDiagnostic = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel
        assetRef="dnd5e:props:dark-fortress:missing"
        position={[0, 0, 0]}
        onDiagnostic={onDiagnostic}
      />
    );
    expect(renderer.scene.children).toHaveLength(0);
    expect(loadedUrls).toEqual([]);
    expect(onDiagnostic).toHaveBeenCalledWith({
      ref: 'dnd5e:props:dark-fortress:missing',
      reason: 'unsupported-exact-ref',
    });
  });
});
