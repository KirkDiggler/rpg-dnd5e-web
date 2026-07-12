import type {
  ActionTarget,
  TakeActionResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated
const hoisted = vi.hoisted(() => ({
  takeActionFn: vi.fn<() => Promise<TakeActionResponse>>(),
}));

vi.mock('./client', () => ({
  encounterClient: {
    takeAction: hoisted.takeActionFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useTakeAction } from './useTakeAction';

beforeEach(() => {
  hoisted.takeActionFn.mockReset();
});

const ATTACK_REF = { module: 'dnd5e', type: 'action', id: 'attack' } as const;

const ENTITY_TARGET: ActionTarget = {
  kind: { case: 'entityId', value: 'goblin-1' },
} as unknown as ActionTarget;

describe('useTakeAction', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useTakeAction());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls encounterClient.takeAction with correct request shape', async () => {
    const fakeResponse = {} as TakeActionResponse;
    hoisted.takeActionFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useTakeAction());

    let response: TakeActionResponse | undefined;
    await act(async () => {
      response = await result.current.takeAction({
        encounterId: 'enc-1',
        actorEntityId: 'char-alice',
        actionRef: ATTACK_REF,
        target: ENTITY_TARGET,
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.takeActionFn).toHaveBeenCalledOnce();

    expect(hoisted.takeActionFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        actorEntityId: 'char-alice',
        actionRef: expect.objectContaining({
          module: 'dnd5e',
          type: 'action',
          id: 'attack',
        }),
        target: expect.objectContaining({
          kind: expect.objectContaining({
            case: 'entityId',
            value: 'goblin-1',
          }),
        }),
      })
    );
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: TakeActionResponse) => void;
    const pendingRpc = new Promise<TakeActionResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.takeActionFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useTakeAction());

    // Kick off the takeAction without awaiting
    act(() => {
      void result.current.takeAction({
        encounterId: 'enc-1',
        actorEntityId: 'char-alice',
        actionRef: ATTACK_REF,
        target: ENTITY_TARGET,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    // Resolve the RPC
    act(() => resolveRpc({} as TakeActionResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('not your turn');
    hoisted.takeActionFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useTakeAction());

    await act(async () => {
      await expect(
        result.current.takeAction({
          encounterId: 'enc-1',
          actorEntityId: 'char-alice',
          actionRef: ATTACK_REF,
          target: ENTITY_TARGET,
        })
      ).rejects.toThrow('not your turn');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.takeActionFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as TakeActionResponse);

    const { result } = renderHook(() => useTakeAction());

    // First call fails
    await act(async () => {
      await expect(
        result.current.takeAction({
          encounterId: 'enc-1',
          actorEntityId: 'char-alice',
          actionRef: ATTACK_REF,
          target: ENTITY_TARGET,
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    // Second call succeeds
    await act(async () => {
      await result.current.takeAction({
        encounterId: 'enc-1',
        actorEntityId: 'char-alice',
        actionRef: ATTACK_REF,
        target: ENTITY_TARGET,
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
