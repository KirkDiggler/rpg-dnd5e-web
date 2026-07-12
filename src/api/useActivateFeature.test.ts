import type { ActivateFeatureResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these before imports are evaluated
const hoisted = vi.hoisted(() => ({
  activateFeatureFn: vi.fn<() => Promise<ActivateFeatureResponse>>(),
}));

vi.mock('./client', () => ({
  encounterClient: {
    activateFeature: hoisted.activateFeatureFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useActivateFeature } from './useActivateFeature';

beforeEach(() => {
  hoisted.activateFeatureFn.mockReset();
});

const RAGE_REF = {
  module: 'dnd5e',
  type: 'features',
  id: 'rage',
} as const;

describe('useActivateFeature', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useActivateFeature());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls encounterClient.activateFeature with correct request shape', async () => {
    const fakeResponse = {} as ActivateFeatureResponse;
    hoisted.activateFeatureFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useActivateFeature());

    let response: ActivateFeatureResponse | undefined;
    await act(async () => {
      response = await result.current.activateFeature({
        encounterId: 'enc-1',
        characterId: 'char-bob',
        featureRef: RAGE_REF,
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.activateFeatureFn).toHaveBeenCalledOnce();

    expect(hoisted.activateFeatureFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        characterId: 'char-bob',
        featureRef: expect.objectContaining({
          module: 'dnd5e',
          type: 'features',
          id: 'rage',
        }),
      })
    );
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: ActivateFeatureResponse) => void;
    const pendingRpc = new Promise<ActivateFeatureResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.activateFeatureFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useActivateFeature());

    act(() => {
      void result.current.activateFeature({
        encounterId: 'enc-1',
        characterId: 'char-bob',
        featureRef: RAGE_REF,
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as ActivateFeatureResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and promise rejects', async () => {
    const rpcError = new Error('not enough rage charges');
    hoisted.activateFeatureFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useActivateFeature());

    await act(async () => {
      await expect(
        result.current.activateFeature({
          encounterId: 'enc-1',
          characterId: 'char-bob',
          featureRef: RAGE_REF,
        })
      ).rejects.toThrow('not enough rage charges');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on subsequent successful call', async () => {
    hoisted.activateFeatureFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as ActivateFeatureResponse);

    const { result } = renderHook(() => useActivateFeature());

    // First call fails
    await act(async () => {
      await expect(
        result.current.activateFeature({
          encounterId: 'enc-1',
          characterId: 'char-bob',
          featureRef: RAGE_REF,
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    // Second call succeeds
    await act(async () => {
      await result.current.activateFeature({
        encounterId: 'enc-1',
        characterId: 'char-bob',
        featureRef: RAGE_REF,
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
