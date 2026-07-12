import type { SubmitCheckResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated. The
// concrete signature is intentionally permissive (req: unknown) so the
// mock.calls tuple types preserve the request object index — Vitest's
// mock-calls tuple is derived from the fn's parameter list.
type SubmitCheckFn = (req: unknown) => Promise<SubmitCheckResponse>;
const hoisted = vi.hoisted(() => ({
  submitCheckFn: vi.fn<SubmitCheckFn>(),
}));

vi.mock('./client', () => ({
  encounterClient: {
    submitCheck: hoisted.submitCheckFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSubmitCheck } from './useSubmitCheck';

beforeEach(() => {
  hoisted.submitCheckFn.mockReset();
});

describe('useSubmitCheck', () => {
  it('starts with loading=false, no error, and null lastResponse', () => {
    const { result } = renderHook(() => useSubmitCheck());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastResponse).toBeNull();
  });

  it('calls encounterClient.submitCheck with correct request shape', async () => {
    const fakeResponse: SubmitCheckResponse = {
      success: true,
      total: 18,
    } as SubmitCheckResponse;
    hoisted.submitCheckFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSubmitCheck());

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

    const { result } = renderHook(() => useSubmitCheck());

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

    const { result } = renderHook(() => useSubmitCheck());

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

    const { result } = renderHook(() => useSubmitCheck());

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

  // Wave 2.11d: take_reaction is the reaction-prompt response variant.
  it('passes takeReaction through to the request when set (Wave 2.11d)', async () => {
    const fakeResponse: SubmitCheckResponse = {
      success: true,
      total: 1, // server returns 1 = took, 0 = skipped for reaction responses
    } as SubmitCheckResponse;
    hoisted.submitCheckFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSubmitCheck());

    await act(async () => {
      await result.current.submitCheck({
        encounterId: 'enc-1',
        entityId: 'char-wendy',
        roll: 0, // ignored for reaction prompts
        takeReaction: true,
      });
    });

    expect(hoisted.submitCheckFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        entityId: 'char-wendy',
        roll: 0,
        takeReaction: true,
      })
    );
  });

  it('passes takeReaction=false for skip (Wave 2.11d)', async () => {
    const fakeResponse: SubmitCheckResponse = {
      success: true,
      total: 0,
    } as SubmitCheckResponse;
    hoisted.submitCheckFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSubmitCheck());

    await act(async () => {
      await result.current.submitCheck({
        encounterId: 'enc-1',
        entityId: 'char-wendy',
        roll: 0,
        takeReaction: false,
      });
    });

    expect(hoisted.submitCheckFn).toHaveBeenCalledWith(
      expect.objectContaining({
        takeReaction: false,
      })
    );
  });

  it('omits takeReaction when not set (skill-check path unchanged)', async () => {
    const fakeResponse: SubmitCheckResponse = {
      success: true,
      total: 15,
    } as SubmitCheckResponse;
    hoisted.submitCheckFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSubmitCheck());

    await act(async () => {
      await result.current.submitCheck({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        roll: 12,
      });
    });

    // The mock receives the materialized proto message — takeReaction should
    // be undefined (proto-optional unset) when the caller didn't pass it.
    const call = hoisted.submitCheckFn.mock.calls[0]?.[0] as
      | { takeReaction?: boolean }
      | undefined;
    expect(call?.takeReaction).toBeUndefined();
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.submitCheckFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({ success: true, total: 18 } as SubmitCheckResponse);

    const { result } = renderHook(() => useSubmitCheck());

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
