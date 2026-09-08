import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSerialThumbnailQueue } from './useSerialThumbnailQueue';

interface Entry {
  key: string;
  label: string;
}

interface WorkerRequest {
  requestKey: string;
  onComplete: (requestKey: string, image: string) => void;
  onError: (requestKey: string, message: string) => void;
}

const worker = {
  requests: [] as WorkerRequest[],
  cleanups: vi.fn(),
};

function Worker(props: WorkerRequest) {
  useEffect(() => {
    worker.requests.push(props);
    return () => worker.cleanups(props.requestKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.requestKey]);
  return <div data-testid="queue-worker" />;
}

function Harness({ entries }: { entries: readonly Entry[] }) {
  const queue = useSerialThumbnailQueue(entries);
  return (
    <>
      {entries.map((entry) => {
        const result = queue.results[entry.key];
        return (
          <output key={entry.label} data-testid={`result-${entry.label}`}>
            {result?.status ?? 'loading'}:
            {result?.image ?? result?.message ?? ''}
          </output>
        );
      })}
      {queue.active && (
        <Worker
          requestKey={queue.active.key}
          onComplete={queue.recordComplete}
          onError={queue.recordError}
        />
      )}
    </>
  );
}

beforeEach(() => {
  worker.requests.length = 0;
  worker.cleanups.mockClear();
});

describe('useSerialThumbnailQueue', () => {
  it('processes one immutable request at a time and releases the worker when settled', () => {
    render(
      <Harness
        entries={[
          { key: 'asset-a:hash-a', label: 'a' },
          { key: 'asset-b:hash-b', label: 'b' },
        ]}
      />
    );

    expect(screen.getAllByTestId('queue-worker')).toHaveLength(1);
    expect(worker.requests.map((request) => request.requestKey)).toEqual([
      'asset-a:hash-a',
    ]);
    act(() =>
      worker.requests[0]!.onComplete(
        'asset-a:hash-a',
        'data:image/png;base64,a'
      )
    );
    expect(worker.requests.map((request) => request.requestKey)).toEqual([
      'asset-a:hash-a',
      'asset-b:hash-b',
    ]);
    expect(screen.getByTestId('result-a').textContent).toContain('ready');

    act(() => worker.requests[1]!.onError('asset-b:hash-b', 'missing GLB'));
    expect(screen.getByTestId('result-b').textContent).toBe(
      'error:missing GLB'
    );
    expect(screen.queryByTestId('queue-worker')).toBeNull();
  });

  it('rejects a stale completion after the exact content key changes', () => {
    const oldEntries = [{ key: 'asset-a:old-hash', label: 'asset' }];
    const nextEntries = [{ key: 'asset-a:new-hash', label: 'asset' }];
    const view = render(<Harness entries={oldEntries} />);
    const stale = worker.requests[0]!;

    view.rerender(<Harness entries={nextEntries} />);
    expect(worker.cleanups).toHaveBeenCalledWith('asset-a:old-hash');
    expect(worker.requests.at(-1)?.requestKey).toBe('asset-a:new-hash');

    act(() =>
      stale.onComplete('asset-a:old-hash', 'data:image/png;base64,stale')
    );
    expect(screen.getByTestId('result-asset').textContent).toBe('loading:');

    const current = worker.requests.at(-1)!;
    act(() =>
      current.onComplete('asset-a:new-hash', 'data:image/png;base64,current')
    );
    expect(screen.getByTestId('result-asset').textContent).toBe(
      'ready:data:image/png;base64,current'
    );
  });

  it('cleans up active work on unmount', () => {
    const view = render(
      <Harness entries={[{ key: 'asset-a:hash-a', label: 'a' }]} />
    );
    view.unmount();
    expect(worker.cleanups).toHaveBeenCalledWith('asset-a:hash-a');
  });
});
