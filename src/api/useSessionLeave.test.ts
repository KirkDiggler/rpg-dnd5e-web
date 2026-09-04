import type { ExitResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  exitFn: vi.fn<() => Promise<ExitResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: { exit: hoisted.exitFn },
}));

import { useSessionLeave } from './useSessionLeave';

beforeEach(() => {
  hoisted.exitFn.mockReset();
});

describe('useSessionLeave', () => {
  it('sends the session and the member and NOTHING else', async () => {
    // The request has not grown a field and will not: where the member
    // stands, whether they carry the artifact, and what any of it means is
    // the server's (design R6/R7).
    hoisted.exitFn.mockResolvedValue({} as ExitResponse);
    const { result } = renderHook(() => useSessionLeave());
    await act(async () => {
      await result.current.leave({ session: 'enc-1', member: 'char-1' });
    });
    expect(hoisted.exitFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
    });
  });

  it('reads nothing out of the answer', async () => {
    // `closed` says the run ended; the client learns that from the ENDED
    // beat like every other member does, so the hook returns the response
    // whole and interprets none of it.
    const ended = { closed: { key: 'recovered' } } as unknown as ExitResponse;
    hoisted.exitFn.mockResolvedValue(ended);
    const { result } = renderHook(() => useSessionLeave());
    let got: ExitResponse | undefined;
    await act(async () => {
      got = await result.current.leave({ session: 's', member: 'm' });
    });
    expect(got).toBe(ended);
  });

  it('is loading while in flight and clear after', async () => {
    let settle!: (v: ExitResponse) => void;
    hoisted.exitFn.mockReturnValue(
      new Promise<ExitResponse>((resolve) => (settle = resolve))
    );
    const { result } = renderHook(() => useSessionLeave());
    act(() => {
      void result.current.leave({ session: 's', member: 'm' });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    act(() => settle({} as ExitResponse));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets the error and rejects on failure', async () => {
    hoisted.exitFn.mockRejectedValue(new Error('no such member'));
    const { result } = renderHook(() => useSessionLeave());
    await act(async () => {
      await expect(
        result.current.leave({ session: 's', member: 'm' })
      ).rejects.toThrow('no such member');
    });
    expect(result.current.error?.message).toBe('no such member');
  });
});
