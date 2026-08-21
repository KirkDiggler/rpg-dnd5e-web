import type { GetViewResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getViewFn: vi.fn<() => Promise<GetViewResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    getView: hoisted.getViewFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionView } from './useSessionView';

beforeEach(() => {
  hoisted.getViewFn.mockReset();
});

describe('useSessionView', () => {
  it('does not call GetView while session or member is empty', () => {
    const { result: noSession } = renderHook(() =>
      useSessionView('', 'char-1')
    );
    const { result: noMember } = renderHook(() => useSessionView('enc-1', ''));
    expect(hoisted.getViewFn).not.toHaveBeenCalled();
    expect(noSession.current.loading).toBe(false);
    expect(noMember.current.loading).toBe(false);
    expect(noSession.current.sightings).toEqual([]);
  });

  it('fetches GetView for the given session/member and stores the sightings', async () => {
    hoisted.getViewFn.mockResolvedValue({
      sightings: [{ subject: 'skeleton-1' }],
    } as unknown as GetViewResponse);

    const { result } = renderHook(() => useSessionView('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(hoisted.getViewFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
    });
    expect(result.current.sightings).toEqual([{ subject: 'skeleton-1' }]);
    expect(result.current.error).toBeNull();
  });

  it('a response with no sightings resolves to an empty array, not an error', async () => {
    hoisted.getViewFn.mockResolvedValue({
      sightings: [],
    } as unknown as GetViewResponse);

    const { result } = renderHook(() => useSessionView('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sightings).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sets error on RPC failure, loading=false, sightings clears to empty', async () => {
    const rpcError = new Error('transport error');
    hoisted.getViewFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionView('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(rpcError);
    expect(result.current.sightings).toEqual([]);
  });

  it('clears a previous error when session/member becomes empty', async () => {
    hoisted.getViewFn.mockRejectedValue(new Error('transport error'));
    const { result, rerender } = renderHook(
      ({ session, member }) => useSessionView(session, member),
      { initialProps: { session: 'enc-1', member: 'char-1' } }
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());

    rerender({ session: 'enc-1', member: '' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('refetch re-calls GetView and can recover from a previous error', async () => {
    hoisted.getViewFn
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce({
        sightings: [{ subject: 'skeleton-1' }],
      } as unknown as GetViewResponse);

    const { result } = renderHook(() => useSessionView('enc-1', 'char-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();

    void result.current.refetch();

    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.sightings).toEqual([{ subject: 'skeleton-1' }]);
  });
});
