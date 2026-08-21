import type { GetWhereResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getWhereFn: vi.fn<() => Promise<GetWhereResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    getWhere: hoisted.getWhereFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionWhere } from './useSessionWhere';

beforeEach(() => {
  hoisted.getWhereFn.mockReset();
});

describe('useSessionWhere', () => {
  it('does not call GetWhere while session or member is empty', () => {
    const { result: noSession } = renderHook(() =>
      useSessionWhere('', 'char-1')
    );
    const { result: noMember } = renderHook(() => useSessionWhere('enc-1', ''));
    expect(hoisted.getWhereFn).not.toHaveBeenCalled();
    expect(noSession.current.loading).toBe(false);
    expect(noMember.current.loading).toBe(false);
    expect(noSession.current.position).toBeNull();
  });

  it('fetches GetWhere for the given session/member and stores the position', async () => {
    hoisted.getWhereFn.mockResolvedValue({
      position: { x: 2, y: -1 },
    } as unknown as GetWhereResponse);

    const { result } = renderHook(() => useSessionWhere('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(hoisted.getWhereFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
    });
    expect(result.current.position).toEqual({ x: 2, y: -1 });
    expect(result.current.error).toBeNull();
  });

  it('a response with no position resolves to null, not an error', async () => {
    hoisted.getWhereFn.mockResolvedValue({
      position: undefined,
    } as unknown as GetWhereResponse);

    const { result } = renderHook(() => useSessionWhere('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.position).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets error on RPC failure, loading=false, position stays null', async () => {
    const rpcError = new Error('transport error');
    hoisted.getWhereFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionWhere('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(rpcError);
    expect(result.current.position).toBeNull();
  });

  it('refetch re-calls GetWhere and can recover from a previous error', async () => {
    hoisted.getWhereFn
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce({
        position: { x: 0, y: 0 },
      } as unknown as GetWhereResponse);

    const { result } = renderHook(() => useSessionWhere('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();

    void result.current.refetch();

    await waitFor(() => expect(hoisted.getWhereFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.position).toEqual({ x: 0, y: 0 });
  });
});
