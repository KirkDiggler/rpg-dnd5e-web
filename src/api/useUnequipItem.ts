import { create } from '@bufbuild/protobuf';
import type { UnequipItemResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import { UnequipItemRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import { useCallback, useState } from 'react';
import { characterV2Client } from './client';

export interface UnequipItemParams {
  characterId: string;
  /** The slot to clear — one of the character's SlotDef.key values. */
  slotKey: string;
}

export interface UseUnequipItemResult {
  /**
   * Calls the v1alpha2 CharacterService.UnequipItem unary RPC (character-scoped,
   * out-of-encounter — rpg-dnd5e-web#571). Clears the slot, returning its
   * occupant to inventory. The response carries the full recomputed
   * CharacterData, same as EquipItem — callers update local state from
   * `response.character` directly (no stream push for this RPC's effect,
   * rpg-api#681).
   */
  unequipItem: (params: UnequipItemParams) => Promise<UnequipItemResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the v1alpha2 CharacterService.UnequipItem unary RPC.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - The returned promise rejects on RPC error so callers can surface it
 *
 * Mirrors useEquipItem/useTakeAction/useInteract — one file per verb under
 * src/api/.
 */
export function useUnequipItem(): UseUnequipItemResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const unequipItem = useCallback(
    async (params: UnequipItemParams): Promise<UnequipItemResponse> => {
      setLoading(true);
      setError(null);

      const request = create(UnequipItemRequestSchema, {
        characterId: params.characterId,
        slotKey: params.slotKey,
      });

      try {
        const response = await characterV2Client.unequipItem(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('UnequipItem RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { unequipItem, loading, error };
}
