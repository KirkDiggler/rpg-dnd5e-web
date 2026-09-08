import type { CompositionReader } from '@/compositions/compositionJsonAdapter';
import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompositionPlacementModel } from './CompositionPlacementModel';
import type { CompositionSource } from './compositionSource';

vi.mock('@/components/hex-grid/PropModel', () => ({
  PropModel: ({
    position,
    rotationY,
  }: {
    position: [number, number, number];
    rotationY: number;
  }) => (
    <group
      name="resolved-legacy-leaf"
      data-position={JSON.stringify(position)}
      data-rotation-y={rotationY}
    />
  ),
}));

vi.mock('@/components/hex-grid/WorldAssetModel', () => ({
  WorldAssetModel: ({
    assetRef,
    position,
    rotationY,
  }: {
    assetRef: string;
    position: [number, number, number];
    rotationY: number;
  }) => (
    <group
      name="resolved-generated-leaf"
      data-asset-ref={assetRef}
      data-position={JSON.stringify(position)}
      data-rotation-y={rotationY}
    />
  ),
}));

const sceneJson = JSON.stringify({
  kind: 'rpg-world-building-scene',
  version: 1,
  scene: {
    version: 1,
    id: 'mixed-scene',
    name: 'Mixed scene',
    groups: [],
    items: [
      {
        id: 'legacy-candles',
        kind: 'prop',
        assetRef: 'dnd5e:props:candles',
        label: 'Candles',
        transform: { x: 1, y: 0.1, z: 2, rotationY: 0.25 },
      },
      {
        id: 'generated-alchemy-tools',
        kind: 'prop',
        assetRef: 'dnd5e:props:dark-fortress:alchemy_tools_01',
        label: 'Alchemy Tools 01',
        transform: { x: -3, y: 0.35, z: 4, rotationY: 0.8 },
      },
    ],
  },
});

function source(getComposition: CompositionReader['getComposition']) {
  return {
    worldId: 'world-current',
    reader: {
      getComposition,
      listCompositions: vi.fn(),
    } as unknown as CompositionReader,
  } satisfies CompositionSource;
}

describe('CompositionPlacementModel saved-scene integration', () => {
  it('resolves a mixed snapshot and renders both real CompositionModel leaf branches without a red fallback', async () => {
    const getComposition = vi.fn(async (worldId: string, id: string) =>
      create(CompositionSchema, { id, worldId, json: sceneJson })
    );
    const { container } = render(
      <CompositionPlacementModel
        compositionId="mixed-snapshot"
        instanceId="mixed-placement"
        transform={{ x: 7, y: 0.4, z: -5, rotationY: 1.2 }}
        source={source(getComposition)}
      />
    );

    await waitFor(() => {
      expect(
        container.querySelector('[name="resolved-legacy-leaf"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[name="resolved-generated-leaf"]')
      ).not.toBeNull();
    });
    expect(
      container.querySelector('[name="composition-error-mixed-placement"]')
    ).toBeNull();
    expect(
      container
        .querySelector('[name="resolved-generated-leaf"]')
        ?.getAttribute('data-asset-ref')
    ).toBe('dnd5e:props:dark-fortress:alchemy_tools_01');
    expect(getComposition).toHaveBeenCalledWith(
      'world-current',
      'mixed-snapshot'
    );
  });
});
