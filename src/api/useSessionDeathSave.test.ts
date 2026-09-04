import type { DeathSaveResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  deathSaveFn: vi.fn<() => Promise<DeathSaveResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    deathSave: hoisted.deathSaveFn,
  },
}));

import { useSessionDeathSave } from './useSessionDeathSave';

beforeEach(() => {
  hoisted.deathSaveFn.mockReset();
});

describe('useSessionDeathSave', () => {
  it('starts idle without an error', () => {
    const { result } = renderHook(() => useSessionDeathSave());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('uses the dedicated RPC and echoes only the exact session, authenticated member, and declaration id', async () => {
    const response = {
      presentationId: 'presentation_opaque',
    } as DeathSaveResponse;
    hoisted.deathSaveFn.mockResolvedValue(response);
    const { result } = renderHook(() => useSessionDeathSave());

    await act(async () => {
      await expect(
        result.current.deathSave({
          session: 'crypt-run',
          member: 'fighter-1',
          declarationId: 'selector.opaque',
        })
      ).resolves.toBe(response);
    });

    expect(hoisted.deathSaveFn).toHaveBeenCalledOnce();
    expect(hoisted.deathSaveFn).toHaveBeenCalledWith({
      session: 'crypt-run',
      member: 'fighter-1',
      declarationId: 'selector.opaque',
    });
  });

  it('reports loading for the one mutation in flight', async () => {
    let resolveRpc!: (response: DeathSaveResponse) => void;
    hoisted.deathSaveFn.mockReturnValue(
      new Promise<DeathSaveResponse>((resolve) => {
        resolveRpc = resolve;
      })
    );
    const { result } = renderHook(() => useSessionDeathSave());

    act(() => {
      void result.current.deathSave({
        session: 'crypt-run',
        member: 'fighter-1',
        declarationId: 'selector.opaque',
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    act(() => resolveRpc({} as DeathSaveResponse));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('preserves an RPC failure and rejects for caller-owned reconciliation without retrying', async () => {
    const failure = new Error('response status unknown');
    hoisted.deathSaveFn.mockRejectedValue(failure);
    const { result } = renderHook(() => useSessionDeathSave());

    await act(async () => {
      await expect(
        result.current.deathSave({
          session: 'crypt-run',
          member: 'fighter-1',
          declarationId: 'selector.opaque',
        })
      ).rejects.toThrow('response status unknown');
    });

    expect(result.current.error).toBe(failure);
    expect(result.current.loading).toBe(false);
    expect(hoisted.deathSaveFn).toHaveBeenCalledOnce();
  });
});
