import type { MoveEntityResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated
const hoisted = vi.hoisted(() => ({
  moveEntityFn: vi.fn<() => Promise<MoveEntityResponse>>(),
}));

vi.mock('./client', () => ({
  encounterClientV2: {
    moveEntity: hoisted.moveEntityFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useMoveEntityV2 } from './useMoveEntityV2';

beforeEach(() => {
  hoisted.moveEntityFn.mockReset();
});

describe('useMoveEntityV2', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useMoveEntityV2());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls encounterClientV2.moveEntity with correct request shape', async () => {
    const fakeResponse = {} as MoveEntityResponse;
    hoisted.moveEntityFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useMoveEntityV2());

    let response: MoveEntityResponse | undefined;
    await act(async () => {
      response = await result.current.moveEntity('enc-1', 'char-alice', [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
        { x: 2, y: -2, z: 0 },
      ]);
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.moveEntityFn).toHaveBeenCalledOnce();

    expect(hoisted.moveEntityFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        proposedPath: [
          expect.objectContaining({ x: 0, y: 0, z: 0 }),
          expect.objectContaining({ x: 1, y: -1, z: 0 }),
          expect.objectContaining({ x: 2, y: -2, z: 0 }),
        ],
      })
    );
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: MoveEntityResponse) => void;
    const pendingRpc = new Promise<MoveEntityResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.moveEntityFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useMoveEntityV2());

    // Kick off the move without awaiting
    act(() => {
      void result.current.moveEntity('enc-1', 'char-alice', []);
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    // Resolve the RPC
    act(() => resolveRpc({} as MoveEntityResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('transport error');
    hoisted.moveEntityFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useMoveEntityV2());

    await act(async () => {
      await expect(
        result.current.moveEntity('enc-1', 'char-alice', [])
      ).rejects.toThrow('transport error');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.moveEntityFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as MoveEntityResponse);

    const { result } = renderHook(() => useMoveEntityV2());

    // First call fails
    await act(async () => {
      await expect(
        result.current.moveEntity('enc-1', 'char-alice', [])
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    // Second call succeeds
    await act(async () => {
      await result.current.moveEntity('enc-1', 'char-alice', []);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
