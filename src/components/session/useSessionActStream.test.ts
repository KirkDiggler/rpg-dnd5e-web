import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionActStream } from './useSessionActStream';

const client = vi.hoisted(() => ({
  streamEvents: vi.fn(),
  getStory: vi.fn(),
}));
vi.mock('@/api/client', () => ({ storyClient: client }));

/** A stream that yields nothing and stays open until aborted. */
function heldOpen(_req: unknown, options?: { signal?: AbortSignal }) {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<never>>((resolve) =>
          options?.signal?.addEventListener('abort', () =>
            resolve({ done: true, value: undefined })
          )
        ),
    }),
  };
}

afterEach(() => {
  client.streamEvents.mockReset();
  client.getStory.mockReset();
});

describe('useSessionActStream liveness', () => {
  function mount() {
    client.getStory.mockResolvedValue({
      acts: [],
      more: false,
      restarted: false,
    });
    client.streamEvents.mockImplementation(heldOpen);
    return renderHook(() => useSessionActStream('run', 'alice', vi.fn()));
  }

  it('re-reads on window focus: catch-up, then a fresh stream', async () => {
    const view = mount();
    await waitFor(() => expect(client.streamEvents).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(client.streamEvents).toHaveBeenCalledTimes(2));
    expect(client.getStory).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('re-reads when the page becomes visible, not when it hides', async () => {
    const view = mount();
    await waitFor(() => expect(client.streamEvents).toHaveBeenCalledTimes(1));
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(client.streamEvents).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(client.streamEvents).toHaveBeenCalledTimes(2));
    visibility.mockRestore();
    view.unmount();
  });

  it('stops listening once unmounted', async () => {
    const view = mount();
    await waitFor(() => expect(client.streamEvents).toHaveBeenCalledTimes(1));
    view.unmount();
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 20));
    expect(client.streamEvents).toHaveBeenCalledTimes(1);
  });
});
