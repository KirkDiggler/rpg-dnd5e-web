import type { CharacterData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGetCharacterData } from './useGetCharacterData';

export interface UseCharacterDataResult {
  /** Last CharacterData confirmed by an owner read or mutation response. */
  characterData: CharacterData | undefined;
  loading: boolean;
  error: Error | null;
  /** Coalesces callers while the current character already has a read in flight. */
  refetch: () => Promise<void>;
  /** Replaces the cache with a full authoritative EquipItem/UnequipItem output. */
  replace: (characterData: CharacterData) => void;
}

interface InFlightRead {
  characterId: string;
  generation: number;
  controller: AbortController;
  promise: Promise<void>;
}

interface CharacterDataCacheState {
  characterId: string;
  characterData: CharacterData | undefined;
  loading: boolean;
  error: Error | null;
}

const missingCharacterDataError = () =>
  new Error('GetCharacterData response did not include CharacterData');

/**
 * Owns the authenticated player's private CharacterData cache.
 *
 * A nonempty key is fetched once on entry. Background failures publish an
 * error but retain the last server-confirmed value; foreign/missing owner
 * reads therefore remain an explicit NOT_FOUND with no fabricated empty
 * sheet. Key generations and abort signals fence late completions, while
 * concurrent refresh triggers share one promise. Equipment writes replace
 * this cache only with their complete provider response — this hook performs
 * no HP, resource, equipment, AC, or other game-rule calculation.
 */
export function useCharacterData(characterId: string): UseCharacterDataResult {
  const { getCharacterData } = useGetCharacterData();
  const [cache, setCache] = useState<CharacterDataCacheState>(() => ({
    characterId,
    characterData: undefined,
    // A nonempty key schedules its automatic owner read after this render.
    loading: Boolean(characterId),
    error: null,
  }));

  // Update during render so an old completion racing the key-reset effect is
  // already stale. `generationRef` also fences replacement and unmount.
  const keyRef = useRef(characterId);
  keyRef.current = characterId;
  const generationRef = useRef(0);
  const inFlightRef = useRef<InFlightRead | null>(null);

  const refetch = useCallback((): Promise<void> => {
    if (!characterId || keyRef.current !== characterId) {
      return Promise.resolve();
    }

    const existing = inFlightRef.current;
    if (existing?.characterId === characterId) return existing.promise;

    const generation = generationRef.current;
    const controller = new AbortController();
    const isCurrent = () =>
      generationRef.current === generation &&
      keyRef.current === characterId &&
      !controller.signal.aborted;

    setCache((previous) => ({
      characterId,
      characterData:
        previous.characterId === characterId
          ? previous.characterData
          : undefined,
      loading: true,
      error: null,
    }));

    const read: InFlightRead = {
      characterId,
      generation,
      controller,
      promise: Promise.resolve(),
    };
    const promise = (async () => {
      try {
        const response = await getCharacterData(characterId, {
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (!response.character) throw missingCharacterDataError();
        const confirmed = response.character;
        setCache((previous) =>
          isCurrent()
            ? {
                characterId,
                characterData: confirmed,
                loading: previous.loading,
                error: null,
              }
            : previous
        );
      } catch (err) {
        if (!isCurrent()) return;
        // Keep the last confirmed value for this exact key. ConnectError
        // (including the owner gate's NOT_FOUND) is preserved verbatim.
        const error =
          err instanceof Error ? err : new Error('GetCharacterData RPC failed');
        setCache((previous) =>
          isCurrent()
            ? {
                characterId,
                characterData:
                  previous.characterId === characterId
                    ? previous.characterData
                    : undefined,
                loading: previous.loading,
                error,
              }
            : previous
        );
      } finally {
        if (inFlightRef.current === read) inFlightRef.current = null;
        setCache((previous) =>
          isCurrent() ? { ...previous, characterId, loading: false } : previous
        );
      }
    })();

    read.promise = promise;
    inFlightRef.current = read;
    return promise;
  }, [characterId, getCharacterData]);

  const replace = useCallback(
    (confirmed: CharacterData) => {
      if (!characterId || keyRef.current !== characterId) return;
      generationRef.current += 1;
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
      setCache({
        characterId,
        characterData: confirmed,
        error: null,
        loading: false,
      });
    },
    [characterId]
  );

  useEffect(() => {
    generationRef.current += 1;
    inFlightRef.current?.controller.abort();
    inFlightRef.current = null;
    setCache({
      characterId,
      characterData: undefined,
      error: null,
      loading: Boolean(characterId),
    });

    if (characterId) void refetch();

    return () => {
      generationRef.current += 1;
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
    };
  }, [characterId, refetch]);

  // Effects reset/fetch after commit. Associate every published state with its
  // key so the render that notices a key change cannot expose the old key's
  // private data or error in that pre-effect window.
  const cacheMatchesRenderKey = cache.characterId === characterId;
  return {
    characterData: cacheMatchesRenderKey ? cache.characterData : undefined,
    loading: cacheMatchesRenderKey ? cache.loading : Boolean(characterId),
    error: cacheMatchesRenderKey ? cache.error : null,
    refetch,
    replace,
  };
}
