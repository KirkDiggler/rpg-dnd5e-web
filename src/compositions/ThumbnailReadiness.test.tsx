import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailRenderer } from './CompositionThumbnailRenderer';
const capture = vi.hoisted(() => ({
  frame: undefined as (() => void) | undefined,
  root: { configure: vi.fn(), render: vi.fn(), unmount: vi.fn() },
  png: vi.fn(() => 'data:image/png;base64,ready'),
}));
vi.mock('@react-three/fiber', () => ({
  createRoot: () => capture.root,
  extend: vi.fn(),
  useFrame: (callback: () => void) => {
    capture.frame = callback;
  },
  useThree: () => ({
    camera: {
      position: { set: vi.fn() },
      up: { set: vi.fn() },
      lookAt: vi.fn(),
      updateMatrixWorld: vi.fn(),
      updateProjectionMatrix: vi.fn(),
    },
    gl: { render: vi.fn(), domElement: { toDataURL: capture.png } },
    invalidate: vi.fn(),
    scene: {},
  }),
}));
vi.mock('@react-three/drei', () => ({
  Bounds: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./CompositionModel', () => ({ CompositionModel: () => null }));
beforeEach(() => {
  capture.root.configure.mockResolvedValue(capture.root);
  capture.root.render.mockClear();
  capture.png.mockClear();
});
afterEach(cleanup);

describe('capture readiness gate', () => {
  it('cannot capture until requested nested assets are ready, then waits for settled frames', async () => {
    const complete = vi.fn();
    const error = vi.fn();
    const element = (ready: boolean) => (
      <ThumbnailRenderer
        requestKey="customized"
        ready={ready}
        fitBounds={false}
        onComplete={complete}
        onError={error}
        onRootError={error}
      >
        <></>
      </ThumbnailRenderer>
    );
    const root = render(element(false));
    await act(async () => undefined);
    const scene = render(capture.root.render.mock.calls.at(-1)![0]);
    act(() => {
      for (let i = 0; i < 5; i++) capture.frame!();
    });
    expect(complete).not.toHaveBeenCalled();
    expect(capture.png).not.toHaveBeenCalled();
    root.rerender(element(true));
    await act(async () => undefined);
    scene.rerender(capture.root.render.mock.calls.at(-1)![0]);
    act(() => {
      capture.frame!();
      capture.frame!();
    });
    expect(complete).not.toHaveBeenCalled();
    act(() => capture.frame!());
    expect(complete).toHaveBeenCalledWith(
      'customized',
      'data:image/png;base64,ready'
    );
    expect(error).not.toHaveBeenCalled();
    scene.unmount();
  });
});
