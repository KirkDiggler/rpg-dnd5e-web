import type { GetRosterResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { MemberKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getRosterFn: vi.fn<() => Promise<GetRosterResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    getRoster: hoisted.getRosterFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionRoster } from './useSessionRoster';

function rosterResponse(): GetRosterResponse {
  return {
    members: [
      {
        id: 'char-alice',
        kind: MemberKind.PLAYER,
        name: 'Alice',
        classRef: 'fighter',
        raceRef: 'human',
        monsterRef: '',
      },
      {
        id: 'skeleton-1',
        kind: MemberKind.MONSTER,
        name: 'Skeleton',
        classRef: '',
        raceRef: '',
        monsterRef: 'dnd5e:monsters:skeleton',
      },
    ],
  } as GetRosterResponse;
}

beforeEach(() => {
  hoisted.getRosterFn.mockReset();
});

describe('useSessionRoster', () => {
  it('fetches ONCE on mount and keys the roster by member id — identity is load-once (rpg-project#264)', async () => {
    hoisted.getRosterFn.mockResolvedValue(rosterResponse());
    const { result } = renderHook(() => useSessionRoster('enc-1'));

    await waitFor(() => expect(result.current.roster.size).toBe(2));
    expect(hoisted.getRosterFn).toHaveBeenCalledTimes(1);
    expect(result.current.roster.get('char-alice')?.classRef).toBe('fighter');
    expect(result.current.roster.get('skeleton-1')?.monsterRef).toBe(
      'dnd5e:monsters:skeleton'
    );
  });

  it('does not fetch while session is empty, and refetch stays a no-op', async () => {
    const { result } = renderHook(() => useSessionRoster(''));
    await act(async () => {
      await result.current.refetch();
    });
    expect(hoisted.getRosterFn).not.toHaveBeenCalled();
    expect(result.current.roster.size).toBe(0);
  });

  it('a failed refetch keeps the last known roster — rendering degrades, never blanks mid-session', async () => {
    hoisted.getRosterFn.mockResolvedValueOnce(rosterResponse());
    const { result } = renderHook(() => useSessionRoster('enc-1'));
    await waitFor(() => expect(result.current.roster.size).toBe(2));

    hoisted.getRosterFn.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.roster.size).toBe(2);
  });

  it('the session going away clears roster and error — nothing outlives its session', async () => {
    hoisted.getRosterFn.mockResolvedValue(rosterResponse());
    const { result, rerender } = renderHook(
      ({ session }: { session: string }) => useSessionRoster(session),
      { initialProps: { session: 'enc-1' } }
    );
    await waitFor(() => expect(result.current.roster.size).toBe(2));

    rerender({ session: '' });
    expect(result.current.roster.size).toBe(0);
    expect(result.current.error).toBeNull();
  });
});
