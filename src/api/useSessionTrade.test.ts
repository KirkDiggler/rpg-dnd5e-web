import type { TradeResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { Money } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  tradeFn: vi.fn<() => Promise<TradeResponse>>(),
}));

// Test-only stand-in for a real Money message — none of these tests care
// about `$typeName`, only that `copper` reaches the request as sent.
function money(copper: number): Money {
  return { copper } as unknown as Money;
}

vi.mock('./client', () => ({
  sessionClient: {
    trade: hoisted.tradeFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionTrade } from './useSessionTrade';

beforeEach(() => {
  hoisted.tradeFn.mockReset();
});

describe('useSessionTrade', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionTrade());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sends an empty give and a one-item receive, defaulting range to 0', async () => {
    const fakeResponse = {
      descriptor: { targetId: 'demo-merchant-1', displayName: 'Demo Merchant' },
      seq: 1n,
    } as unknown as TradeResponse;
    hoisted.tradeFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionTrade());

    let response: TradeResponse | undefined;
    await act(async () => {
      response = await result.current.trade({
        session: 'session-1',
        actor: 'char-1',
        target: 'demo-merchant-1',
        equipmentType: 'weapon',
        equipmentId: 'longsword',
        quantity: 1,
        price: money(1500),
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.tradeFn).toHaveBeenCalledWith({
      session: 'session-1',
      actor: 'char-1',
      target: 'demo-merchant-1',
      range: 0,
      give: { items: [], currency: { copper: 1500 } },
      receive: {
        items: [
          { equipmentType: 'weapon', equipmentId: 'longsword', quantity: 1 },
        ],
      },
    });
  });

  it('passes an explicit range through unchanged', async () => {
    hoisted.tradeFn.mockResolvedValue({} as TradeResponse);
    const { result } = renderHook(() => useSessionTrade());

    await act(async () => {
      await result.current.trade({
        session: 'session-1',
        actor: 'char-1',
        target: 'demo-merchant-1',
        range: 3,
        equipmentType: 'ammunition',
        equipmentId: 'arrows',
        quantity: 20,
        price: money(100),
      });
    });

    expect(hoisted.tradeFn).toHaveBeenCalledWith({
      session: 'session-1',
      actor: 'char-1',
      target: 'demo-merchant-1',
      range: 3,
      give: { items: [], currency: { copper: 100 } },
      receive: {
        items: [
          { equipmentType: 'ammunition', equipmentId: 'arrows', quantity: 20 },
        ],
      },
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: TradeResponse) => void;
    const pendingRpc = new Promise<TradeResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.tradeFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionTrade());

    act(() => {
      void result.current.trade({
        session: 'session-1',
        actor: 'char-1',
        target: 'demo-merchant-1',
        equipmentType: 'weapon',
        equipmentId: 'longsword',
        quantity: 1,
        price: money(1500),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as TradeResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and the promise rejects', async () => {
    const rpcError = new Error('longsword: out of stock');
    hoisted.tradeFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionTrade());

    await act(async () => {
      await expect(
        result.current.trade({
          session: 'session-1',
          actor: 'char-1',
          target: 'demo-merchant-1',
          equipmentType: 'weapon',
          equipmentId: 'longsword',
          quantity: 1,
          price: money(1500),
        })
      ).rejects.toThrow('longsword: out of stock');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.tradeFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as TradeResponse);

    const { result } = renderHook(() => useSessionTrade());

    await act(async () => {
      await expect(
        result.current.trade({
          session: 'session-1',
          actor: 'char-1',
          target: 'demo-merchant-1',
          equipmentType: 'weapon',
          equipmentId: 'longsword',
          quantity: 1,
          price: money(1500),
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.trade({
        session: 'session-1',
        actor: 'char-1',
        target: 'demo-merchant-1',
        equipmentType: 'weapon',
        equipmentId: 'longsword',
        quantity: 1,
        price: money(1500),
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
