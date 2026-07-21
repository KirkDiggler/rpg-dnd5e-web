import type { EquipItemResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated
const hoisted = vi.hoisted(() => ({
  equipItemFn: vi.fn<() => Promise<EquipItemResponse>>(),
}));

vi.mock('./client', () => ({
  characterV2Client: {
    equipItem: hoisted.equipItemFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useEquipItem } from './useEquipItem';

beforeEach(() => {
  hoisted.equipItemFn.mockReset();
});

const GREATSWORD_REF = { module: 'dnd5e', type: 'item', id: 'greatsword' };

describe('useEquipItem', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useEquipItem());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls characterV2Client.equipItem with correct request shape', async () => {
    const fakeResponse = {} as EquipItemResponse;
    hoisted.equipItemFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useEquipItem());

    let response: EquipItemResponse | undefined;
    await act(async () => {
      response = await result.current.equipItem({
        characterId: 'char-aldric',
        item: GREATSWORD_REF,
        slotKey: 'main_hand',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.equipItemFn).toHaveBeenCalledOnce();
    expect(hoisted.equipItemFn).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: 'char-aldric',
        item: expect.objectContaining(GREATSWORD_REF),
        slotKey: 'main_hand',
      })
    );
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: EquipItemResponse) => void;
    const pendingRpc = new Promise<EquipItemResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.equipItemFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useEquipItem());

    act(() => {
      void result.current.equipItem({
        characterId: 'char-aldric',
        item: GREATSWORD_REF,
        slotKey: 'main_hand',
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as EquipItemResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('item not in inventory');
    hoisted.equipItemFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useEquipItem());

    await act(async () => {
      await expect(
        result.current.equipItem({
          characterId: 'char-aldric',
          item: GREATSWORD_REF,
          slotKey: 'main_hand',
        })
      ).rejects.toThrow('item not in inventory');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.equipItemFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as EquipItemResponse);

    const { result } = renderHook(() => useEquipItem());

    await act(async () => {
      await expect(
        result.current.equipItem({
          characterId: 'char-aldric',
          item: GREATSWORD_REF,
          slotKey: 'main_hand',
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.equipItem({
        characterId: 'char-aldric',
        item: GREATSWORD_REF,
        slotKey: 'main_hand',
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
