import { create } from '@bufbuild/protobuf';
import type {
  CreateEncounterResponse,
  JoinEncounterResponse,
  LeaveEncounterResponse,
  SetReadyResponse,
  StartCombatResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  CreateEncounterRequestSchema,
  JoinEncounterRequestSchema,
  LeaveEncounterRequestSchema,
  SetReadyRequestSchema,
  StartCombatRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type {
  DungeonDifficulty,
  DungeonLength,
  DungeonTheme,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useCallback, useState } from 'react';
import { encounterClient } from './client';

// Hook state types
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

// Dungeon configuration for starting combat
interface DungeonConfig {
  theme: DungeonTheme;
  difficulty: DungeonDifficulty;
  length: DungeonLength;
}

/**
 * Hook for creating a new encounter lobby
 *
 * @returns Object with createEncounter function and state
 *
 * @example
 * ```tsx
 * const { createEncounter, loading, data } = useCreateEncounter();
 *
 * const handleCreate = async () => {
 *   const response = await createEncounter(['character-id-1']);
 *   // response.encounterId and response.joinCode are now available
 * };
 * ```
 */
export function useCreateEncounter() {
  const [state, setState] = useState<AsyncState<CreateEncounterResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const createEncounter = useCallback(async (characterIds: string[]) => {
    setState({ data: null, loading: true, error: null });

    try {
      const request = create(CreateEncounterRequestSchema, {
        characterIds,
      });

      const response = await encounterClient.createEncounter(request);
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
    createEncounter,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

/**
 * Hook for joining an existing encounter lobby
 *
 * @returns Object with joinEncounter function and state
 *
 * @example
 * ```tsx
 * const { joinEncounter, loading, data } = useJoinEncounter();
 *
 * const handleJoin = async () => {
 *   const response = await joinEncounter('ABC123', ['character-id-1']);
 *   // response.encounterId and current party state are now available
 * };
 * ```
 */
export function useJoinEncounter() {
  const [state, setState] = useState<AsyncState<JoinEncounterResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const joinEncounter = useCallback(
    async (joinCode: string, characterIds: string[]) => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(JoinEncounterRequestSchema, {
          joinCode,
          characterIds,
        });

        const response = await encounterClient.joinEncounter(request);
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
    joinEncounter,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

/**
 * Hook for toggling ready status in lobby
 *
 * NOTE: This hook does NOT update local state optimistically.
 * The stream is the source of truth - wait for the PlayerReady
 * event via useEncounterStream to update UI state.
 *
 * @returns Object with setReady function and state
 *
 * @example
 * ```tsx
 * const { setReady, loading } = useSetReady();
 *
 * const handleToggleReady = async () => {
 *   await setReady('encounter-id', 'player-id', true);
 *   // Don't update local state - stream will deliver PlayerReady event
 * };
 * ```
 */
export function useSetReady() {
  const [state, setState] = useState<AsyncState<SetReadyResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const setReady = useCallback(
    async (encounterId: string, playerId: string, isReady: boolean) => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(SetReadyRequestSchema, {
          encounterId,
          playerId,
          isReady,
        });

        const response = await encounterClient.setReady(request);
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
    setReady,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

/**
 * Hook for starting combat (host only)
 *
 * NOTE: This hook does NOT navigate to the combat view.
 * Wait for the CombatStarted event via useEncounterStream
 * to trigger navigation - this ensures all players transition
 * together when the event arrives.
 *
 * @returns Object with startCombat function and state
 *
 * @example
 * ```tsx
 * const { startCombat, loading } = useStartCombat();
 *
 * const handleStart = async () => {
 *   await startCombat('encounter-id', { theme, difficulty, length });
 *   // Don't navigate - stream will deliver CombatStarted event
 * };
 * ```
 */
export function useStartCombat() {
  const [state, setState] = useState<AsyncState<StartCombatResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const startCombat = useCallback(
    async (encounterId: string, config: DungeonConfig) => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(StartCombatRequestSchema, {
          encounterId,
          theme: config.theme,
          difficulty: config.difficulty,
          length: config.length,
        });

        const response = await encounterClient.startCombat(request);
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
    startCombat,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

/**
 * Hook for leaving an encounter lobby
 *
 * @returns Object with leaveEncounter function and state
 *
 * @example
 * ```tsx
 * const { leaveEncounter, loading } = useLeaveEncounter();
 *
 * const handleLeave = async () => {
 *   await leaveEncounter('encounter-id', 'player-id');
 *   // Clear local state and unsubscribe from stream
 * };
 * ```
 */
export function useLeaveEncounter() {
  const [state, setState] = useState<AsyncState<LeaveEncounterResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const leaveEncounter = useCallback(
    async (encounterId: string, playerId: string) => {
      setState({ data: null, loading: true, error: null });

      try {
        const request = create(LeaveEncounterRequestSchema, {
          encounterId,
          playerId,
        });

        const response = await encounterClient.leaveEncounter(request);
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
    leaveEncounter,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}
