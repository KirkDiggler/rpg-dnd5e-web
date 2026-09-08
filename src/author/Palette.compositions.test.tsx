import type { CompositionReader } from '@/compositions/compositionJsonAdapter';
import { compositionRef } from '@/compositions/compositionRef';
import type { CompositionSource } from '@/compositions/compositionSource';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
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
  const props = (compositionSource?: CompositionSource) => (
    <Palette
      doc={emptyDungeon()}
      tool="select"
      onTool={onTool}
      activeRegionId={null}
      onActiveRegion={() => {}}
      onAddRegion={() => {}}
      armed={null}
      onArm={onArm}
      compositionSource={compositionSource}
    />
  );
  const view = render(props(source));
  return {
    onArm,
    onTool,
    rerenderSource: (nextSource?: CompositionSource) =>
      view.rerender(props(nextSource)),
  };
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
    expect(button.getAttribute('title')).toBe('The Lantern Table');
    expect(button.getAttribute('title')).not.toContain('composition-uuid-like');
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

  it('puts friendly ordinary prop and monster names first in hover copy', () => {
    renderPalette();
    const prop = screen.getByRole('button', { name: 'PS' });
    expect(prop.getAttribute('title')).not.toContain('dnd5e:props:');
    expect(prop.getAttribute('title')).toMatch(/Plushie|Skeleton Dog/i);
    const skeleton = screen.getByRole('button', { name: 'Sk' });
    expect(skeleton.getAttribute('title')).toBe('Skeleton');
  });

  it('keeps a replacement session palette when the prior list finishes late', async () => {
    let resolveOld!: (value: ReturnType<typeof create>[]) => void;
    const oldList = new Promise<ReturnType<typeof create>[]>((resolve) => {
      resolveOld = resolve;
    });
    const oldSource: CompositionSource = {
      worldId: '123456789012345678',
      reader: {
        listCompositions: vi.fn(() => oldList),
        getComposition: vi.fn(),
      } as unknown as CompositionReader,
    };
    const replacement = create(CompositionSchema, {
      id: 'replacement-id',
      worldId: '123456789012345678',
      json: sceneJson('Replacement Palette'),
    });
    const newSource: CompositionSource = {
      worldId: '123456789012345678',
      reader: {
        listCompositions: vi.fn(async () => [replacement]),
        getComposition: vi.fn(),
      } as unknown as CompositionReader,
    };
    const view = renderPalette(oldSource);

    view.rerenderSource(newSource);
    expect(
      await screen.findByRole('button', {
        name: 'Place composition Replacement Palette',
      })
    ).toBeTruthy();

    resolveOld([
      create(CompositionSchema, {
        id: 'stale-id',
        worldId: '123456789012345678',
        json: sceneJson('Stale Palette'),
      }),
    ]);
    await Promise.resolve();
    expect(
      screen.queryByRole('button', { name: 'Place composition Stale Palette' })
    ).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Place composition Replacement Palette',
      })
    ).toBeTruthy();
  });

  it('uses safe generic copy for access denial without relabeling arbitrary failures', async () => {
    const deniedReader = {
      listCompositions: vi.fn(async () => {
        throw new ConnectError(
          'internal membership policy details',
          Code.PermissionDenied
        );
      }),
      getComposition: vi.fn(),
    } as unknown as CompositionReader;
    const denied = renderPalette({
      worldId: '123456789012345678',
      reader: deniedReader,
    });
    await waitFor(() =>
      expect(
        screen.getByText(/You do not have access to this server's world/i)
      ).toBeDefined()
    );
    expect(
      screen.queryByText(/internal membership policy details/i)
    ).toBeNull();

    denied.rerenderSource(undefined);
    const unavailableReader = {
      listCompositions: vi.fn(async () => {
        throw new ConnectError(
          'provider temporarily unavailable',
          Code.Unavailable
        );
      }),
      getComposition: vi.fn(),
    } as unknown as CompositionReader;
    denied.rerenderSource({
      worldId: '123456789012345678',
      reader: unavailableReader,
    });
    await waitFor(() =>
      expect(
        screen.getByText(/provider temporarily unavailable/i)
      ).toBeDefined()
    );
    expect(
      screen.queryByText(/You do not have access to this server's world/i)
    ).toBeNull();
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
