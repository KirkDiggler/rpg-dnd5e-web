import { create } from '@bufbuild/protobuf';
import {
  GetCharacterDataRequestSchema,
  type GetCharacterDataResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import { useCallback, useState } from 'react';
import { characterV2Client } from './client';

export interface GetCharacterDataOptions {
  signal?: AbortSignal;
}

export interface UseGetCharacterDataResult {
  /**
   * Calls the v1alpha2 CharacterService.GetCharacterData unary RPC — the
   * read `GetCharacterDataRequest`'s own doc comment names as "the read
   * the equipment screen uses to load its initial state on the session
   * stack." Read-only; nothing about the character changes. Returns the
   * SAME `CharacterData` shape `EquipItem`/`UnequipItem` responses carry
   * (`GetCharacterDataResponse`'s own doc comment), so a caller that seeds
   * from this and later re-renders from an equip response uses one type,
   * one code path.
   */
  getCharacterData: (
    characterId: string,
    options?: GetCharacterDataOptions
  ) => Promise<GetCharacterDataResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the v1alpha2 CharacterService.GetCharacterData
 * unary RPC — mirrors `useEquipItem`/`useUnequipItem`: one file per verb,
 * `loading` true while in flight, `error` set on failure (cleared on the
 * next successful call), and the returned promise rejects so the caller
 * decides what to show. `NOT_FOUND` on a character that doesn't exist or
 * isn't the caller's own (the host binds `character_id` to the
 * authenticated owner) surfaces as a rejection like any other RPC error.
 */
export function useGetCharacterData(): UseGetCharacterDataResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getCharacterData = useCallback(
    async (
      characterId: string,
      options?: GetCharacterDataOptions
    ): Promise<GetCharacterDataResponse> => {
      setLoading(true);
      setError(null);
      try {
        const request = create(GetCharacterDataRequestSchema, { characterId });
        const response = options?.signal
          ? await characterV2Client.getCharacterData(request, {
              signal: options.signal,
            })
          : await characterV2Client.getCharacterData(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('GetCharacterData RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { getCharacterData, loading, error };
}
