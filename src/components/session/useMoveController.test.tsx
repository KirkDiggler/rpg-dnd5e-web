import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMoveController } from './useMoveController';

const route = [{ x: 1, y: -1, z: 0 }];

describe('useMoveController presentation identity', () => {
  it('allocates distinct route sequences synchronously within one React batch', () => {
    const { result } = renderHook(() =>
      useMoveController('session-a', 'viewer')
    );
    let first: number | undefined;
    let second: number | undefined;
    act(() => {
      first = result.current.beginRoute('guard', route);
      second = result.current.beginRoute('guard', route);
    });
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(result.current.movements.get('guard')?.seq).toBe(2);
  });

  it('discards only the exact unavailable route, not a newer replacement', () => {
    const { result } = renderHook(() =>
      useMoveController('session-a', 'viewer')
    );
    act(() => {
      result.current.beginRoute('guard', route);
      result.current.beginRoute('guard', route);
    });
    expect(result.current.forgetRoute).toBeTypeOf('function');
    act(() => result.current.forgetRoute('guard', 1));
    expect(result.current.movements.get('guard')?.seq).toBe(2);
    act(() => result.current.forgetRoute('guard', 2));
    expect(result.current.movements.has('guard')).toBe(false);
    act(() => {
      expect(result.current.beginRoute('guard', route)).toBe(3);
    });
  });

  it('clears routes on scope change and refuses old-scope callbacks', () => {
    const { result, rerender } = renderHook(
      ({ session }) => useMoveController(session, 'viewer'),
      {
        initialProps: { session: 'session-a' },
      }
    );
    const staleBegin = result.current.beginRoute;
    act(() => result.current.beginRoute('guard', route));
    rerender({ session: 'session-b' });
    expect(result.current.movements.size).toBe(0);
    act(() => {
      expect(staleBegin('guard', route)).toBeUndefined();
    });
    expect(result.current.movements.size).toBe(0);
    act(() => {
      expect(result.current.beginRoute('guard', route)).toBe(1);
    });
  });
});

describe('useMoveController continuing an answered walk (rpg-project#890)', () => {
  const a = { x: 1, y: -1, z: 0 };
  const b = { x: 2, y: -2, z: 0 };
  const c = { x: 3, y: -3, z: 0 };

  it('extends the answer journey with an own walk after through, once', () => {
    const { result } = renderHook(() =>
      useMoveController('session-a', 'viewer')
    );
    let started: { seq: number; length: number } | undefined;
    act(() => {
      result.current.moveAnswered('viewer', {
        route: [a, b],
        continues: true,
        through: '01J0000000B',
      });
      result.current.beginRoute('viewer', [a, b]);
      started = result.current.continueOwnWalk('viewer', {
        id: '01J0000000C',
        act: 'move:1',
        cells: [a, b, c],
      });
    });
    expect(started).toEqual({ seq: 2, length: 3 });
    expect(result.current.movements.get('viewer')).toEqual({
      route: [a, b, c],
      seq: 2,
      reached: 0,
      continuedFrom: 2,
    });
    act(() => {
      started = result.current.continueOwnWalk('viewer', {
        id: '01J0000000C',
        act: 'move:1',
        cells: [a, b, c],
      });
    });
    expect(started).toBeUndefined();
  });

  it('plays no own walk when the answer did not continue', () => {
    const { result } = renderHook(() =>
      useMoveController('session-a', 'viewer')
    );
    let started: { seq: number; length: number } | undefined;
    act(() => {
      result.current.moveAnswered('viewer', {
        route: [a, b],
        continues: false,
        through: '',
      });
      result.current.beginRoute('viewer', [a, b]);
      started = result.current.continueOwnWalk('viewer', {
        id: '01J0000000C',
        act: 'move:1',
        cells: [a, b, c],
      });
    });
    expect(started).toBeUndefined();
    expect(result.current.movements.get('viewer')?.route).toEqual([a, b]);
  });
});
