import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const canvas = vi.hoisted(() => ({ mode: 'passive' as 'passive' | 'throw' }));
const bounds = vi.hoisted(() => ({ maxDurations: [] as number[] }));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => {
    if (canvas.mode === 'throw') {
      throw new Error('WebGL context unavailable');
    }
    return <div data-testid="thumbnail-canvas">{children}</div>;
  },
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
    json: `{"snapshot":"${id}"}`,
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
  canvas.mode = 'passive';
  bounds.maxDurations.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('composition thumbnail capture lifecycle', () => {
  it('settles every pending tile when the shared WebGL root cannot be created', () => {
    canvas.mode = 'throw';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      tiles(
        [composition('large-hall'), composition('off-center-books')],
        'select'
      )
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(
      buttons.map((button) => button.getAttribute('data-thumbnail-state'))
    ).toEqual(['error', 'error']);
    expect(buttons[1].textContent).toContain('WebGL context unavailable');
    expect(screen.queryByTestId('thumbnail-canvas')).toBeNull();
  });

  it('does not extend a request timeout when an ordinary tool rerender occurs', () => {
    vi.useFakeTimers();
    const entries = [composition('hung-model'), composition('next-model')];
    const view = render(tiles(entries, 'select'));

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
  });
});
