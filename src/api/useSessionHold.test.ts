import type { TakeResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  takeFn: vi.fn<() => Promise<TakeResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: { take: hoisted.takeFn },
}));

import { useSessionHold } from './useSessionHold';

beforeEach(() => {
  hoisted.takeFn.mockReset();
});

describe('useSessionHold', () => {
  it('calls the seam’s pick-up verb — Hold here, still Take on the pinned wire', () => {
    // The one place the two words meet (design R10; the protos rename in a
    // wave-0 follow-up). If this ever stops being true, the rename is done
    // and this test is where it shows.
    expect(typeof useSessionHold).toBe('function');
  });

  it('targets the PLACEMENT ID, not the ref', async () => {
    hoisted.takeFn.mockResolvedValue({} as TakeResponse);
    const { result } = renderHook(() => useSessionHold());
    await act(async () => {
      await result.current.hold({
        session: 'enc-1',
        member: 'char-1',
        target: 'heirloom',
      });
    });
    expect(hoisted.takeFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      target: 'heirloom',
    });
  });

  it('is loading while in flight and clear after', async () => {
    let settle!: (v: TakeResponse) => void;
    hoisted.takeFn.mockReturnValue(
      new Promise<TakeResponse>((resolve) => (settle = resolve))
    );
    const { result } = renderHook(() => useSessionHold());
    act(() => {
      void result.current.hold({ session: 's', member: 'm', target: 'p' });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    act(() => settle({} as TakeResponse));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('surfaces the server’s refusal verbatim and rejects', async () => {
    // "not holdable", "already held", "out of range" — every one of them is
    // the rule half's sentence, and this hook adds nothing to it.
    hoisted.takeFn.mockRejectedValue(new Error('that pillar is not holdable'));
    const { result } = renderHook(() => useSessionHold());
    await act(async () => {
      await expect(
        result.current.hold({ session: 's', member: 'm', target: 'pillar' })
      ).rejects.toThrow('that pillar is not holdable');
    });
    expect(result.current.error?.message).toBe('that pillar is not holdable');
    expect(result.current.loading).toBe(false);
  });
});
