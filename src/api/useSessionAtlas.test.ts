import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAtlasFn: vi.fn<() => Promise<GetAtlasResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    getAtlas: hoisted.getAtlasFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionAtlas } from './useSessionAtlas';

beforeEach(() => {
  hoisted.getAtlasFn.mockReset();
});

describe('useSessionAtlas', () => {
  it('does not call GetAtlas while session is empty, and clears loading', () => {
    const { result } = renderHook(() => useSessionAtlas(''));
    expect(hoisted.getAtlasFn).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.atlas).toBeNull();
  });

  it('loading is true on the very first render once a session id is known', () => {
    hoisted.getAtlasFn.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useSessionAtlas('enc-1'));
    expect(result.current.loading).toBe(true);
  });

  it('fetches GetAtlas for the given session and stores the response', async () => {
    const atlas = { cells: [{ x: 0, y: 0 }] } as unknown as GetAtlasResponse;
    hoisted.getAtlasFn.mockResolvedValue(atlas);

    const { result } = renderHook(() => useSessionAtlas('enc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(hoisted.getAtlasFn).toHaveBeenCalledWith({ session: 'enc-1' });
    expect(result.current.atlas).toBe(atlas);
    expect(result.current.error).toBeNull();
  });

  it('sets error on RPC failure, loading=false, atlas stays null', async () => {
    const rpcError = new Error('transport error');
    hoisted.getAtlasFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionAtlas('enc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(rpcError);
    expect(result.current.atlas).toBeNull();
  });

  it('re-fetches when the session id changes', async () => {
    hoisted.getAtlasFn.mockResolvedValue({
      cells: [],
    } as unknown as GetAtlasResponse);

    const { rerender } = renderHook(({ id }) => useSessionAtlas(id), {
      initialProps: { id: 'enc-1' },
    });
    await waitFor(() =>
      expect(hoisted.getAtlasFn).toHaveBeenCalledWith({ session: 'enc-1' })
    );

    rerender({ id: 'enc-2' });
    await waitFor(() =>
      expect(hoisted.getAtlasFn).toHaveBeenCalledWith({ session: 'enc-2' })
    );
    expect(hoisted.getAtlasFn).toHaveBeenCalledTimes(2);
  });

  it('refetch re-calls GetAtlas and can recover from a previous error', async () => {
    hoisted.getAtlasFn
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce({ cells: [] } as unknown as GetAtlasResponse);

    const { result } = renderHook(() => useSessionAtlas('enc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();

    void result.current.refetch();

    await waitFor(() => expect(hoisted.getAtlasFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
