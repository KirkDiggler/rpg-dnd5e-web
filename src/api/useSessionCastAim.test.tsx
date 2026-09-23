// @vitest-environment jsdom
import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSessionCastAim } from './useSessionCastAim';
const afford = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ sessionClient: { afford } }));
afterEach(() => {
  vi.useRealTimers();
  afford.mockReset();
});
it('previews during continuous motion without starving slow requests; clears cancelled and mismatched responses', async () => {
  vi.useFakeTimers();
  const pending: ((value: unknown) => void)[] = [];
  afford.mockImplementation(
    () => new Promise((resolve) => pending.push(resolve))
  );
  const declarations: Declaration[] = [];
  const { result, rerender, unmount } = renderHook(
    ({ x, id }) =>
      useSessionCastAim('session', 'member', id, { x, y: 1 }, declarations),
    { initialProps: { x: 1, id: 'cast' as string | undefined } }
  );
  // Moving every 20ms must still send a request before the pointer stops.
  for (let x = 2; x <= 5; x++) {
    rerender({ x, id: 'cast' });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
  }
  expect(afford).toHaveBeenCalledTimes(1);
  expect(afford.mock.calls[0][0].castAim.cell).toEqual({ x: 5, y: 1 });
  rerender({ x: 6, id: 'cast' });
  await act(async () => {
    vi.advanceTimersByTime(240);
  });
  expect(afford).toHaveBeenCalledTimes(1); // Slow request is not aborted/restarted.
  await act(async () => {
    pending[0]({
      castAim: {
        aim: { declaration: 'cast', cell: { x: 5, y: 1 } },
        available: true,
        affectedMembers: ['enemy', 'ally'],
      },
    });
  });
  expect(result.current).toEqual(['enemy', 'ally']);
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
  expect(afford.mock.calls[1][0].castAim.cell).toEqual({ x: 6, y: 1 });
  expect(result.current).toEqual(['enemy', 'ally']);
  await act(async () => {
    pending[1]({
      castAim: {
        aim: { declaration: 'wrong', cell: { x: 6, y: 1 } },
        available: true,
        affectedMembers: ['wrong'],
      },
    });
  });
  expect(result.current).toEqual([]);
  rerender({ x: 7, id: 'cast' });
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
  rerender({ x: 7, id: undefined });
  await act(async () => {
    pending[2]({
      castAim: {
        aim: { declaration: 'cast', cell: { x: 7, y: 1 } },
        available: true,
        affectedMembers: ['cancelled'],
      },
    });
  });
  expect(result.current).toEqual([]);
  unmount();
});
