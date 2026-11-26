/**
 * THE STUDIO ASKS THE ENGINE FOR ITS ITEM WORDS ONCE (rpg-project#1220).
 */
import { Code, ConnectError } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { statusWordsV240 } from './fixtures/engineReadBack';
import {
  statusWordsNow,
  useStatusWords,
  type StatusWordsClient,
} from './useStatusWords';

const clientWith = (
  answer: () => ReturnType<StatusWordsClient['getStatusWords']>
) => {
  const getStatusWords = vi.fn(answer);
  return {
    client: { getStatusWords } as unknown as StatusWordsClient,
    getStatusWords,
  };
};

describe('useStatusWords', () => {
  it('answers with the engine’s status words, asked once for every studio that wants them', async () => {
    const words = statusWordsV240();
    const { client, getStatusWords } = clientWith(() => Promise.resolve(words));
    const one = renderHook(() => useStatusWords({ client }));
    const two = renderHook(() => useStatusWords({ client }));
    expect(one.result.current.status).toBe('loading');
    await waitFor(() => expect(one.result.current.status).toBe('ready'));
    await waitFor(() => expect(two.result.current.status).toBe('ready'));
    expect(one.result.current.words).toBe(words);
    expect(statusWordsNow(client)).toBe(words);
    // A studio opened later in the session takes the kept answer at once.
    const later = renderHook(() => useStatusWords({ client }));
    expect(later.result.current.words).toBe(words);
    expect(getStatusWords).toHaveBeenCalledTimes(1);
  });

  it('an engine without the words gives none, and the drawing falls back', async () => {
    const { client } = clientWith(() =>
      Promise.reject(new ConnectError('no', Code.Unimplemented))
    );
    const { result } = renderHook(() => useStatusWords({ client }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current).toMatchObject({
      reason: 'the engine has no status words',
    });
    expect(result.current.words).toBeNull();
    expect(statusWordsNow(client)).toBeNull();
  });

  it('a failed ask is not kept: the next studio asks again', async () => {
    let fail = true;
    const words = statusWordsV240();
    const { client, getStatusWords } = clientWith(() =>
      fail
        ? Promise.reject(new ConnectError('down', Code.Unavailable))
        : Promise.resolve(words)
    );
    const first = renderHook(() => useStatusWords({ client }));
    await waitFor(() =>
      expect(first.result.current.status).toBe('unavailable')
    );
    fail = false;
    const second = renderHook(() => useStatusWords({ client }));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(getStatusWords).toHaveBeenCalledTimes(2);
  });

  it('does not ask while the server is not there', () => {
    const { client, getStatusWords } = clientWith(() =>
      Promise.resolve(statusWordsV240())
    );
    const { result } = renderHook(() =>
      useStatusWords({ client, enabled: false })
    );
    expect(result.current.status).toBe('unavailable');
    expect(getStatusWords).not.toHaveBeenCalled();
  });
});
