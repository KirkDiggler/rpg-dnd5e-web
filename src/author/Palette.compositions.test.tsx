import type { CompositionReader } from '@/compositions/compositionJsonAdapter';
import { compositionRef } from '@/compositions/compositionRef';
import type { CompositionSource } from '@/compositions/compositionSource';
import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyDungeon } from './dungeonYaml';

vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  CompositionThumbnailRenderer: () => null,
}));

import { Palette } from './Palette';

function renderPalette(source?: CompositionSource) {
  const onArm = vi.fn();
  const onTool = vi.fn();
  render(
    <Palette
      doc={emptyDungeon()}
      tool="select"
      onTool={onTool}
      activeRegionId={null}
      onActiveRegion={() => {}}
      onAddRegion={() => {}}
      armed={null}
      onArm={onArm}
      compositionSource={source}
    />
  );
  return { onArm, onTool };
}

const sceneJson = (name: string) =>
  JSON.stringify({
    kind: 'rpg-world-building-scene',
    version: 1,
    scene: { version: 1, id: 'scene-id', name, items: [], groups: [] },
  });

describe('Palette current-world compositions', () => {
  it('uses the authored scene name while keeping unsupported and malformed entries safe', async () => {
    const listCompositions = vi.fn(async (worldId: string) => [
      create(CompositionSchema, {
        id: 'composition-uuid-like',
        worldId,
        json: sceneJson('The Lantern Table'),
      }),
      create(CompositionSchema, {
        id: 'table:with space',
        worldId,
        json: sceneJson('Unrepresentable table'),
      }),
      create(CompositionSchema, {
        id: 'malformed-record',
        worldId,
        json: '{}',
      }),
    ]);
    const source: CompositionSource = {
      worldId: 'development-world-web951-compositions',
      reader: {
        listCompositions,
        getComposition: vi.fn(),
      } as unknown as CompositionReader,
    };
    const { onArm, onTool } = renderPalette(source);

    const button = await screen.findByRole('button', {
      name: 'Place composition The Lantern Table',
    });
    expect(listCompositions).toHaveBeenCalledWith(source.worldId);
    expect(
      screen.getByLabelText('Unsupported composition table:with space')
        .textContent
    ).toContain('Unsupported composition ID: table:with space');
    expect(
      screen.getByLabelText('Unsupported composition malformed-record')
        .textContent
    ).toContain('Malformed composition malformed-record');
    fireEvent.click(button);
    expect(onArm).toHaveBeenCalledWith({
      kind: 'prop',
      ref: compositionRef('composition-uuid-like'),
    });
    expect(onTool).toHaveBeenCalledWith('place');
  });

  it('reports missing source and list failures instead of falling back', async () => {
    const first = renderPalette();
    expect(
      screen.getByText('No current-world composition source is configured.')
    ).toBeDefined();
    expect(first.onArm).not.toHaveBeenCalled();

    const reader = {
      listCompositions: vi.fn(async () => {
        throw new Error('catalog unavailable');
      }),
      getComposition: vi.fn(),
    } as unknown as CompositionReader;
    renderPalette({ worldId: 'world-b', reader });
    await waitFor(() =>
      expect(screen.getByText(/catalog unavailable/)).toBeDefined()
    );
    expect(
      screen.queryByRole('button', { name: /Place composition/ })
    ).toBeNull();
  });
});
