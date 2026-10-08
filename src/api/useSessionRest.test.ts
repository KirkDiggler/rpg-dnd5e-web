import type { RestResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { RestKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  restFn: vi.fn<() => Promise<RestResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: { rest: hoisted.restFn },
}));

import { useSessionRest } from './useSessionRest';

beforeEach(() => {
  hoisted.restFn.mockReset();
});

describe('useSessionRest', () => {
  it('names every rester in one SHORT call', async () => {
    hoisted.restFn.mockResolvedValue({} as RestResponse);
    const { result } = renderHook(() => useSessionRest());
    await act(async () => {
      await result.current.rest({
        session: 'run-1',
        resters: [
          { member: 'a', hitDice: 0 },
          { member: 'b', hitDice: 2 },
        ],
      });
    });
    expect(hoisted.restFn).toHaveBeenCalledWith({
      session: 'run-1',
      kind: RestKind.SHORT,
      resters: [
        { member: 'a', hitDice: 0 },
        { member: 'b', hitDice: 2 },
      ],
    });
  });

  it('rejects with the server error and retains it', async () => {
    hoisted.restFn.mockRejectedValue(new Error('someone is in a fight'));
    const { result } = renderHook(() => useSessionRest());
    await act(async () => {
      await expect(
        result.current.rest({ session: 'run-1', resters: [] })
      ).rejects.toThrow('someone is in a fight');
    });
    expect(result.current.error?.message).toBe('someone is in a fight');
  });
});
