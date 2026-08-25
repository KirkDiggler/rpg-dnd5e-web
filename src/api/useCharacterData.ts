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
  const [characterData, setCharacterData] = useState<
    CharacterData | undefined
  >();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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

    setLoading(true);
    setError(null);

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
        setCharacterData(response.character);
      } catch (err) {
        if (!isCurrent()) return;
        // Keep the last confirmed value. ConnectError (including the owner
        // gate's NOT_FOUND) is already an Error and is preserved verbatim.
        setError(
          err instanceof Error ? err : new Error('GetCharacterData RPC failed')
        );
      } finally {
        if (inFlightRef.current === read) inFlightRef.current = null;
        if (isCurrent()) setLoading(false);
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
      setCharacterData(confirmed);
      setError(null);
      setLoading(false);
    },
    [characterId]
  );

  useEffect(() => {
    generationRef.current += 1;
    inFlightRef.current?.controller.abort();
    inFlightRef.current = null;
    setCharacterData(undefined);
    setError(null);
    setLoading(false);

    if (characterId) void refetch();

    return () => {
      generationRef.current += 1;
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
    };
  }, [characterId, refetch]);

  return { characterData, loading, error, refetch, replace };
}
