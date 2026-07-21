import type { UnequipItemResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated
const hoisted = vi.hoisted(() => ({
  unequipItemFn: vi.fn<() => Promise<UnequipItemResponse>>(),
}));

vi.mock('./client', () => ({
  characterV2Client: {
    unequipItem: hoisted.unequipItemFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useUnequipItem } from './useUnequipItem';

beforeEach(() => {
  hoisted.unequipItemFn.mockReset();
});

describe('useUnequipItem', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useUnequipItem());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls characterV2Client.unequipItem with correct request shape', async () => {
    const fakeResponse = {} as UnequipItemResponse;
    hoisted.unequipItemFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useUnequipItem());

    let response: UnequipItemResponse | undefined;
    await act(async () => {
      response = await result.current.unequipItem({
        characterId: 'char-aldric',
        slotKey: 'off_hand',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.unequipItemFn).toHaveBeenCalledOnce();
    expect(hoisted.unequipItemFn).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: 'char-aldric',
        slotKey: 'off_hand',
      })
    );
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: UnequipItemResponse) => void;
    const pendingRpc = new Promise<UnequipItemResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.unequipItemFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useUnequipItem());

    act(() => {
      void result.current.unequipItem({
        characterId: 'char-aldric',
        slotKey: 'off_hand',
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as UnequipItemResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('slot already empty');
    hoisted.unequipItemFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useUnequipItem());

    await act(async () => {
      await expect(
        result.current.unequipItem({
          characterId: 'char-aldric',
          slotKey: 'off_hand',
        })
      ).rejects.toThrow('slot already empty');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.unequipItemFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as UnequipItemResponse);

    const { result } = renderHook(() => useUnequipItem());

    await act(async () => {
      await expect(
        result.current.unequipItem({
          characterId: 'char-aldric',
          slotKey: 'off_hand',
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.unequipItem({
        characterId: 'char-aldric',
        slotKey: 'off_hand',
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
