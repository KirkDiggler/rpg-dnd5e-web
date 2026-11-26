/**
 * THE STUDIO ASKS THE ENGINE FOR ITS ITEM WORDS ONCE (rpg-project#1201).
 */
import { Code, ConnectError } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { itemWordsV237 } from './fixtures/engineReadBack';
import {
  itemWordsNow,
  useItemWords,
  type ItemWordsClient,
} from './useItemWords';

const clientWith = (
  answer: () => ReturnType<ItemWordsClient['getItemWords']>
) => {
  const getItemWords = vi.fn(answer);
  return {
    client: { getItemWords } as unknown as ItemWordsClient,
    getItemWords,
  };
};

describe('useItemWords', () => {
  it('answers with the engine’s item words, asked once for every studio that wants them', async () => {
    const words = itemWordsV237();
    const { client, getItemWords } = clientWith(() => Promise.resolve(words));
    const one = renderHook(() => useItemWords({ client }));
    const two = renderHook(() => useItemWords({ client }));
    expect(one.result.current.status).toBe('loading');
    await waitFor(() => expect(one.result.current.status).toBe('ready'));
    await waitFor(() => expect(two.result.current.status).toBe('ready'));
    expect(one.result.current.words).toBe(words);
    expect(itemWordsNow(client)).toBe(words);
    // A studio opened later in the session takes the kept answer at once.
    const later = renderHook(() => useItemWords({ client }));
    expect(later.result.current.words).toBe(words);
    expect(getItemWords).toHaveBeenCalledTimes(1);
  });

  it('an engine without the words gives none, and the drawing falls back', async () => {
    const { client } = clientWith(() =>
      Promise.reject(new ConnectError('no', Code.Unimplemented))
    );
    const { result } = renderHook(() => useItemWords({ client }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.words).toBeNull();
    expect(itemWordsNow(client)).toBeNull();
  });

  it('a failed ask is not kept: the next studio asks again', async () => {
    let fail = true;
    const words = itemWordsV237();
    const { client, getItemWords } = clientWith(() =>
      fail
        ? Promise.reject(new ConnectError('down', Code.Unavailable))
        : Promise.resolve(words)
    );
    const first = renderHook(() => useItemWords({ client }));
    await waitFor(() =>
      expect(first.result.current.status).toBe('unavailable')
    );
    fail = false;
    const second = renderHook(() => useItemWords({ client }));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(getItemWords).toHaveBeenCalledTimes(2);
  });

  it('does not ask while the server is not there', () => {
    const { client, getItemWords } = clientWith(() =>
      Promise.resolve(itemWordsV237())
    );
    const { result } = renderHook(() =>
      useItemWords({ client, enabled: false })
    );
    expect(result.current.status).toBe('unavailable');
    expect(getItemWords).not.toHaveBeenCalled();
  });
});
