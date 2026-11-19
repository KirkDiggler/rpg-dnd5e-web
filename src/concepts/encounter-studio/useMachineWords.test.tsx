/**
 * THE STUDIO ASKS THE ENGINE FOR ITS WORDS ONCE (rpg-project#1015).
 */
import { Code, ConnectError } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { machineWordsV225 } from './fixtures/engineReadBack';
import {
  machineWordsNow,
  useMachineWords,
  type MachineWordsClient,
} from './useMachineWords';

const clientWith = (
  answer: () => ReturnType<MachineWordsClient['getMachineWords']>
) => {
  const getMachineWords = vi.fn(answer);
  return {
    client: { getMachineWords } as unknown as MachineWordsClient,
    getMachineWords,
  };
};

describe('useMachineWords', () => {
  it('answers with the engine’s words, asked once for every studio that wants them', async () => {
    const words = machineWordsV225();
    const { client, getMachineWords } = clientWith(() =>
      Promise.resolve(words)
    );
    const one = renderHook(() => useMachineWords({ client }));
    const two = renderHook(() => useMachineWords({ client }));
    expect(one.result.current.status).toBe('loading');
    await waitFor(() => expect(one.result.current.status).toBe('ready'));
    await waitFor(() => expect(two.result.current.status).toBe('ready'));
    expect(one.result.current.words).toBe(words);
    expect(machineWordsNow(client)).toBe(words);
    // A studio opened later in the session takes the kept answer at once.
    const later = renderHook(() => useMachineWords({ client }));
    expect(later.result.current.words).toBe(words);
    expect(getMachineWords).toHaveBeenCalledTimes(1);
  });

  it('an engine without the words gives none, and the drawing falls back', async () => {
    const { client } = clientWith(() =>
      Promise.reject(new ConnectError('no', Code.Unimplemented))
    );
    const { result } = renderHook(() => useMachineWords({ client }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.words).toBeNull();
    expect(machineWordsNow(client)).toBeNull();
  });

  it('a failed ask is not kept: the next studio asks again', async () => {
    let fail = true;
    const words = machineWordsV225();
    const { client, getMachineWords } = clientWith(() =>
      fail
        ? Promise.reject(new ConnectError('down', Code.Unavailable))
        : Promise.resolve(words)
    );
    const first = renderHook(() => useMachineWords({ client }));
    await waitFor(() =>
      expect(first.result.current.status).toBe('unavailable')
    );
    fail = false;
    const second = renderHook(() => useMachineWords({ client }));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(getMachineWords).toHaveBeenCalledTimes(2);
  });

  it('does not ask while the server is not there', () => {
    const { client, getMachineWords } = clientWith(() =>
      Promise.resolve(machineWordsV225())
    );
    const { result } = renderHook(() =>
      useMachineWords({ client, enabled: false })
    );
    expect(result.current.status).toBe('unavailable');
    expect(getMachineWords).not.toHaveBeenCalled();
  });
});
