import { create } from '@bufbuild/protobuf';
import type {
  DungeonStartResponse,
  EndTurnResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  DungeonStartRequestSchema,
  EndTurnRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useCallback, useState } from 'react';
import { encounterClient } from './client';

// Hook state types
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

// Hook for EndTurn
export function useEndTurn() {
  const [state, setState] = useState<AsyncState<EndTurnResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const endTurn = useCallback(async (encounterId: string) => {
    setState({ data: null, loading: true, error: null });

    try {
      const request = create(EndTurnRequestSchema, {
        encounterId,
      });

      const response = await encounterClient.endTurn(request);
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
    endTurn,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

// Encounter API hooks
export function useDungeonStart() {
  const [state, setState] = useState<AsyncState<DungeonStartResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const dungeonStart = useCallback(
    async (characterIds: string[]): Promise<DungeonStartResponse> => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(DungeonStartRequestSchema, {
          characterIds,
        });

        const response = await encounterClient.dungeonStart(request);
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
    dungeonStart,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}
