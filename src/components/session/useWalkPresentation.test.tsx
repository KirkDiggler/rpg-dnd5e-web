import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWalkPresentation } from './useWalkPresentation';

const walking = create(ActSchema, {
  session: 'session-a',
  id: 'walk-1',
  family: Family.ACT,
  body: {
    case: 'walk',
    value: {
      mover: { kind: PartyKind.MEMBER, id: 'guard' },
      path: [{ cell: { x: 1, y: 0 } }, { cell: { x: 2, y: 0 } }],
    },
  },
});

describe('walk presentation completion bridge', () => {
  const forgetRoute = vi.fn();
  beforeEach(() => vi.clearAllMocks());
  it('starts one route and accepts only its full, exact acknowledgement once', () => {
    const beginRoute = vi.fn(() => 41);
    const complete = vi.fn();
    const { result } = renderHook(() =>
      useWalkPresentation({
        session: 'session-a',
        member: 'viewer',
        liveSighted: new Set(['guard']),
        canPresent: true,
        beginRoute,
        forgetRoute,
      })
    );
    let unsubscribe = () => {};
    act(() => {
      unsubscribe = result.current.presentWalk({ act: walking, complete });
    });
    expect(beginRoute).toHaveBeenCalledOnce();
    expect(beginRoute).toHaveBeenCalledWith('guard', [
      { x: 1, y: -1, z: 0 },
      { x: 2, y: -2, z: 0 },
    ]);
    act(() => {
      result.current.movementPainted('other', 41, 2);
      result.current.movementPainted('guard', 40, 2);
      result.current.movementPainted('guard', 41, 1);
    });
    expect(complete).not.toHaveBeenCalled();
    act(() => result.current.movementPainted('guard', 41, 2));
    expect(complete).toHaveBeenCalledExactlyOnceWith('painted');
    act(() => {
      result.current.movementPainted('guard', 41, 2);
      unsubscribe();
    });
    expect(complete).toHaveBeenCalledOnce();
  });

  it('settles an unseen or unavailable body synchronously without banking a route', () => {
    const beginRoute = vi.fn(() => 1);
    const complete = vi.fn();
    const { result } = renderHook(() =>
      useWalkPresentation({
        session: 'session-a',
        member: 'viewer',
        liveSighted: new Set<string>(),
        canPresent: true,
        beginRoute,
        forgetRoute,
      })
    );
    act(() => result.current.presentWalk({ act: walking, complete }));
    expect(beginRoute).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledExactlyOnceWith('unavailable');
  });

  it('releases a pending wait when the actor leaves sight and never completes it twice', () => {
    const beginRoute = vi.fn(() => 5);
    const complete = vi.fn();
    const { result, rerender } = renderHook(
      ({ liveSighted }) =>
        useWalkPresentation({
          session: 'session-a',
          member: 'viewer',
          liveSighted,
          canPresent: true,
          beginRoute,
          forgetRoute,
        }),
      { initialProps: { liveSighted: new Set(['guard']) } }
    );
    act(() => result.current.presentWalk({ act: walking, complete }));
    expect(beginRoute).toHaveBeenCalledOnce();
    rerender({ liveSighted: new Set() });
    expect(complete).toHaveBeenCalledExactlyOnceWith('unavailable');
    expect(forgetRoute).toHaveBeenCalledExactlyOnceWith('guard', 5);
    act(() => result.current.movementPainted('guard', 5, 2));
    expect(complete).toHaveBeenCalledOnce();
    rerender({ liveSighted: new Set(['guard']) });
    expect(beginRoute).toHaveBeenCalledOnce();
  });

  it('cancels old-session waits and fences old callbacks when the viewer id is reused', () => {
    const beginRoute = vi.fn(() => 1);
    const complete = vi.fn();
    const { result, rerender } = renderHook(
      ({ session }) =>
        useWalkPresentation({
          session,
          member: 'viewer',
          liveSighted: new Set(['guard']),
          canPresent: true,
          beginRoute,
          forgetRoute,
        }),
      { initialProps: { session: 'session-a' } }
    );
    const oldPainted = result.current.movementPainted;
    act(() => result.current.presentWalk({ act: walking, complete }));
    rerender({ session: 'session-b' });
    expect(complete).toHaveBeenCalledExactlyOnceWith('cancelled');
    const nextComplete = vi.fn();
    act(() =>
      result.current.presentWalk({ act: walking, complete: nextComplete })
    );
    act(() => oldPainted('guard', 1, 2));
    expect(nextComplete).not.toHaveBeenCalled();
    act(() => result.current.movementPainted('guard', 1, 2));
    expect(nextComplete).toHaveBeenCalledExactlyOnceWith('painted');
  });

  it('unsubscribe detaches without advancing the cursor, while disappearance releases it', () => {
    const beginRoute = vi.fn(() => 1);
    const complete = vi.fn();
    const { result, rerender } = renderHook(
      ({ canPresent }) =>
        useWalkPresentation({
          session: 'session-a',
          member: 'viewer',
          liveSighted: new Set(['guard']),
          canPresent,
          beginRoute,
          forgetRoute,
        }),
      { initialProps: { canPresent: true } }
    );
    let unsubscribe = () => {};
    act(() => {
      unsubscribe = result.current.presentWalk({ act: walking, complete });
    });
    act(() => unsubscribe());
    act(() => result.current.movementPainted('guard', 1, 2));
    expect(complete).not.toHaveBeenCalled();
    act(() => result.current.presentWalk({ act: walking, complete }));
    rerender({ canPresent: false });
    expect(complete).toHaveBeenCalledExactlyOnceWith('unavailable');
  });
});
