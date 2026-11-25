import type { WaitResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  waitFn: vi.fn<() => Promise<WaitResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    wait: hoisted.waitFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionWait } from './useSessionWait';

beforeEach(() => {
  hoisted.waitFn.mockReset();
});

describe('useSessionWait', () => {
  it('calls sessionClient.wait with the session and member', async () => {
    const fakeResponse = {} as WaitResponse;
    hoisted.waitFn.mockResolvedValue(fakeResponse);
    const { result } = renderHook(() => useSessionWait());

    let response: WaitResponse | undefined;
    await act(async () => {
      response = await result.current.wait({
        session: 'enc-1',
        member: 'char-1',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.waitFn).toHaveBeenCalledOnce();
    expect(hoisted.waitFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
    });
  });

  it('sets loading while in flight and clears it after', async () => {
    let resolveRpc!: (v: WaitResponse) => void;
    hoisted.waitFn.mockReturnValue(
      new Promise<WaitResponse>((resolve) => (resolveRpc = resolve))
    );
    const { result } = renderHook(() => useSessionWait());
    expect(result.current.loading).toBe(false);

    act(() => {
      void result.current.wait({ session: 'enc-1', member: 'char-1' });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as WaitResponse));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error and rethrows on failure, then clears it on the next call', async () => {
    const rpcError = new Error('a fight is on; waiting is not an act there');
    hoisted.waitFn
      .mockRejectedValueOnce(rpcError)
      .mockResolvedValue({} as WaitResponse);
    const { result } = renderHook(() => useSessionWait());

    await act(async () => {
      await expect(
        result.current.wait({ session: 'enc-1', member: 'char-1' })
      ).rejects.toThrow('a fight is on; waiting is not an act there');
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);

    await act(async () => {
      await result.current.wait({ session: 'enc-1', member: 'char-1' });
    });
    expect(result.current.error).toBeNull();
  });
});
