import type { SpeakResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  speakFn: vi.fn<() => Promise<SpeakResponse>>(),
}));

vi.mock('./client', () => ({
  sessionClient: {
    speak: hoisted.speakFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useSessionSpeak } from './useSessionSpeak';

beforeEach(() => {
  hoisted.speakFn.mockReset();
});

describe('useSessionSpeak', () => {
  it('starts with loading=false and no error', () => {
    const { result } = renderHook(() => useSessionSpeak());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('echoes session/member/target/option exactly, and sends no selector — the request has no field for one', async () => {
    const fakeResponse = {} as unknown as SpeakResponse;
    hoisted.speakFn.mockResolvedValue(fakeResponse);

    const { result } = renderHook(() => useSessionSpeak());

    let response: SpeakResponse | undefined;
    await act(async () => {
      response = await result.current.speak({
        session: 'enc-1',
        member: 'char-1',
        target: { case: 'memberId', value: 'front-goblin' },
        optionId: 'troupe',
      });
    });

    expect(response).toBe(fakeResponse);
    expect(hoisted.speakFn).toHaveBeenCalledOnce();
    expect(hoisted.speakFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      target: { case: 'memberId', value: 'front-goblin' },
      optionId: 'troupe',
    });
  });

  it('sets loading=true during the call and false after success', async () => {
    let resolveRpc!: (v: SpeakResponse) => void;
    const pendingRpc = new Promise<SpeakResponse>(
      (resolve) => (resolveRpc = resolve)
    );
    hoisted.speakFn.mockReturnValue(pendingRpc);

    const { result } = renderHook(() => useSessionSpeak());

    act(() => {
      void result.current.speak({
        session: 'enc-1',
        member: 'char-1',
        target: { case: 'memberId', value: 'front-goblin' },
        optionId: 'troupe',
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => resolveRpc({} as SpeakResponse));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets error on RPC failure, loading=false, and the promise rejects', async () => {
    // The refusal a player meets most: the creature cannot see the actor, so
    // there is nobody to talk to. An outcome the SERVER decides — this hook
    // computes no reach and no sightline of its own.
    const rpcError = new Error('target cannot see the actor');
    hoisted.speakFn.mockRejectedValue(rpcError);

    const { result } = renderHook(() => useSessionSpeak());

    await act(async () => {
      await expect(
        result.current.speak({
          session: 'enc-1',
          member: 'char-1',
          target: { case: 'memberId', value: 'front-goblin' },
          optionId: 'troupe',
        })
      ).rejects.toThrow('target cannot see the actor');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(rpcError);
  });

  it('clears error on a subsequent successful call', async () => {
    hoisted.speakFn
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue({} as SpeakResponse);

    const { result } = renderHook(() => useSessionSpeak());

    await act(async () => {
      await expect(
        result.current.speak({
          session: 'enc-1',
          member: 'char-1',
          target: { case: 'memberId', value: 'front-goblin' },
          optionId: 'troupe',
        })
      ).rejects.toThrow('first fail');
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.speak({
        session: 'enc-1',
        member: 'char-1',
        target: { case: 'memberId', value: 'front-goblin' },
        optionId: 'troupe',
      });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('a settled attempt and a paused one settle identically here — the hook reads no verdict off either', async () => {
    // The ruling, at the seam that would be tempted to break it: a threat
    // that landed and one that stopped to ask about a held Guidance are
    // structurally different responses, and this hook handles them with the
    // same code path and returns both whole. Whatever a caller shows after a
    // threat, the OUTCOME is not in here — it arrives on the `spoke`
    // beat, which the actor reads like everybody else.
    const settled = {
      paused: false,
      saved: { ok: true },
      delivery: { ok: true },
    } as unknown as SpeakResponse;
    const paused = {
      paused: true,
      roll: 11,
    } as unknown as SpeakResponse;

    const { result: settledResult } = renderHook(() => useSessionSpeak());
    let settledResponse: SpeakResponse | undefined;
    await act(async () => {
      hoisted.speakFn.mockResolvedValueOnce(settled);
      settledResponse = await settledResult.current.speak({
        session: 'enc-1',
        member: 'char-1',
        target: { case: 'memberId', value: 'front-goblin' },
        optionId: 'troupe',
      });
    });

    const { result: pausedResult } = renderHook(() => useSessionSpeak());
    let pausedResponse: SpeakResponse | undefined;
    await act(async () => {
      hoisted.speakFn.mockResolvedValueOnce(paused);
      pausedResponse = await pausedResult.current.speak({
        session: 'enc-1',
        member: 'char-1',
        target: { case: 'memberId', value: 'front-goblin' },
        optionId: 'troupe',
      });
    });

    expect(settledResponse).toBe(settled);
    expect(pausedResponse).toBe(paused);
    expect(settledResult.current.loading).toBe(false);
    expect(pausedResult.current.loading).toBe(false);
    expect(settledResult.current.error).toBeNull();
    expect(pausedResult.current.error).toBeNull();
  });
});
