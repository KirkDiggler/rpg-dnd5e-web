import { create } from '@bufbuild/protobuf';
import type { EquipItemResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import { EquipItemRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import { RefSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useState } from 'react';
import { characterV2Client } from './client';

/** Plain {module,type,id} — the hook constructs the proto Ref internally. */
export interface EquipItemRef {
  module: string;
  type: string;
  id: string;
}

export interface EquipItemParams {
  characterId: string;
  /** Item from inventory to equip. */
  item: EquipItemRef;
  /** Which slot to equip it into — one of the character's SlotDef.key values. */
  slotKey: string;
}

export interface UseEquipItemResult {
  /**
   * Calls the v1alpha2 CharacterService.EquipItem unary RPC (character-scoped,
   * out-of-encounter — rpg-dnd5e-web#571). The response carries the full
   * recomputed CharacterData (equipped/inventory/slots/armor_class_detail/
   * main_hand_damage), including any occupant the toolkit displaced back to
   * inventory (e.g. equipping a two-handed weapon clears off_hand). Callers
   * update local state from `response.character` directly — there is no
   * stream push for this RPC's effect (out of scope, rpg-api#681).
   */
  equipItem: (params: EquipItemParams) => Promise<EquipItemResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around the v1alpha2 CharacterService.EquipItem unary RPC.
 *
 * - loading=true while the RPC is in-flight, false on resolve/reject
 * - error is set on failure, cleared on the next successful call
 * - The returned promise rejects on RPC error so callers can surface it
 *
 * Mirrors useTakeAction/useInteract — one file per verb under src/api/.
 */
export function useEquipItem(): UseEquipItemResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const equipItem = useCallback(
    async (params: EquipItemParams): Promise<EquipItemResponse> => {
      setLoading(true);
      setError(null);

      const request = create(EquipItemRequestSchema, {
        characterId: params.characterId,
        item: create(RefSchema, params.item),
        slotKey: params.slotKey,
      });

      try {
        const response = await characterV2Client.equipItem(request);
        return response;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('EquipItem RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { equipItem, loading, error };
}
