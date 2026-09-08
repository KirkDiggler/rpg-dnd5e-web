import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fiber = vi.hoisted(() => {
  const root = {
    configure: vi.fn(),
    render: vi.fn(),
    unmount: vi.fn(),
  };
  return {
    createRoot: vi.fn(() => root),
    extend: vi.fn(),
    root,
  };
});
const bounds = vi.hoisted(() => ({ maxDurations: [] as number[] }));

vi.mock('@react-three/fiber', () => ({
  createRoot: fiber.createRoot,
  extend: fiber.extend,
  useFrame: vi.fn(),
  useThree: () => ({
    camera: {
      position: { set: vi.fn() },
      up: { set: vi.fn() },
      lookAt: vi.fn(),
      updateMatrixWorld: vi.fn(),
      updateProjectionMatrix: vi.fn(),
    },
    gl: {},
    invalidate: vi.fn(),
    scene: {},
  }),
}));

vi.mock('@react-three/drei', () => ({
  Bounds: ({
    children,
    maxDuration,
  }: {
    children: ReactNode;
    maxDuration: number;
  }) => {
    bounds.maxDurations.push(maxDuration);
    return <>{children}</>;
  },
}));

vi.mock('@/compositions/CompositionModel', () => ({
  CompositionModel: () => null,
}));

import { CompositionThumbnailTiles } from './CompositionThumbnailTiles';

function composition(id: string): Composition {
  return create(CompositionSchema, {
    id,
    worldId: 'world-a',
    json: JSON.stringify({
      kind: 'rpg-world-building-scene',
      version: 1,
      scene: {
        version: 1,
        id: `${id}-scene`,
        name: id,
        items: [],
        groups: [],
      },
    }),
  });
}

function tiles(compositions: readonly Composition[], tool: 'select' | 'place') {
  return (
    <CompositionThumbnailTiles
      sourceWorldId="world-a"
      compositions={compositions}
      tool={tool}
      armed={null}
      onArm={vi.fn()}
      onTool={vi.fn()}
    />
  );
}

beforeEach(() => {
  fiber.createRoot.mockReset();
  fiber.createRoot.mockImplementation(() => fiber.root);
  fiber.root.configure.mockReset();
  fiber.root.configure.mockResolvedValue(fiber.root);
  fiber.root.render.mockReset();
  fiber.root.unmount.mockReset();
  fiber.extend.mockReset();
  bounds.maxDurations.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('composition thumbnail capture lifecycle', () => {
  it('settles every pending tile when async R3F configuration rejects', async () => {
    fiber.root.configure.mockRejectedValue(
      new Error('WebGL context unavailable')
    );

    render(
      tiles(
        [composition('large-hall'), composition('off-center-books')],
        'select'
      )
    );

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('button')
          .map((button) => button.getAttribute('data-thumbnail-state'))
      ).toEqual(['error', 'error']);
    });
    expect(screen.getAllByRole('button')[1].textContent).toContain(
      'WebGL context unavailable'
    );
    expect(fiber.root.render).not.toHaveBeenCalled();
    expect(fiber.root.unmount).toHaveBeenCalled();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('settles every pending tile when R3F root creation throws synchronously', async () => {
    fiber.createRoot.mockImplementationOnce(() => {
      throw new Error('R3F root unavailable');
    });

    render(
      tiles(
        [composition('large-hall'), composition('off-center-books')],
        'select'
      )
    );

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('button')
          .map((button) => button.getAttribute('data-thumbnail-state'))
      ).toEqual(['error', 'error']);
    });
    expect(screen.getAllByRole('button')[0].textContent).toContain(
      'R3F root unavailable'
    );
    expect(fiber.root.configure).not.toHaveBeenCalled();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('does not extend a request timeout when an ordinary tool rerender occurs', async () => {
    vi.useFakeTimers();
    const entries = [composition('hung-model'), composition('next-model')];
    const view = render(tiles(entries, 'select'));

    await act(async () => undefined);
    const scene = fiber.root.render.mock.calls.at(-1)?.[0] as ReactNode;
    const sceneView = render(scene);
    expect(bounds.maxDurations).toContain(0);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    view.rerender(tiles(entries, 'place'));
    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(
      screen.getAllByRole('button')[0].getAttribute('data-thumbnail-state')
    ).toBe('loading');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.getAllByRole('button')[0].getAttribute('data-thumbnail-state')
    ).toBe('error');
    expect(
      screen.getAllByRole('button')[1].getAttribute('data-thumbnail-state')
    ).toBe('loading');
    expect(fiber.createRoot).toHaveBeenCalledTimes(1);
    expect(fiber.root.configure).toHaveBeenCalledTimes(1);
    expect(fiber.root.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        dpr: 1,
        frameloop: 'demand',
        size: { width: 128, height: 128, top: 0, left: 0 },
      })
    );
    sceneView.unmount();
  });

  it('reuses its canvas through the StrictMode probe and disposes it on the real cleanup', async () => {
    const view = render(
      <StrictMode>{tiles([composition('strict-model')], 'select')}</StrictMode>
    );

    await act(async () => undefined);
    expect(fiber.createRoot).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);

    view.unmount();
    await act(async () => undefined);
    expect(fiber.root.unmount).toHaveBeenCalledTimes(1);
    expect(document.querySelector('canvas')).toBeNull();
  });
});
