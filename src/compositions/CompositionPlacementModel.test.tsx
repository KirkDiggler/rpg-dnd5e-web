import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CompositionReader } from './compositionJsonAdapter';
import { CompositionPlacementModel } from './CompositionPlacementModel';
import type { CompositionSource } from './compositionSource';

vi.mock('./CompositionModel', () => ({
  CompositionModel: ({
    composition,
    instanceId,
    transform,
  }: {
    composition: { id: string };
    instanceId: string;
    transform: { x: number; rotationY: number };
  }) => (
    <group
      data-testid={`resolved-${instanceId}`}
      data-composition={composition.id}
      data-x={transform.x}
      data-yaw={transform.rotationY}
    />
  ),
}));

const transform = { x: 3, y: 0.25, z: -2, rotationY: 1.2 };

function source(reader: CompositionReader): CompositionSource {
  return { worldId: 'world-current', reader };
}

describe('CompositionPlacementModel', () => {
  it('resolves by reader WorldID + Composition.ID and keeps the instance transform', async () => {
    const getComposition = vi.fn(async (worldId: string, id: string) =>
      create(CompositionSchema, { id, worldId, json: '{}' })
    );
    render(
      <CompositionPlacementModel
        compositionId="decorated-table"
        instanceId="decorated-table-2"
        transform={transform}
        source={source({
          getComposition,
          listCompositions: vi.fn(),
        } as unknown as CompositionReader)}
      />
    );

    const resolved = await screen.findByTestId('resolved-decorated-table-2');
    expect(getComposition).toHaveBeenCalledWith(
      'world-current',
      'decorated-table'
    );
    expect(resolved.getAttribute('data-composition')).toBe('decorated-table');
    expect(resolved.getAttribute('data-x')).toBe('3');
    expect(resolved.getAttribute('data-yaw')).toBe('1.2');
  });

  it('isolates missing source, missing data, and reader failures per placement', async () => {
    const reader = {
      listCompositions: vi.fn(),
      getComposition: vi.fn(async (_worldId: string, id: string) => {
        if (id === 'broken') throw new Error('reader offline');
        return null;
      }),
    } as unknown as CompositionReader;
    const value = source(reader);
    const { container } = render(
      <>
        <CompositionPlacementModel
          compositionId="no-source"
          instanceId="placement-a"
          transform={transform}
        />
        <CompositionPlacementModel
          compositionId="missing"
          instanceId="placement-b"
          transform={transform}
          source={value}
        />
        <CompositionPlacementModel
          compositionId="broken"
          instanceId="placement-c"
          transform={transform}
          source={value}
        />
      </>
    );

    expect(
      container.querySelector('[name="composition-missing-source-placement-a"]')
    ).not.toBeNull();
    await waitFor(() => {
      expect(
        container.querySelector('[name="composition-missing-placement-b"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[name="composition-error-placement-c"]')
      ).not.toBeNull();
    });
  });
});
