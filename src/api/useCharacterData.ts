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
  scopeKey: string;
  generation: number;
  controller: AbortController;
  /** A refresh arrived after this pass began and requires a trailing read. */
  invalidated: boolean;
  promise: Promise<void>;
}

interface CharacterDataCacheState {
  scopeKey: string;
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
export function useCharacterData(
  characterId: string,
  ownerScope: string
): UseCharacterDataResult {
  const { getCharacterData } = useGetCharacterData();
  // Authenticated owner is part of the cache identity even though the RPC
  // request itself carries only character_id. The transport reads current auth
  // credentials, so an owner switch must force a new owner-gated request.
  const scopeKey = `${ownerScope}\u0000${characterId}`;
  const ready = Boolean(characterId && ownerScope);
  const [cache, setCache] = useState<CharacterDataCacheState>(() => ({
    scopeKey,
    characterData: undefined,
    loading: ready,
    error: null,
  }));

  // Update during render so an old completion racing the key-reset effect is
  // already stale. `generationRef` also fences replacement and unmount.
  const keyRef = useRef(scopeKey);
  keyRef.current = scopeKey;
  const generationRef = useRef(0);
  const inFlightRef = useRef<InFlightRead | null>(null);

  const refetch = useCallback((): Promise<void> => {
    if (!ready || keyRef.current !== scopeKey) {
      return Promise.resolve();
    }

    const existing = inFlightRef.current;
    if (existing?.scopeKey === scopeKey) {
      // Sharing only the current promise can lose a stream invalidation: the
      // response already in flight may be a server snapshot from before that
      // event. Coalesce every such invalidation into one serialized trailing
      // owner read instead.
      existing.invalidated = true;
      return existing.promise;
    }

    const generation = generationRef.current;
    const controller = new AbortController();
    const isCurrent = () =>
      generationRef.current === generation &&
      keyRef.current === scopeKey &&
      !controller.signal.aborted;

    setCache((previous) => ({
      scopeKey,
      characterData:
        previous.scopeKey === scopeKey ? previous.characterData : undefined,
      loading: true,
      error: null,
    }));

    const read: InFlightRead = {
      scopeKey,
      generation,
      controller,
      invalidated: false,
      promise: Promise.resolve(),
    };
    const promise = (async () => {
      try {
        do {
          // Invalidations observed during this read set the flag again. A
          // whole burst therefore produces one trailing snapshot, while an
          // event during that trailing snapshot remains safely recoverable.
          read.invalidated = false;
          if (!isCurrent()) return;
          setCache((previous) =>
            isCurrent()
              ? { ...previous, scopeKey, loading: true, error: null }
              : previous
          );

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
                    scopeKey,
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
              err instanceof Error
                ? err
                : new Error('GetCharacterData RPC failed');
            setCache((previous) =>
              isCurrent()
                ? {
                    scopeKey,
                    characterData:
                      previous.scopeKey === scopeKey
                        ? previous.characterData
                        : undefined,
                    loading: previous.loading,
                    error,
                  }
                : previous
            );
          }
        } while (isCurrent() && read.invalidated);
      } finally {
        if (inFlightRef.current === read) inFlightRef.current = null;
        setCache((previous) =>
          isCurrent() ? { ...previous, scopeKey, loading: false } : previous
        );
      }
    })();

    read.promise = promise;
    inFlightRef.current = read;
    return promise;
  }, [characterId, getCharacterData, ready, scopeKey]);

  const replace = useCallback(
    (confirmed: CharacterData) => {
      if (!ready || keyRef.current !== scopeKey) return;
      generationRef.current += 1;
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
      setCache({
        scopeKey,
        characterData: confirmed,
        error: null,
        loading: false,
      });
    },
    [ready, scopeKey]
  );

  useEffect(() => {
    generationRef.current += 1;
    inFlightRef.current?.controller.abort();
    inFlightRef.current = null;
    setCache({
      scopeKey,
      characterData: undefined,
      error: null,
      loading: ready,
    });

    if (ready) void refetch();

    return () => {
      generationRef.current += 1;
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
    };
  }, [ready, refetch, scopeKey]);

  // Effects reset/fetch after commit. Associate every published state with its
  // key so the render that notices a key change cannot expose the old key's
  // private data or error in that pre-effect window.
  const cacheMatchesRenderKey = cache.scopeKey === scopeKey;
  return {
    characterData: cacheMatchesRenderKey ? cache.characterData : undefined,
    loading: cacheMatchesRenderKey ? cache.loading : ready,
    error: cacheMatchesRenderKey ? cache.error : null,
    refetch,
    replace,
  };
}
