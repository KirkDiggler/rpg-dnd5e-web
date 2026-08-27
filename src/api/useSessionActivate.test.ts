import type { ActivateResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  activateFn: vi.fn<() => Promise<ActivateResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    activate: hoisted.activateFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionActivate } from './useSessionActivate';

beforeEach(() => {
  hoisted.activateFn.mockReset();
});

describe('useSessionActivate', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionActivate());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('echoes the opaque selector unchanged, and sends no ability ref', async () => {
    hoisted.activateFn.mockResolvedValue({} as ActivateResponse);
    const { result } = renderHook(() => useSessionActivate());

    await act(async () => {
      await result.current.activate({
        session: 'sess-1',
        member: 'alice',
        declarationId: 'v1.opaque-rage-selector',
      });
    });

    expect(hoisted.activateFn).toHaveBeenCalledWith({
      session: 'sess-1',
      member: 'alice',
      declarationId: 'v1.opaque-rage-selector',
      target: '',
    });
    // THE SELECTOR IS THE ABILITY. Nothing here names Rage — the server
    // decided which offer that id refers to, and a client that also named it
    // would give the two a way to disagree.
    const sent = hoisted.activateFn.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(sent).not.toHaveProperty('ability');
    expect(sent).not.toHaveProperty('abilityRef');
  });

  it('sends a target only when one was given', async () => {
    hoisted.activateFn.mockResolvedValue({} as ActivateResponse);
    const { result } = renderHook(() => useSessionActivate());

    await act(async () => {
      await result.current.activate({
        session: 'sess-1',
        member: 'alice',
        declarationId: 'v1.help',
        target: 'bob',
      });
    });

    expect(hoisted.activateFn).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'bob' })
    );
  });

  it('surfaces the refusal and rethrows, so the caller decides what to show', async () => {
    hoisted.activateFn.mockRejectedValue(new Error('no rage uses remaining'));
    const { result } = renderHook(() => useSessionActivate());

    await act(async () => {
      await expect(
        result.current.activate({
          session: 'sess-1',
          member: 'alice',
          declarationId: 'v1.rage',
        })
      ).rejects.toThrow('no rage uses remaining');
    });

    expect(result.current.error?.message).toBe('no rage uses remaining');
    expect(result.current.loading).toBe(false);
  });
});
