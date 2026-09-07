import type { LootResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  lootFn: vi.fn<() => Promise<LootResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: { loot: hoisted.lootFn },
}));

import { useSessionLoot } from './useSessionLoot';

beforeEach(() => {
  hoisted.lootFn.mockReset();
});

describe('useSessionLoot', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useSessionLoot());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('echoes session/member/target exactly, choosing no target of its own', async () => {
    hoisted.lootFn.mockResolvedValue({} as LootResponse);
    const { result } = renderHook(() => useSessionLoot());
    await act(async () => {
      await result.current.loot({
        session: 'enc-1',
        member: 'char-1',
        target: 'skeleton-captain-1',
      });
    });
    expect(hoisted.lootFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      target: 'skeleton-captain-1',
    });
  });

  it('passes a range through when the caller was given one', async () => {
    hoisted.lootFn.mockResolvedValue({} as LootResponse);
    const { result } = renderHook(() => useSessionLoot());
    await act(async () => {
      await result.current.loot({
        session: 'enc-1',
        member: 'char-1',
        target: 'body',
        range: 2,
      });
    });
    expect(hoisted.lootFn).toHaveBeenCalledWith(
      expect.objectContaining({ range: 2 })
    );
  });

  it('is loading while in flight and clear after', async () => {
    let settle!: (v: LootResponse) => void;
    hoisted.lootFn.mockReturnValue(
      new Promise<LootResponse>((resolve) => (settle = resolve))
    );
    const { result } = renderHook(() => useSessionLoot());
    act(() => {
      void result.current.loot({ session: 's', member: 'm', target: 't' });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    act(() => settle({} as LootResponse));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets the error and rejects on failure, then clears it on the next success', async () => {
    const refusal = new Error('that member is not down');
    hoisted.lootFn
      .mockRejectedValueOnce(refusal)
      .mockResolvedValue({} as LootResponse);
    const { result } = renderHook(() => useSessionLoot());
    await act(async () => {
      await expect(
        result.current.loot({ session: 's', member: 'm', target: 't' })
      ).rejects.toThrow('that member is not down');
    });
    expect(result.current.error).toBe(refusal);
    await act(async () => {
      await result.current.loot({ session: 's', member: 'm', target: 't' });
    });
    expect(result.current.error).toBeNull();
  });

  it('reads NOTHING out of the answer — an empty body and the captain settle identically', async () => {
    // Design P3 at the hook level: LootResponse carries no found flag and
    // no transferred list, so there is no branch here that could read one.
    // Two structurally different answers must be handled the same way.
    const bare = { saved: undefined, delivery: undefined } as LootResponse;
    const full = {
      saved: { ok: true },
      delivery: { ok: true },
    } as unknown as LootResponse;
    for (const answer of [bare, full]) {
      hoisted.lootFn.mockResolvedValueOnce(answer);
      const { result } = renderHook(() => useSessionLoot());
      let got: LootResponse | undefined;
      await act(async () => {
        got = await result.current.loot({
          session: 's',
          member: 'm',
          target: 't',
        });
      });
      expect(got).toBe(answer);
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    }
  });
});
