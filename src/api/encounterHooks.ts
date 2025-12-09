import type { CubeCoord } from '@/utils/hexUtils';
import { create } from '@bufbuild/protobuf';
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type {
  ActivateFeatureResponse,
  AttackResponse,
  DungeonStartResponse,
  EndTurnResponse,
  MoveCharacterResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  ActivateFeatureRequestSchema,
  AttackRequestSchema,
  DungeonStartRequestSchema,
  EndTurnRequestSchema,
  MoveCharacterRequestSchema,
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

// Hook for MoveCharacter
export function useMoveCharacter() {
  const [state, setState] = useState<AsyncState<MoveCharacterResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const moveCharacter = useCallback(
    async (encounterId: string, entityId: string, path: CubeCoord[]) => {
      setState({ data: null, loading: true, error: null });

      try {
        // Send cube coordinates to the server (x, y, z where x + y + z = 0)
        const request = create(MoveCharacterRequestSchema, {
          encounterId,
          entityId,
          path: path.map((pos) =>
            create(PositionSchema, { x: pos.x, y: pos.y, z: pos.z })
          ),
        });

        const response = await encounterClient.moveCharacter(request);
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
    moveCharacter,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

// Hook for Attack
export function useAttack() {
  const [state, setState] = useState<AsyncState<AttackResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const attack = useCallback(
    async (encounterId: string, attackerId: string, targetId: string) => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(AttackRequestSchema, {
          encounterId,
          attackerId,
          targetId,
          weaponId: '', // Use default weapon
        });

        const response = await encounterClient.attack(request);
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
    attack,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

// Hook for ActivateFeature
export function useActivateFeature() {
  const [state, setState] = useState<AsyncState<ActivateFeatureResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const activateFeature = useCallback(
    async (encounterId: string, characterId: string, featureId: string) => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(ActivateFeatureRequestSchema, {
          encounterId,
          characterId,
          featureId,
        });

        const response = await encounterClient.activateFeature(request);
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
    activateFeature,
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
