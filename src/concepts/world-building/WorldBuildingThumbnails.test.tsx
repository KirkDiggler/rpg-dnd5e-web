import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueStorage } from './types';

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
  it('captures a missing generated thumbnail automatically while leaving the legacy Plushie PNG in place', () => {
    render(<WorldBuildingConcept storage={new MemoryStorage()} />);

    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: 'Alchemy Tools 01' },
    });
    const generated = screen.getByLabelText('Drag Alchemy Tools 01 into scene');
    expect(generated.getAttribute('data-thumbnail-state')).toBe('loading');
    expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);

    const request = worker.requests[0]!;
    act(() =>
      request.onComplete(
        request.requestKey,
        'data:image/png;base64,generated-alchemy'
      )
    );

    expect(generated.getAttribute('data-thumbnail-state')).toBe('ready');
    expect(generated.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,generated-alchemy'
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
      target: { value: 'Alchemy Tools 01' },
    });
    const restored = screen.getByLabelText('Drag Alchemy Tools 01 into scene');
    expect(restored.getAttribute('data-thumbnail-state')).toBe('ready');
    expect(restored.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,generated-alchemy'
    );
    expect(worker.requests).toHaveLength(requestsBeforeReturning);
  });

  it('serially captures every generated catalog entry and releases its one worker', () => {
    render(<WorldBuildingConcept storage={new MemoryStorage()} />);
    const generatedCount = Object.keys(GENERATED_WORLD_ASSETS).length;

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
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
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
