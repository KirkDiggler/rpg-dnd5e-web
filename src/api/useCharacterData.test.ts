import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import type { GetCharacterDataResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import {
  CharacterDataSchema,
  HitPointsSchema,
  type CharacterData,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCharacterDataFn:
    vi.fn<
      (request?: { characterId?: string }) => Promise<GetCharacterDataResponse>
    >(),
}));

vi.mock('./client', () => ({
  characterV2Client: {
    getCharacterData: hoisted.getCharacterDataFn,
  },
}));

import { useCharacterData } from './useCharacterData';

function character(level: number, current = 20): CharacterData {
  return create(CharacterDataSchema, {
    level,
    hitPoints: create(HitPointsSchema, { current, max: 24 }),
  });
}

function response(value: CharacterData): GetCharacterDataResponse {
  return { character: value } as GetCharacterDataResponse;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  hoisted.getCharacterDataFn.mockReset();
});

describe('useCharacterData', () => {
  it('fetches once for a nonempty character key and never fabricates data for an empty key', async () => {
    const confirmed = character(3);
    hoisted.getCharacterDataFn.mockResolvedValue(response(confirmed));

    const { result, rerender } = renderHook(
      ({ characterId }) => useCharacterData(characterId),
      { initialProps: { characterId: '' } }
    );

    expect(result.current.characterData).toBeUndefined();
    expect(hoisted.getCharacterDataFn).not.toHaveBeenCalled();

    rerender({ characterId: 'fighter-1' });
    await waitFor(() => expect(result.current.characterData).toBe(confirmed));
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1);
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: 'fighter-1' }),
      expect.anything()
    );

    rerender({ characterId: 'fighter-1' });
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1);
  });

  it('replaces the cached value directly from authoritative EquipItem and UnequipItem outputs', async () => {
    const initial = character(3, 20);
    const equipped = character(3, 21);
    const unequipped = character(3, 22);
    hoisted.getCharacterDataFn.mockResolvedValue(response(initial));

    const { result } = renderHook(() => useCharacterData('fighter-1'));
    await waitFor(() => expect(result.current.characterData).toBe(initial));

    act(() => result.current.replace(equipped));
    expect(result.current.characterData).toBe(equipped);

    act(() => result.current.replace(unequipped));
    expect(result.current.characterData).toBe(unequipped);
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of refetch requests into one in-flight owner read', async () => {
    const initial = character(3);
    const refreshed = character(4);
    const pending = deferred<GetCharacterDataResponse>();
    hoisted.getCharacterDataFn
      .mockResolvedValueOnce(response(initial))
      .mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useCharacterData('fighter-1'));
    await waitFor(() => expect(result.current.characterData).toBe(initial));

    act(() => {
      void result.current.refetch();
      void result.current.refetch();
      void result.current.refetch();
    });
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.resolve(response(refreshed));
      await pending.promise;
    });
    expect(result.current.characterData).toBe(refreshed);
  });

  it('keeps an authoritative replacement when an older owner read resolves after it', async () => {
    const initial = character(3, 20);
    const staleRead = character(3, 1);
    const replaced = character(3, 24);
    const pending = deferred<GetCharacterDataResponse>();
    hoisted.getCharacterDataFn
      .mockResolvedValueOnce(response(initial))
      // This fake deliberately ignores AbortSignal, as a stalled transport may.
      .mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useCharacterData('fighter-1'));
    await waitFor(() => expect(result.current.characterData).toBe(initial));

    act(() => {
      void result.current.refetch();
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => result.current.replace(replaced));
    expect(result.current.characterData).toBe(replaced);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      pending.resolve(response(staleRead));
      await pending.promise;
    });

    expect(result.current.characterData).toBe(replaced);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('keeps the last confirmed CharacterData when a refetch fails', async () => {
    const confirmed = character(3);
    const refetchError = new Error('temporary transport failure');
    hoisted.getCharacterDataFn
      .mockResolvedValueOnce(response(confirmed))
      .mockRejectedValueOnce(refetchError);

    const { result } = renderHook(() => useCharacterData('fighter-1'));
    await waitFor(() => expect(result.current.characterData).toBe(confirmed));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.characterData).toBe(confirmed);
    expect(result.current.error).toBe(refetchError);
    expect(result.current.loading).toBe(false);
  });

  it('surfaces owner-gated NOT_FOUND and never substitutes zero/default CharacterData', async () => {
    const notFound = new ConnectError('character not found', Code.NotFound);
    hoisted.getCharacterDataFn.mockRejectedValue(notFound);

    const { result } = renderHook(() => useCharacterData('foreign-character'));

    await waitFor(() => expect(result.current.error).toBe(notFound));
    expect(result.current.characterData).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it('never exposes the previous key data or error during the first render of a nonempty key change', async () => {
    const first = character(3);
    const firstError = new Error('fighter-1 refresh failed');
    const secondRequest = deferred<GetCharacterDataResponse>();
    hoisted.getCharacterDataFn
      .mockResolvedValueOnce(response(first))
      .mockRejectedValueOnce(firstError)
      .mockReturnValueOnce(secondRequest.promise);

    const observations: Array<{
      renderKey: string;
      characterData: CharacterData | undefined;
      loading: boolean;
      error: Error | null;
    }> = [];
    const { result, rerender } = renderHook(
      ({ characterId }) => {
        const value = useCharacterData(characterId);
        observations.push({ renderKey: characterId, ...value });
        return value;
      },
      { initialProps: { characterId: 'fighter-1' } }
    );
    await waitFor(() => expect(result.current.characterData).toBe(first));
    await act(async () => result.current.refetch());
    expect(result.current.error).toBe(firstError);

    observations.length = 0;
    rerender({ characterId: 'fighter-2' });

    const firstSecondKeyRender = observations.find(
      ({ renderKey }) => renderKey === 'fighter-2'
    );
    expect(firstSecondKeyRender).toMatchObject({
      characterData: undefined,
      error: null,
      loading: true,
    });

    await act(async () => {
      secondRequest.resolve(response(character(4)));
      await secondRequest.promise;
    });
  });

  it('keeps render-time key isolation under React StrictMode', async () => {
    const first = character(3);
    const second = character(4);
    hoisted.getCharacterDataFn.mockImplementation((request) =>
      Promise.resolve(
        response(request?.characterId === 'fighter-1' ? first : second)
      )
    );

    const observations: Array<{
      renderKey: string;
      characterData: CharacterData | undefined;
      error: Error | null;
    }> = [];
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    const { result, rerender } = renderHook(
      ({ characterId }) => {
        const value = useCharacterData(characterId);
        observations.push({
          renderKey: characterId,
          characterData: value.characterData,
          error: value.error,
        });
        return value;
      },
      {
        initialProps: { characterId: 'fighter-1' },
        wrapper,
      }
    );
    await waitFor(() => expect(result.current.characterData).toBe(first));

    observations.length = 0;
    rerender({ characterId: 'fighter-2' });

    const firstSecondKeyRender = observations.find(
      ({ renderKey }) => renderKey === 'fighter-2'
    );
    expect(firstSecondKeyRender).toEqual({
      renderKey: 'fighter-2',
      characterData: undefined,
      error: null,
    });
    await waitFor(() => expect(result.current.characterData).toBe(second));
  });

  it('resets on nonempty key changes and fences late data, errors, and loading from the old key', async () => {
    const oldRequest = deferred<GetCharacterDataResponse>();
    const newRequest = deferred<GetCharacterDataResponse>();
    hoisted.getCharacterDataFn
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const { result, rerender } = renderHook(
      ({ characterId }) => useCharacterData(characterId),
      { initialProps: { characterId: 'fighter-1' } }
    );
    await waitFor(() => expect(result.current.loading).toBe(true));

    rerender({ characterId: 'fighter-2' });
    expect(result.current.characterData).toBeUndefined();
    await waitFor(() =>
      expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(2)
    );

    await act(async () => {
      oldRequest.reject(new Error('stale owner read failed'));
      await oldRequest.promise.catch(() => undefined);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);

    const current = character(5);
    await act(async () => {
      newRequest.resolve(response(current));
      await newRequest.promise;
    });
    expect(result.current.characterData).toBe(current);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('treats a successful response without CharacterData as an error, not an empty sheet', async () => {
    hoisted.getCharacterDataFn.mockResolvedValue(
      {} as GetCharacterDataResponse
    );

    const { result } = renderHook(() => useCharacterData('fighter-1'));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toContain('CharacterData');
    expect(result.current.characterData).toBeUndefined();
  });
});
