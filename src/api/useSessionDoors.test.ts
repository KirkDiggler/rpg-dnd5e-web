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
        lock: { dc: 12, ability: 'dex', tool: '' },
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
    const { result } = renderHook(() => useSessionDoors('enc-1'));

    await waitFor(() => expect(result.current.doors.size).toBe(2));
    expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(1);
    expect(result.current.doors.get('entrance-hall')?.state).toBe(
      DoorState.OPEN
    );
    expect(result.current.doors.get('hall-tomb')?.lock?.dc).toBe(12);
  });

  it('does not fetch while session is empty, and refetch stays a no-op', async () => {
    const { result } = renderHook(() => useSessionDoors(''));
    await act(async () => {
      await result.current.refetch();
    });
    expect(hoisted.getDoorsFn).not.toHaveBeenCalled();
    expect(result.current.doors.size).toBe(0);
  });

  it('refetch pulls the fresh state — a beaten lock arrives OPEN', async () => {
    hoisted.getDoorsFn.mockResolvedValue(doorsResponse());
    const { result } = renderHook(() => useSessionDoors('enc-1'));
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
    const { result } = renderHook(() => useSessionDoors('enc-1'));
    await waitFor(() => expect(result.current.doors.size).toBe(2));

    hoisted.getDoorsFn.mockRejectedValue(new Error('network down'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.doors.size).toBe(2);
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
