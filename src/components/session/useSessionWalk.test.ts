import { Code, ConnectError } from '@connectrpc/connect';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlasPathIndex } from './atlasPath';

const hoisted = vi.hoisted(() => ({
  moveFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    move: hoisted.moveFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionWalk } from './useSessionWalk';

const pos = (x: number, y: number) => ({ x, y }) as never;

/** A 1x3 open corridor: (0,0) -- (1,0) -- (2,-1) (hex-adjacent, no
 * boundaries/doorways/props at all — every edge is open floor). */
function corridorIndex() {
  return buildAtlasPathIndex({
    cells: [pos(0, 0), pos(1, 0), pos(2, -1)],
    boundaries: [],
    doorways: [],
    props: [],
  });
}

beforeEach(() => {
  hoisted.moveFn.mockReset();
});

describe('useSessionWalk', () => {
  it('starts with the display position GetWhere already reported', () => {
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn()
      )
    );
    // y is -0 here (positionToCube's `-q - r` at q=0,r=0), mathematically
    // 0 but distinct under toEqual's Object.is-based comparison.
    expect(result.current.displayPosition).toEqual({ x: 0, y: -0, z: 0 });
    expect(result.current.busy).toBe(false);
  });

  it('walkTo a cell with no route (unreachable) does not dispatch a Move RPC', () => {
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn()
      )
    );
    act(() => result.current.walkTo({ x: 99, y: -99, z: 0 }));
    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('walkTo the current cell is a silent no-op', () => {
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn()
      )
    );
    act(() => result.current.walkTo({ x: 0, y: 0, z: 0 }));
    expect(hoisted.moveFn).not.toHaveBeenCalled();
  });

  it('walkTo a reachable cell sends the request path (excluding the current cell) and goes busy', async () => {
    hoisted.moveFn.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        'v1.move'
      )
    );

    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));

    expect(hoisted.moveFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      declarationId: 'v1.move',
      // (0,0) is the current cell and is excluded; the corridor's
      // middle cell (1,0) then the destination (2,-1) remain.
      path: [
        { x: 1, y: 0 },
        { x: 2, y: -1 },
      ],
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
  });

  it('does not dispatch while move authority is unavailable', () => {
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        undefined
      )
    );

    act(() => result.current.walkTo({ x: 1, y: -1, z: 0 }));

    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('world-clock movement sends an explicit empty declaration id', () => {
    hoisted.moveFn.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        ''
      )
    );

    act(() => result.current.walkTo({ x: 1, y: -1, z: 0 }));

    expect(hoisted.moveFn).toHaveBeenCalledWith(
      expect.objectContaining({ declarationId: '' })
    );
  });

  it('a second walkTo while busy is ignored', () => {
    hoisted.moveFn.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        ''
      )
    );
    act(() => result.current.walkTo({ x: 1, y: -1, z: 0 }));
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);
    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);
  });

  it('a resolved Move sets movePath/moveSeq from the returned steps and jumps display position to the last step, staying busy', async () => {
    hoisted.moveFn.mockResolvedValue({
      steps: [
        { position: { x: 1, y: 0 }, seq: 5n },
        { position: { x: 2, y: -1 }, seq: 6n },
      ],
    });
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        ''
      )
    );

    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));

    await waitFor(() => expect(result.current.moveSeq).toBe(1));
    expect(result.current.movePath).toEqual([
      { x: 1, y: -1, z: 0 },
      { x: 2, y: -1, z: -1 },
    ]);
    expect(result.current.displayPosition).toEqual({ x: 2, y: -1, z: -1 });
    // Still busy — released only once onWalkAnimationComplete fires.
    expect(result.current.busy).toBe(true);
  });

  it('a walk with fewer returned steps than requested (stopped early) still animates and is not treated as an error', async () => {
    hoisted.moveFn.mockResolvedValue({
      steps: [{ position: { x: 1, y: 0 }, seq: 5n }],
    });
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        ''
      )
    );
    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));
    await waitFor(() => expect(result.current.moveSeq).toBe(1));
    expect(result.current.movePath).toEqual([{ x: 1, y: -1, z: 0 }]);
    expect(result.current.moveError).toBeNull();
  });

  it('a Move RPC that returns zero steps clears busy without animating', async () => {
    hoisted.moveFn.mockResolvedValue({ steps: [] });
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        ''
      )
    );
    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.moveSeq).toBeUndefined();
  });

  it('a Move RPC failure sets moveError and clears busy, no crash', async () => {
    hoisted.moveFn.mockRejectedValue(new Error('no doorway joins those cells'));
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        ''
      )
    );
    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.moveError).toBe('no doorway joins those cells');
  });

  it('routes every Move FailedPrecondition through stale-selector recovery without exposing raw wording', async () => {
    hoisted.moveFn.mockRejectedValue(
      new ConnectError('not your turn', Code.FailedPrecondition)
    );
    const onStaleDeclarationRefusal = vi.fn();
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        'v1.move',
        onStaleDeclarationRefusal
      )
    );
    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.moveError).toBeNull();
    expect(result.current.notYourTurn).toBe(true);
    expect(onStaleDeclarationRefusal).toHaveBeenCalledOnce();
    expect(onStaleDeclarationRefusal).toHaveBeenCalledWith('v1.move');
  });

  it('a plain (non-turn-lock) Move RPC failure leaves notYourTurn false', async () => {
    hoisted.moveFn.mockRejectedValue(new Error('no doorway joins those cells'));
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        ''
      )
    );
    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.notYourTurn).toBe(false);
  });

  it('notYourTurn clears at the start of the next walkTo, same as moveError', async () => {
    hoisted.moveFn.mockRejectedValueOnce(
      new ConnectError('not your turn', Code.FailedPrecondition)
    );
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        vi.fn(),
        ''
      )
    );
    act(() => result.current.walkTo({ x: 2, y: -1, z: -1 }));
    await waitFor(() => expect(result.current.notYourTurn).toBe(true));

    hoisted.moveFn.mockReturnValue(new Promise(() => {})); // never resolves
    act(() => result.current.walkTo({ x: 1, y: -1, z: 0 }));
    expect(result.current.notYourTurn).toBe(false);
  });

  it('onWalkAnimationComplete for the current moveSeq reconciles via refetchWhere and then clears busy', async () => {
    hoisted.moveFn.mockResolvedValue({
      steps: [{ position: { x: 1, y: 0 }, seq: 5n }],
    });
    let resolveRefetch: () => void = () => {};
    const refetchWhere = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefetch = resolve;
        })
    );
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        refetchWhere,
        ''
      )
    );
    act(() => result.current.walkTo({ x: 1, y: -1, z: 0 }));
    await waitFor(() => expect(result.current.moveSeq).toBe(1));

    act(() => result.current.onWalkAnimationComplete(1));
    expect(refetchWhere).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true); // still, until refetch resolves

    await act(async () => {
      resolveRefetch();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it('onWalkAnimationComplete for a stale/mismatched seq is ignored', () => {
    const refetchWhere = vi.fn();
    const { result } = renderHook(() =>
      useSessionWalk(
        'enc-1',
        'char-1',
        corridorIndex(),
        { x: 0, y: 0 } as never,
        refetchWhere
      )
    );
    act(() => result.current.onWalkAnimationComplete(999));
    expect(refetchWhere).not.toHaveBeenCalled();
  });

  it('tracks a fresh GetWhere position while idle (not mid-walk)', () => {
    const { result, rerender } = renderHook(
      ({ where }) =>
        useSessionWalk('enc-1', 'char-1', corridorIndex(), where, vi.fn()),
      { initialProps: { where: { x: 0, y: 0 } as never } }
    );
    expect(result.current.displayPosition).toEqual({ x: 0, y: -0, z: 0 });
    rerender({ where: { x: 1, y: 0 } as never });
    expect(result.current.displayPosition).toEqual({ x: 1, y: -1, z: 0 });
  });
});
