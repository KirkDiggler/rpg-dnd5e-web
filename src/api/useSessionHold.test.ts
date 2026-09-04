import type { HoldResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  holdFn: vi.fn<() => Promise<HoldResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: { hold: hoisted.holdFn },
}));

import { useSessionHold } from './useSessionHold';

beforeEach(() => {
  hoisted.holdFn.mockReset();
});

describe('useSessionHold', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useSessionHold());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('targets the PLACEMENT ID, not the ref', async () => {
    hoisted.holdFn.mockResolvedValue({} as HoldResponse);
    const { result } = renderHook(() => useSessionHold());
    await act(async () => {
      await result.current.hold({
        session: 'enc-1',
        member: 'char-1',
        target: 'heirloom',
      });
    });
    expect(hoisted.holdFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      target: 'heirloom',
    });
  });

  it('is loading while in flight and clear after', async () => {
    let settle!: (v: HoldResponse) => void;
    hoisted.holdFn.mockReturnValue(
      new Promise<HoldResponse>((resolve) => (settle = resolve))
    );
    const { result } = renderHook(() => useSessionHold());
    act(() => {
      void result.current.hold({ session: 's', member: 'm', target: 'p' });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    act(() => settle({} as HoldResponse));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('surfaces the server’s refusal verbatim and rejects', async () => {
    // "not holdable", "already held", "out of range" — every one of them is
    // the rule half's sentence, and this hook adds nothing to it.
    hoisted.holdFn.mockRejectedValue(new Error('that pillar is not holdable'));
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
