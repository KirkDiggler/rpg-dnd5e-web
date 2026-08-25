import type { AttackResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  attackFn: vi.fn<() => Promise<AttackResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    attack: hoisted.attackFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionAttack } from './useSessionAttack';

beforeEach(() => {
  hoisted.attackFn.mockReset();
});

describe('useSessionAttack', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionAttack());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('echoes the exact opaque declaration id with session/attacker/target', async () => {
    const fakeResponse = {
      roll: 17,
      total: 20,
      against: 13,
      hit: true,
      critical: false,
      damage: 6,
      seq: 1n,
    } as unknown as AttackResponse;
    hoisted.attackFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionAttack());

    let response: AttackResponse | undefined;
    await act(async () => {
      response = await result.current.attack({
        session: 'enc-1',
        attacker: 'char-1',
        target: 'skeleton-1',
        declarationId: 'v1.selector',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.attackFn).toHaveBeenCalledOnce();
    expect(hoisted.attackFn).toHaveBeenCalledWith({
      session: 'enc-1',
      attacker: 'char-1',
      target: 'skeleton-1',
      declarationId: 'v1.selector',
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: AttackResponse) => void;
    const pendingRpc = new Promise<AttackResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.attackFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionAttack());

    act(() => {
      void result.current.attack({
        session: 'enc-1',
        attacker: 'char-1',
        target: 'skeleton-1',
        declarationId: 'v1.selector',
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as AttackResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and the promise rejects', async () => {
    const rpcError = new Error('nothing equipped in "main_hand"');
    hoisted.attackFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionAttack());

    await act(async () => {
      await expect(
        result.current.attack({
          session: 'enc-1',
          attacker: 'char-1',
          target: 'skeleton-1',
          declarationId: 'v1.selector',
        })
      ).rejects.toThrow('nothing equipped in "main_hand"');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.attackFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as AttackResponse);

    const { result } = renderHook(() => useSessionAttack());

    await act(async () => {
      await expect(
        result.current.attack({
          session: 'enc-1',
          attacker: 'char-1',
          target: 'skeleton-1',
          declarationId: 'v1.selector',
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.attack({
        session: 'enc-1',
        attacker: 'char-1',
        target: 'skeleton-1',
        declarationId: 'v1.selector',
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
