import type { SubmitCheckResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated
const hoisted = vi.hoisted(() => ({
  submitCheckFn: vi.fn<() => Promise<SubmitCheckResponse>>(),
}));

vi.mock('./client', () => ({
  encounterClientV2: {
    submitCheck: hoisted.submitCheckFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSubmitCheckV2 } from './useSubmitCheckV2';

beforeEach(() => {
  hoisted.submitCheckFn.mockReset();
});

describe('useSubmitCheckV2', () => {
  it('starts with loading=false, no error, and null lastResponse', () => {
    const { result } = renderHook(() => useSubmitCheckV2());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastResponse).toBeNull();
  });

  it('calls encounterClientV2.submitCheck with correct request shape', async () => {
    const fakeResponse: SubmitCheckResponse = {
      success: true,
      total: 18,
    } as SubmitCheckResponse;
    hoisted.submitCheckFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSubmitCheckV2());

    let response: SubmitCheckResponse | undefined;
    await act(async () => {
      response = await result.current.submitCheck({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        roll: 15,
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.submitCheckFn).toHaveBeenCalledOnce();

    expect(hoisted.submitCheckFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        roll: 15,
      })
    );
  });

  it('sets lastResponse on success', async () => {
    const fakeResponse: SubmitCheckResponse = {
      success: false,
      total: 8,
    } as SubmitCheckResponse;
    hoisted.submitCheckFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSubmitCheckV2());

    await act(async () => {
      await result.current.submitCheck({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        roll: 5,
      });
    });

    expect(result.current.lastResponse).toBe(fakeResponse);
    expect(result.current.lastResponse?.success).toBe(false);
    expect(result.current.lastResponse?.total).toBe(8);
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: SubmitCheckResponse) => void;
    const pendingRpc = new Promise<SubmitCheckResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.submitCheckFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSubmitCheckV2());

    // Kick off submitCheck without awaiting
    act(() => {
      void result.current.submitCheck({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        roll: 12,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    // Resolve the RPC
    act(() => resolveRpc({ success: true, total: 15 } as SubmitCheckResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('no pending prompt');
    hoisted.submitCheckFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSubmitCheckV2());

    await act(async () => {
      await expect(
        result.current.submitCheck({
          encounterId: 'enc-1',
          entityId: 'char-alice',
          roll: 10,
        })
      ).rejects.toThrow('no pending prompt');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
    // lastResponse unchanged on failure
    expect(result.current.lastResponse).toBeNull();
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.submitCheckFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({ success: true, total: 18 } as SubmitCheckResponse);

    const { result } = renderHook(() => useSubmitCheckV2());

    // First call fails
    await act(async () => {
      await expect(
        result.current.submitCheck({
          encounterId: 'enc-1',
          entityId: 'char-alice',
          roll: 10,
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    // Second call succeeds
    await act(async () => {
      await result.current.submitCheck({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        roll: 15,
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.lastResponse).not.toBeNull();
  });
});
