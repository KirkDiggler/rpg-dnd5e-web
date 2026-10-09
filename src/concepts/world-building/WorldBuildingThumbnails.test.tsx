import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EncounterStudioSession,
  EncounterStudioView,
} from '../encounter-studio/studioSession';
import type { KeyValueStorage } from './types';
import { worldAssetThumbnailKey } from './worldAssetThumbnailKey';

interface ThumbnailRequest {
  requestKey: string;
  children: ReactNode;
  onComplete: (requestKey: string, image: string) => void;
  onError: (requestKey: string, message: string) => void;
  onRootError: (message: string) => void;
}

const worker = vi.hoisted(() => ({
  requests: [] as ThumbnailRequest[],
  cleanups: vi.fn(),
}));

vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: (props: ThumbnailRequest) => {
    useEffect(() => {
      worker.requests.push(props);
      return () => worker.cleanups(props.requestKey);
      // The real worker keeps one request alive across ordinary rerenders.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.requestKey]);
    return <div data-testid="thumbnail-worker" />;
  },
}));

vi.mock('./WorldBuildingViewport', () => ({
  WorldBuildingViewport: () => <div data-testid="mock-world-viewport" />,
}));

import { WorldBuildingConcept } from './WorldBuildingConcept';

class MemoryStorage implements KeyValueStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  worker.requests.length = 0;
  worker.cleanups.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('World Builder generated asset thumbnails', () => {
  it('uses one demand-gated Studio host, caches ready results across views and keeps live wall intents/preview callbacks', () => {
    let session: EncounterStudioSession;
    let view: EncounterStudioView = 'layout';
    let demand = false;
    const storage = new MemoryStorage();
    const element = () => (
      <WorldBuildingConcept
        roomMode
        storage={storage}
        studioPresentation={{
          view,
          thumbnailDemand: demand,
          render: (next) => {
            session = next;
            return view === '3d' ? next.propControls.palette : null;
          },
        }}
      />
    );
    const mounted = render(element());
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
    expect(worker.requests).toHaveLength(0);
    expect(
      session!.wallEditing.options.every(
        (option) => option.thumbnail.status === 'loading'
      )
    ).toBe(true);
    demand = true;
    mounted.rerender(element());
    expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);
    // Run the actual owner queue; only its WebGL capture leaf is mocked.
    // Find a request that is an eligible Studio appearance, without assuming
    // generated catalog order or allowing a placeholder to claim ready.
    while (true) {
      const active = worker.requests.at(-1)!;
      const [ref] = JSON.parse(active.requestKey) as [string, string];
      if (session!.wallEditing.options.some((option) => option.ref === ref))
        break;
      act(() =>
        active.onComplete(active.requestKey, 'data:image/png;base64,other')
      );
    }
    const request = worker.requests.at(-1)!;
    const [ref] = JSON.parse(request.requestKey) as [string, string];
    const live = session!.wallEditing;
    const epoch = session!.intentEpoch;
    const preview =
      session!.viewportProps.roomAuthoring!.onWallTransformPreview;
    act(() =>
      request.onComplete(
        request.requestKey,
        'data:image/png;base64,wall-capture'
      )
    );
    expect(session!.intentEpoch).toBe(epoch);
    expect(session!.viewportProps.roomAuthoring!.onWallTransformPreview).toBe(
      preview
    );
    expect(
      session!.wallEditing.options.find((option) => option.ref === ref)
        ?.thumbnail
    ).toEqual({ status: 'ready', image: 'data:image/png;base64,wall-capture' });
    act(() => expect(live.setAsset(ref)).toBe(true));
    const armed = session!.wallEditing;
    const armedEpoch = session!.intentEpoch;
    const nextRequest = worker.requests.at(-1)!;
    act(() => nextRequest.onError(nextRequest.requestKey, 'missing GLB'));
    expect(session!.intentEpoch).toBe(armedEpoch);
    act(() =>
      expect(
        armed.create({ start: { x: -1, z: 0 }, end: { x: 1, z: 0 } })
      ).toBe(true)
    );
    demand = false;
    mounted.rerender(element());
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
    expect(
      session!.wallEditing.options.find((option) => option.ref === ref)
        ?.thumbnail
    ).toEqual({ status: 'ready', image: 'data:image/png;base64,wall-capture' });
    view = '3d';
    mounted.rerender(element());
    expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: ref },
    });
    const readyCard = document.querySelector(`[data-asset-ref="${ref}"]`)!;
    expect(readyCard.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,wall-capture'
    );
    view = 'layout';
    demand = true;
    mounted.rerender(element());
    expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);
    expect(
      session!.wallEditing.options.find((option) => option.ref === ref)
        ?.thumbnail.status
    ).toBe('ready');
    expect(
      worker.requests.filter(
        (candidate) => candidate.requestKey === request.requestKey
      )
    ).toHaveLength(1);
    expect(session!.document.draft.room.walls).toHaveLength(1);
  });

  it('keeps a live 3D wall preview and its captured commit through cosmetic and thumbnail rerenders', () => {
    let session: EncounterStudioSession;
    const storage = new MemoryStorage();
    const element = () => (
      <WorldBuildingConcept
        roomMode
        storage={storage}
        studioPresentation={{
          view: '3d',
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
    const mounted = render(element());
    act(() =>
      expect(
        session!.wallEditing.setAsset('dnd5e:env:dark-fortress:45_wall_01')
      ).toBe(true)
    );
    act(() =>
      expect(
        session!.wallEditing.create({
          start: { x: -1, z: 0 },
          end: { x: 1, z: 0 },
        })
      ).toBe(true)
    );
    act(() => session!.setPropTool('move'));
    const wall = session!.document.draft.room.walls![0];
    const previewWall = { ...wall, label: 'Live preview' };
    const callback =
      session!.viewportProps.roomAuthoring!.onWallTransformPreview!;
    const commit = session!.wallEditing.edit;
    const epoch = session!.intentEpoch;
    act(() => callback(previewWall));
    expect(session!.viewportProps.roomAuthoring!.previewWall).toEqual(
      previewWall
    );
    mounted.rerender(element());
    const request = worker.requests.at(-1)!;
    act(() =>
      request.onComplete(request.requestKey, 'data:image/png;base64,cosmetic')
    );
    expect(session!.intentEpoch).toBe(epoch);
    expect(session!.viewportProps.roomAuthoring!.onWallTransformPreview).toBe(
      callback
    );
    expect(session!.viewportProps.roomAuthoring!.previewWall).toEqual(
      previewWall
    );
    act(() => expect(commit(previewWall)).toBe(true));
    expect(session!.document.draft.room.walls![0].label).toBe('Live preview');
    expect(session!.viewportProps.roomAuthoring!.previewWall).toBeNull();
  });

  it('projects named selectable error appearances when capture setup fails, not fake ready images', () => {
    let session: EncounterStudioSession;
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        studioPresentation={{
          view: 'layout',
          thumbnailDemand: true,
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
    act(() => worker.requests[0]!.onRootError('WebGL context unavailable'));
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
    expect(
      session!.wallEditing.options.every(
        (option) => option.thumbnail.status === 'error'
      )
    ).toBe(true);
    const option = session!.wallEditing.options.find(
      (candidate) => !candidate.wallMatch
    )!;
    expect(option.label).toBeTruthy();
    expect(option.thumbnail).toEqual({
      status: 'error',
      message: 'WebGL context unavailable',
    });
    act(() => expect(session!.wallEditing.setAsset(option.ref)).toBe(true));
    expect(session!.wallEditing.assetRef).toBe(option.ref);
    expect(session!.document.draft.room.walls).toBeUndefined();
  });

  it('captures a missing generated thumbnail automatically while leaving the legacy Plushie PNG in place', () => {
    render(<WorldBuildingConcept storage={new MemoryStorage()} />);

    // New assets can change catalog order; complete and inspect the SAME entry.
    const request = worker.requests[0]!;
    const asset = Object.values(GENERATED_WORLD_ASSETS).find(
      (candidate) => worldAssetThumbnailKey(candidate) === request.requestKey
    );
    expect(asset).toBeDefined();
    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: asset!.ref },
    });
    const generated = screen.getByLabelText(
      `Drag ${asset!.displayName} into scene`
    );
    expect(generated.getAttribute('data-thumbnail-state')).toBe('loading');
    expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);

    act(() =>
      request.onComplete(
        request.requestKey,
        'data:image/png;base64,generated-asset'
      )
    );

    expect(generated.getAttribute('data-thumbnail-state')).toBe('ready');
    expect(generated.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,generated-asset'
    );

    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: 'Plushie Skeleton Dog' },
    });
    const plushie = screen.getByLabelText(
      'Drag Plushie Skeleton Dog into scene'
    );
    expect(plushie.getAttribute('data-thumbnail-state')).toBe('legacy');
    expect(plushie.querySelector('img')?.getAttribute('src')).toMatch(
      /plushie-skeleton-dog\.png/
    );

    const requestsBeforeReturning = worker.requests.length;
    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: asset!.ref },
    });
    const restored = screen.getByLabelText(
      `Drag ${asset!.displayName} into scene`
    );
    expect(restored.getAttribute('data-thumbnail-state')).toBe('ready');
    expect(restored.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,generated-asset'
    );
    expect(worker.requests).toHaveLength(requestsBeforeReturning);
  });

  it('serially captures every generated catalog entry and releases its one worker', () => {
    render(<WorldBuildingConcept storage={new MemoryStorage()} />);
    const generatedCount = Object.keys(GENERATED_WORLD_ASSETS).length;
    // Capture the real, complete catalog without reconciling every card on
    // each completion (quadratic DOM work as content packs grow). Filtering
    // must not stop the queue; restore every card to assert all results below.
    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: 'no-matching-thumbnail-test-asset' },
    });
    expect(document.querySelectorAll('[data-asset-ref]')).toHaveLength(0);

    for (let index = 0; index < generatedCount; index += 1) {
      expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);
      const request = worker.requests[index];
      expect(request).toBeDefined();
      act(() =>
        request!.onComplete(
          request!.requestKey,
          `data:image/png;base64,generated-${index}`
        )
      );
    }

    expect(worker.requests).toHaveLength(generatedCount);
    expect(
      new Set(worker.requests.map((request) => request.requestKey))
    ).toEqual(
      new Set(Object.values(GENERATED_WORLD_ASSETS).map(worldAssetThumbnailKey))
    );
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: '' },
    });
    const ready = document.querySelectorAll(
      '[data-thumbnail-state="ready"] img'
    );
    expect(ready).toHaveLength(generatedCount);
    for (const image of ready) {
      expect(image.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    }
  });

  it('falls back per asset after a GLB failure, continues the queue, and cleans up active work', () => {
    const view = render(<WorldBuildingConcept storage={new MemoryStorage()} />);
    const failedRequest = worker.requests[0]!;
    const [failedRef] = JSON.parse(failedRequest.requestKey) as [
      string,
      string,
    ];
    const failedCard = document.querySelector(
      `[data-asset-ref="${failedRef}"]`
    );

    act(() => failedRequest.onError(failedRequest.requestKey, 'missing GLB'));
    expect(failedCard?.getAttribute('data-thumbnail-state')).toBe('error');
    expect(failedCard?.querySelector('img')).toBeNull();
    expect(failedCard?.textContent).toContain('!');
    expect(worker.requests).toHaveLength(2);

    const activeKey = worker.requests[1]!.requestKey;
    view.unmount();
    expect(worker.cleanups).toHaveBeenCalledWith(activeKey);
  });

  it('settles every generated fallback when shared WebGL setup fails', () => {
    render(<WorldBuildingConcept storage={new MemoryStorage()} />);
    act(() => worker.requests[0]!.onRootError('WebGL context unavailable'));

    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
    expect(
      document.querySelectorAll('[data-thumbnail-state="error"]')
    ).toHaveLength(Object.keys(GENERATED_WORLD_ASSETS).length);
  });
});
