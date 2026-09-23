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
it('uses provider IDs including allies and ignores late, mismatched, and deselected previews', async () => {
  vi.useFakeTimers();
  const pending: ((value: unknown) => void)[] = [];
  afford.mockImplementation(
    () => new Promise((resolve) => pending.push(resolve))
  );
  const declarations: Declaration[] = [];
  const { result, rerender } = renderHook(
    ({ x, id }) =>
      useSessionCastAim('session', 'member', id, { x, y: 1 }, declarations),
    { initialProps: { x: 1.1, id: 'cast' as string | undefined } }
  );
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
  rerender({ x: 1.2, id: 'cast' });
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
  await act(async () => {
    pending[0]({
      castAim: {
        aim: { declaration: 'cast', cell: { x: 1.1, y: 1 } },
        available: true,
        affectedMembers: ['stale'],
      },
    });
  });
  expect(result.current).toEqual([]);
  await act(async () => {
    pending[1]({
      castAim: {
        aim: { declaration: 'cast', cell: { x: 1.2, y: 1 } },
        available: true,
        affectedMembers: ['enemy', 'ally'],
      },
    });
  });
  expect(result.current).toEqual(['enemy', 'ally']);
  rerender({ x: 1.3, id: 'cast' });
  expect(result.current).toEqual([]);
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
  await act(async () => {
    pending[2]({
      castAim: {
        aim: { declaration: 'wrong', cell: { x: 1.3, y: 1 } },
        available: true,
        affectedMembers: ['wrong'],
      },
    });
  });
  expect(result.current).toEqual([]);
  rerender({ x: 1.4, id: 'cast' });
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
  rerender({ x: 1.4, id: undefined });
  await act(async () => {
    pending[3]({
      castAim: {
        aim: { declaration: 'cast', cell: { x: 1.4, y: 1 } },
        available: true,
        affectedMembers: ['cancelled'],
      },
    });
  });
  expect(result.current).toEqual([]);
});
