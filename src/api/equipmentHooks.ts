import { create } from '@bufbuild/protobuf';
import type {
  EquipItemResponse,
  GetCharacterInventoryResponse,
  UnequipItemResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  EquipItemRequestSchema,
  EquipmentSlot,
  GetCharacterInventoryRequestSchema,
  UnequipItemRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useCallback, useState } from 'react';
import { characterClient } from './client';

// Hook state types
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

// Hook for GetCharacterInventory
export function useGetCharacterInventory() {
  const [state, setState] = useState<AsyncState<GetCharacterInventoryResponse>>(
    {
      data: null,
      loading: false,
      error: null,
    }
  );

  const getCharacterInventory = useCallback(async (characterId: string) => {
    setState({ data: null, loading: true, error: null });

    try {
      const request = create(GetCharacterInventoryRequestSchema, {
        characterId,
      });

      const response = await characterClient.getCharacterInventory(request);
      setState({ data: response, loading: false, error: null });
      return response;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      setState({ data: null, loading: false, error: errorObj });
      throw errorObj;
    }
  }, []);

  return {
    getCharacterInventory,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

// Hook for EquipItem
export function useEquipItem() {
  const [state, setState] = useState<AsyncState<EquipItemResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const equipItem = useCallback(
    async (characterId: string, itemId: string, slot: EquipmentSlot) => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(EquipItemRequestSchema, {
          characterId,
          itemId,
          slot,
        });

        const response = await characterClient.equipItem(request);
        setState({ data: response, loading: false, error: null });
        return response;
      } catch (error) {
        const errorObj =
          error instanceof Error ? error : new Error(String(error));
        setState({ data: null, loading: false, error: errorObj });
        throw errorObj;
      }
    },
    []
  );

  return {
    equipItem,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

// Hook for UnequipItem
export function useUnequipItem() {
  const [state, setState] = useState<AsyncState<UnequipItemResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const unequipItem = useCallback(
    async (characterId: string, slot: EquipmentSlot) => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(UnequipItemRequestSchema, {
          characterId,
          slot,
        });

        const response = await characterClient.unequipItem(request);
        setState({ data: response, loading: false, error: null });
        return response;
      } catch (error) {
        const errorObj =
          error instanceof Error ? error : new Error(String(error));
        setState({ data: null, loading: false, error: errorObj });
        throw errorObj;
      }
    },
    []
  );

  return {
    unequipItem,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}
