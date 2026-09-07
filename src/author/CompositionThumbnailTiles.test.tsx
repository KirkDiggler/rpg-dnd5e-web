import { compositionRef } from '@/compositions/compositionRef';
import { compositionThumbnailKey } from '@/compositions/compositionThumbnailKey';
import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface WorkerRequest {
  composition: Composition;
  requestKey: string;
  onComplete: (requestKey: string, image: string) => void;
  onError: (requestKey: string, message: string) => void;
}

const worker = vi.hoisted(() => ({
  requests: [] as WorkerRequest[],
  cleanups: vi.fn(),
}));

vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  CompositionThumbnailRenderer: (props: WorkerRequest) => {
    useEffect(() => {
      worker.requests.push(props);
      return () => worker.cleanups(props.requestKey);
      // The real worker's lifetime is one exact immutable request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.requestKey]);
    return <div data-testid="thumbnail-worker" />;
  },
}));

import { CompositionThumbnailTiles } from './CompositionThumbnailTiles';

function sceneJson(id: string): string {
  return JSON.stringify({
    kind: 'rpg-world-building-scene',
    version: 1,
    scene: {
      version: 1,
      id: `${id}-scene`,
      name: id.replaceAll('-', ' '),
      items: [],
      groups: [],
    },
  });
}

function composition(
  id: string,
  worldId = 'world-a',
  json = sceneJson(id)
): Composition {
  return create(CompositionSchema, { id, worldId, json });
}

function renderTiles(
  compositions: readonly Composition[],
  worldId = 'world-a'
) {
  const onArm = vi.fn();
  const onTool = vi.fn();
  const view = render(
    <CompositionThumbnailTiles
      sourceWorldId={worldId}
      compositions={compositions}
      tool="select"
      armed={null}
      onArm={onArm}
      onTool={onTool}
    />
  );
  return { ...view, onArm, onTool };
}

beforeEach(() => {
  worker.requests.length = 0;
  worker.cleanups.mockClear();
});

describe('CompositionThumbnailTiles', () => {
  it('shows a visible loading fallback, swaps in the image, and keeps click-to-arm behavior', () => {
    const table = composition('decorated-table');
    const view = renderTiles([table]);
    const { onArm, onTool } = view;
    const button = screen.getByRole('button', {
      name: 'Place composition decorated table',
    });

    expect(button.getAttribute('data-thumbnail-state')).toBe('loading');
    expect(button.getAttribute('title')).toBe('decorated table');
    expect(button.getAttribute('title')).not.toContain(table.id);
    expect(button.textContent).toContain('DT');
    fireEvent.click(button);
    expect(onArm).toHaveBeenCalledWith({
      kind: 'prop',
      ref: compositionRef(table.id),
    });
    expect(onTool).toHaveBeenCalledWith('place');

    view.rerender(
      <CompositionThumbnailTiles
        sourceWorldId="world-a"
        compositions={[table]}
        tool="place"
        armed={{ kind: 'prop', ref: compositionRef(table.id) }}
        onArm={onArm}
        onTool={onTool}
      />
    );
    expect(button.getAttribute('aria-pressed')).toBe('true');

    const request = worker.requests[0];
    act(() =>
      request.onComplete(request.requestKey, 'data:image/png;base64,table')
    );

    expect(button.getAttribute('data-thumbnail-state')).toBe('ready');
    expect(button.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,table'
    );
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
  });

  it('serializes work and keys cache entries by supplied world plus the complete immutable snapshot', () => {
    const table = composition('decorated-table');
    const books = composition('book-stack');
    const view = renderTiles([table, books]);

    expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);
    expect(worker.requests[0].composition.id).toBe(table.id);
    act(() =>
      worker.requests[0].onComplete(
        worker.requests[0].requestKey,
        'data:image/png;base64,table'
      )
    );
    expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);
    expect(worker.requests.at(-1)?.composition.id).toBe(books.id);
    act(() =>
      worker.requests
        .at(-1)
        ?.onComplete(
          worker.requests.at(-1)?.requestKey ?? '',
          'data:image/png;base64,books'
        )
    );
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();

    view.rerender(
      <CompositionThumbnailTiles
        sourceWorldId="world-a"
        compositions={[create(CompositionSchema, table), books]}
        tool="select"
        armed={null}
        onArm={view.onArm}
        onTool={view.onTool}
      />
    );
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();

    const changed = composition(
      'decorated-table',
      'world-a',
      sceneJson('decorated-table-v2')
    );
    view.rerender(
      <CompositionThumbnailTiles
        sourceWorldId="world-a"
        compositions={[changed]}
        tool="select"
        armed={null}
        onArm={view.onArm}
        onTool={view.onTool}
      />
    );
    expect(worker.requests.at(-1)?.requestKey).toBe(
      compositionThumbnailKey('world-a', changed)
    );

    view.rerender(
      <CompositionThumbnailTiles
        sourceWorldId="world-b"
        compositions={[composition('decorated-table', 'world-b')]}
        tool="select"
        armed={null}
        onArm={view.onArm}
        onTool={view.onTool}
      />
    );
    expect(worker.requests.at(-1)?.requestKey).toBe(
      compositionThumbnailKey(
        'world-b',
        composition('decorated-table', 'world-b')
      )
    );
  });

  it('cleans up obsolete work, ignores stale completion, and leaves failed tiles usable', () => {
    const old = composition('old-table');
    const current = composition('current-table');
    const view = renderTiles([old, current]);
    const staleRequest = worker.requests[0];

    view.rerender(
      <CompositionThumbnailTiles
        sourceWorldId="world-a"
        compositions={[current]}
        tool="select"
        armed={null}
        onArm={view.onArm}
        onTool={view.onTool}
      />
    );
    expect(worker.cleanups).toHaveBeenCalledWith(staleRequest.requestKey);
    act(() =>
      staleRequest.onComplete(
        staleRequest.requestKey,
        'data:image/png;base64,stale'
      )
    );

    const active = worker.requests.at(-1);
    expect(active?.composition.id).toBe(current.id);
    expect(active).toBeDefined();
    act(() => active!.onError(active!.requestKey, 'GLB unavailable'));

    const button = screen.getByRole('button', {
      name: 'Place composition current table',
    });
    expect(button.getAttribute('data-thumbnail-state')).toBe('error');
    expect(button.textContent).toContain('!');
    fireEvent.click(button);
    expect(view.onArm).toHaveBeenCalledWith({
      kind: 'prop',
      ref: compositionRef(current.id),
    });
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
  });
});
