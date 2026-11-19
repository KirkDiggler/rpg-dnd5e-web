/**
 * ONE STEP FROM THE LAYOUT (rpg-project#1006): the hook sends the game's own
 * Move, one cell, the world clock's empty selector; a second click while one
 * is in flight is ignored; a refusal is the server's sentence, and the
 * turn-clock kind sends moves in a fight to the game. The Move client is
 * mocked; nothing here moves anyone.
 */
import { Code, ConnectError } from '@connectrpc/connect';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ moveFn: vi.fn() }));
vi.mock('@/api/client', () => ({ sessionClient: { move: hoisted.moveFn } }));

import type { RunView } from './runView';
import {
  layoutStepsOf,
  RECORD_WAIT_MS,
  STEP_STARTED_A_FIGHT,
  TRIED_MARK_MS,
  useStudioStep,
} from './useStudioStep';

afterEach(() => {
  cleanup();
  hoisted.moveFn.mockReset();
});

const WATCH = { session: 'run-1', member: 'hero' };

describe('useStudioStep', () => {
  it('sends one move: the run, the seat, a one-cell axial path, the empty selector', async () => {
    hoisted.moveFn.mockResolvedValue({ steps: [], stopReason: '' });
    const { result } = renderHook(() => useStudioStep(WATCH));
    act(() => result.current.step({ q: 3, r: -1 }));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(hoisted.moveFn).toHaveBeenCalledExactlyOnceWith({
      session: 'run-1',
      member: 'hero',
      path: [{ x: 3, y: -1 }],
      declarationId: '',
    });
    expect(result.current.refusal).toBeNull();
    expect(result.current.fight).toBe(false);
    expect(result.current.tried).toBeNull();
  });

  it('ignores a second step while the first is in flight', async () => {
    let answer: (value: unknown) => void = () => {};
    hoisted.moveFn.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const { result } = renderHook(() => useStudioStep(WATCH));
    act(() => {
      result.current.step({ q: 1, r: 0 });
      result.current.step({ q: 0, r: 1 });
    });
    expect(result.current.busy).toBe(true);
    act(() => result.current.step({ q: -1, r: 0 }));
    expect(hoisted.moveFn).toHaveBeenCalledOnce();
    await act(async () => answer({ steps: [], stopReason: '' }));
    expect(result.current.busy).toBe(false);
    // Free again: the next click sends.
    act(() => result.current.step({ q: 0, r: 1 }));
    expect(hoisted.moveFn).toHaveBeenCalledTimes(2);
  });

  it('a refused step shows the server’s sentence, not a fight', async () => {
    hoisted.moveFn.mockRejectedValue(
      new ConnectError(
        'move destination: cell is not walkable',
        Code.FailedPrecondition
      )
    );
    const { result } = renderHook(() => useStudioStep(WATCH));
    act(() => result.current.step({ q: 1, r: 0 }));
    await waitFor(() =>
      expect(result.current.refusal).toBe(
        'move destination: cell is not walkable'
      )
    );
    expect(result.current.fight).toBe(false);
    expect(result.current.tried).toEqual({ q: 1, r: 0 });
  });

  it('the tried hex is marked briefly, then cleared', async () => {
    vi.useFakeTimers();
    try {
      hoisted.moveFn.mockResolvedValue({ steps: [], stopReason: 'Blocked.' });
      const { result } = renderHook(() => useStudioStep(WATCH));
      await act(async () => result.current.step({ q: 1, r: 0 }));
      expect(result.current.tried).toEqual({ q: 1, r: 0 });
      act(() => vi.advanceTimersByTime(TRIED_MARK_MS));
      expect(result.current.tried).toBeNull();
      expect(result.current.refusal).toBe('Blocked.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a step stopped short says why (a short walk is an answer)', async () => {
    hoisted.moveFn.mockResolvedValue({
      steps: [],
      stopReason: 'Something is in the way.',
    });
    const { result } = renderHook(() => useStudioStep(WATCH));
    act(() => result.current.step({ q: 1, r: 0 }));
    await waitFor(() =>
      expect(result.current.refusal).toBe('Something is in the way.')
    );
  });

  it.each([
    [
      'not your turn',
      new ConnectError('move: not your turn', Code.FailedPrecondition),
    ],
    [
      'no turn-clock selector',
      new ConnectError('move: empty declaration id', Code.InvalidArgument),
    ],
  ])(
    'a turn-clock refusal (%s) is a fight: moves are made in the game',
    async (_, err) => {
      hoisted.moveFn.mockRejectedValue(err);
      const { result } = renderHook(() => useStudioStep(WATCH));
      act(() => result.current.step({ q: 1, r: 0 }));
      await waitFor(() => expect(result.current.fight).toBe(true));
      expect(result.current.refusal).toBeTruthy();
    }
  );

  it('a step that starts a fight says so', async () => {
    hoisted.moveFn.mockResolvedValue({
      steps: [],
      stopReason: '',
      formed: {},
    });
    const { result } = renderHook(() => useStudioStep(WATCH));
    act(() => result.current.step({ q: 1, r: 0 }));
    await waitFor(() => expect(result.current.fight).toBe(true));
    expect(result.current.refusal).toBe(STEP_STARTED_A_FIGHT);
  });

  it('a step that moved holds the latch until the record shows it', async () => {
    hoisted.moveFn.mockResolvedValue({
      steps: [{ position: { x: 1, y: 0 } }],
      stopReason: '',
    });
    const { result, rerender } = renderHook(
      ({ progress }) => useStudioStep(WATCH, progress),
      { initialProps: { progress: 3 } }
    );
    await act(async () => result.current.step({ q: 1, r: 0 }));
    // Answered, but the record has not caught up: still busy, and a
    // second click from the stale cell sends nothing.
    expect(result.current.busy).toBe(true);
    act(() => result.current.step({ q: 2, r: 0 }));
    expect(hoisted.moveFn).toHaveBeenCalledOnce();
    rerender({ progress: 4 });
    expect(result.current.busy).toBe(false);
    act(() => result.current.step({ q: 2, r: 0 }));
    expect(hoisted.moveFn).toHaveBeenCalledTimes(2);
  });

  it('a lost record beat never locks stepping: the latch frees after a short wait', async () => {
    vi.useFakeTimers();
    try {
      hoisted.moveFn.mockResolvedValue({
        steps: [{ position: { x: 1, y: 0 } }],
        stopReason: '',
      });
      const { result } = renderHook(() => useStudioStep(WATCH, 3));
      await act(async () => result.current.step({ q: 1, r: 0 }));
      expect(result.current.busy).toBe(true);
      act(() => vi.advanceTimersByTime(RECORD_WAIT_MS));
      expect(result.current.busy).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a late answer for a run no longer watched is dropped', async () => {
    let answer: (value: unknown) => void = () => {};
    hoisted.moveFn.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const { result, rerender } = renderHook(
      ({ watch }) => useStudioStep(watch),
      {
        initialProps: { watch: WATCH },
      }
    );
    act(() => result.current.step({ q: 1, r: 0 }));
    rerender({ watch: { session: 'run-2', member: 'hero' } });
    await act(async () => answer({ steps: [], stopReason: 'x' }));
    expect(result.current.refusal).toBeNull();
    expect(result.current.tried).toBeNull();
  });

  it('a late refusal for a run no longer watched is dropped', async () => {
    let refuse: (err: unknown) => void = () => {};
    hoisted.moveFn.mockReturnValue(
      new Promise((_, reject) => {
        refuse = reject;
      })
    );
    const { result, rerender } = renderHook(
      ({ watch }) => useStudioStep(watch),
      {
        initialProps: { watch: WATCH },
      }
    );
    act(() => result.current.step({ q: 1, r: 0 }));
    rerender({ watch: { session: 'run-2', member: 'hero' } });
    await act(async () =>
      refuse(new ConnectError('move: not your turn', Code.FailedPrecondition))
    );
    expect(result.current.refusal).toBeNull();
    expect(result.current.fight).toBe(false);
  });

  it('sends nothing when no run is watched', () => {
    const { result } = renderHook(() => useStudioStep(null));
    act(() => result.current.step({ q: 1, r: 0 }));
    expect(hoisted.moveFn).not.toHaveBeenCalled();
  });
});

describe('layoutStepsOf', () => {
  const stepping = { busy: false, step: vi.fn() };
  const view = (cell: { q: number; r: number } | null): RunView => ({
    members: { hero: { id: 'hero', cell, party: true, roles: {} } },
    steps: [],
  });

  it('offers steps from the seat’s cell at the live step', () => {
    expect(
      layoutStepsOf(WATCH, { view: view({ q: 2, r: 1 }), step: null }, stepping)
    ).toMatchObject({ from: { q: 2, r: 1 }, busy: false });
  });

  it('offers none while stepped back in history', () => {
    expect(
      layoutStepsOf(WATCH, { view: view({ q: 2, r: 1 }), step: 1 }, stepping)
    ).toBeUndefined();
  });

  it('offers none when the seat’s cell is not known', () => {
    expect(
      layoutStepsOf(WATCH, { view: view(null), step: null }, stepping)
    ).toBeUndefined();
    expect(
      layoutStepsOf(
        WATCH,
        { view: { members: {}, steps: [] }, step: null },
        stepping
      )
    ).toBeUndefined();
  });
});
