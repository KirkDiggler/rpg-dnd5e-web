import type { GetDoorsResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getDoorsFn: vi.fn<() => Promise<GetDoorsResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    getDoors: hoisted.getDoorsFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionDoors } from './useSessionDoors';

function doorsResponse(): GetDoorsResponse {
  return {
    doors: [
      { door: 'entrance-hall', state: DoorState.OPEN },
      {
        door: 'hall-tomb',
        state: DoorState.LOCKED,
        lock: { approaches: [{ ability: 'dex', tool: '', dc: 12 }] },
      },
    ],
  } as GetDoorsResponse;
}

beforeEach(() => {
  hoisted.getDoorsFn.mockReset();
});

describe('useSessionDoors', () => {
  it('fetches once on mount and keys the doors by id — the live half of the atlas doorways (rpg-project#268)', async () => {
    hoisted.getDoorsFn.mockResolvedValue(doorsResponse());
    const { result } = renderHook(() => useSessionDoors('enc-1', 'char-1'));

    await waitFor(() => expect(result.current.doors.size).toBe(2));
    expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(1);
    expect(result.current.doors.get('entrance-hall')?.state).toBe(
      DoorState.OPEN
    );
    expect(result.current.doors.get('hall-tomb')?.lock?.approaches[0]?.dc).toBe(
      12
    );
  });

  it('passes member — GetDoorsRequest.member is required and bound to the caller (rpg-project#350/#351)', async () => {
    hoisted.getDoorsFn.mockResolvedValue(doorsResponse());
    renderHook(() => useSessionDoors('enc-1', 'char-1'));
    await waitFor(() =>
      expect(hoisted.getDoorsFn).toHaveBeenCalledWith({
        session: 'enc-1',
        member: 'char-1',
      })
    );
  });

  it('does not fetch while session or member is empty, and refetch stays a no-op', async () => {
    const noSession = renderHook(() => useSessionDoors('', 'char-1'));
    await act(async () => {
      await noSession.result.current.refetch();
    });
    expect(hoisted.getDoorsFn).not.toHaveBeenCalled();
    expect(noSession.result.current.doors.size).toBe(0);

    const noMember = renderHook(() => useSessionDoors('enc-1', ''));
    await act(async () => {
      await noMember.result.current.refetch();
    });
    expect(hoisted.getDoorsFn).not.toHaveBeenCalled();
    expect(noMember.result.current.doors.size).toBe(0);
  });

  it('refetch pulls the fresh state — a beaten lock arrives OPEN', async () => {
    hoisted.getDoorsFn.mockResolvedValue(doorsResponse());
    const { result } = renderHook(() => useSessionDoors('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.doors.size).toBe(2));

    hoisted.getDoorsFn.mockResolvedValue({
      doors: [
        { door: 'entrance-hall', state: DoorState.OPEN },
        { door: 'hall-tomb', state: DoorState.OPEN },
      ],
    } as GetDoorsResponse);
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.doors.get('hall-tomb')?.state).toBe(DoorState.OPEN);
    expect(result.current.doors.get('hall-tomb')?.lock).toBeUndefined();
  });

  it('a failed refetch KEEPS the last-known doors — a door drawn in its last state beats a stateless gap', async () => {
    hoisted.getDoorsFn.mockResolvedValue(doorsResponse());
    const { result } = renderHook(() => useSessionDoors('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.doors.size).toBe(2));

    hoisted.getDoorsFn.mockRejectedValue(new Error('network down'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.doors.size).toBe(2);
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
