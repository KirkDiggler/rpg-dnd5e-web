import type {
  DungeonSummary,
  ListDungeonsResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  listDungeonsFn: vi.fn<() => Promise<ListDungeonsResponse>>(),
}));

vi.mock('./client', () => ({
  lobbyClient: {
    listDungeons: hoisted.listDungeonsFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useListDungeons } from './useListDungeons';

beforeEach(() => {
  hoisted.listDungeonsFn.mockReset();
});

describe('useListDungeons', () => {
  it('calls ListDungeons on mount with no request fields', async () => {
    hoisted.listDungeonsFn.mockResolvedValue({
      dungeons: [] as DungeonSummary[],
    } as ListDungeonsResponse);

    renderHook(() => useListDungeons());

    await waitFor(() => expect(hoisted.listDungeonsFn).toHaveBeenCalledOnce());
    expect(hoisted.listDungeonsFn).toHaveBeenCalledWith(
      expect.objectContaining({})
    );
  });

  it('loading is true on the very first render, before the RPC resolves', () => {
    hoisted.listDungeonsFn.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useListDungeons());

    expect(result.current.loading).toBe(true);
  });

  it('populates dungeons with the returned key/name summaries', async () => {
    hoisted.listDungeonsFn.mockResolvedValue({
      dungeons: [
        { key: 'reference-tomb', name: 'The Reference Tomb' },
        { key: 'smoke-test', name: 'Smoke Test' },
      ],
    } as ListDungeonsResponse);

    const { result } = renderHook(() => useListDungeons());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dungeons).toEqual([
      { key: 'reference-tomb', name: 'The Reference Tomb' },
      { key: 'smoke-test', name: 'Smoke Test' },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('sets error on RPC failure, loading=false, dungeons stays empty', async () => {
    const rpcError = new Error('transport error');
    hoisted.listDungeonsFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useListDungeons());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(rpcError);
    expect(result.current.dungeons).toEqual([]);
  });

  it('refetch re-calls ListDungeons and can recover from a previous error', async () => {
    hoisted.listDungeonsFn
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce({
        dungeons: [{ key: 'reference-tomb', name: 'The Reference Tomb' }],
      } as ListDungeonsResponse);

    const { result } = renderHook(() => useListDungeons());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();

    void result.current.refetch();

    await waitFor(() =>
      expect(hoisted.listDungeonsFn).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.dungeons).toEqual([
      { key: 'reference-tomb', name: 'The Reference Tomb' },
    ]);
  });
});
