import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDesktopHotbarFrame } from './useDesktopHotbarFrame';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useDesktopHotbarFrame', () => {
  it('uses measured container boundaries, disconnects and ignores callbacks after replacement', () => {
    const callbacks: ResizeObserverCallback[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    const element = document.createElement('div');
    const view = renderHook(
      ({ container }) => useDesktopHotbarFrame(container),
      { initialProps: { container: element } }
    );
    const resize = (width: number, height: number, index = 0) =>
      act(() =>
        callbacks[index]!(
          [
            {
              target: index ? replacement : element,
              contentRect: { width, height },
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver
        )
      );
    expect(view.result.current).toBe(false);
    resize(999, 900);
    expect(view.result.current).toBe(false);
    resize(1000, 500);
    expect(view.result.current).toBe(false);
    resize(1000, 501);
    expect(view.result.current).toBe(true);
    resize(393, 844);
    expect(view.result.current).toBe(false);
    resize(1280, 900);
    expect(view.result.current).toBe(true);
    const replacement = document.createElement('div');
    view.rerender({ container: replacement });
    expect(view.result.current).toBe(false);
    resize(1280, 900);
    expect(view.result.current).toBe(false);
    resize(1280, 900, 1);
    expect(view.result.current).toBe(true);
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('keeps the legacy surface without a container or observer', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const view = renderHook(
      ({ container }) => useDesktopHotbarFrame(container),
      { initialProps: { container: null as HTMLElement | null } }
    );
    expect(view.result.current).toBe(false);
    view.rerender({ container: document.createElement('div') });
    expect(view.result.current).toBe(false);
  });
});
