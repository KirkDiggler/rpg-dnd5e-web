import { areDiceRollsEqual } from '@/utils/diceCalculations';
import { create } from '@bufbuild/protobuf';
import type { DiceRoll } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/dice_pb';
import {
  ClearRollSessionRequestSchema,
  GetRollSessionRequestSchema,
  RollDiceRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/dice_pb';
import { useCallback, useState } from 'react';
import { diceClient } from './client';

// Hook state types
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

// Roll dice hook
export function useRollDice() {
  const [state, setState] = useState<AsyncState<DiceRoll[]>>({
    data: null,
    loading: false,
    error: null,
  });

  const rollDice = useCallback(
    async (params: {
      entityId: string;
      context: string;
      notation: string;
      count?: number;
      ttlSeconds?: number;
      modifierDescription?: string;
    }) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const request = create(RollDiceRequestSchema, {
          entityId: params.entityId,
          context: params.context,
          notation: params.notation,
          count: params.count || 1,
          ttlSeconds: params.ttlSeconds || 900, // 15 minutes default
          modifierDescription: params.modifierDescription || '',
        });

        const response = await diceClient.rollDice(request);

        setState({
          data: response.rolls,
          loading: false,
          error: null,
        });

        return response.rolls;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        setState({
          data: null,
          loading: false,
          error: err,
        });
        throw err;
      }
    },
    []
  );

  return { ...state, rollDice };
}

// Get roll session hook
export function useGetRollSession() {
  const [state, setState] = useState<AsyncState<DiceRoll[]>>({
    data: null,
    loading: false,
    error: null,
  });

  const getRollSession = useCallback(
    async (params: { entityId: string; context: string }) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const request = create(GetRollSessionRequestSchema, {
          entityId: params.entityId,
          context: params.context,
        });

        const response = await diceClient.getRollSession(request);

        setState({
          data: response.rolls,
          loading: false,
          error: null,
        });

        return response.rolls;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        setState({
          data: null,
          loading: false,
          error: err,
        });
        throw err;
      }
    },
    []
  );

  return { ...state, getRollSession };
}

// Clear roll session hook
export function useClearRollSession() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearRollSession = useCallback(
    async (params: { entityId: string; context: string }) => {
      setLoading(true);
      setError(null);

      try {
        const request = create(ClearRollSessionRequestSchema, {
          entityId: params.entityId,
          context: params.context,
        });

        const response = await diceClient.clearRollSession(request);
        setLoading(false);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    []
  );

  return { clearRollSession, loading, error };
}

// Helper hook to manage ability score rolls
export function useAbilityScoreRolls(playerId: string) {
  const [rolls, setRolls] = useState<DiceRoll[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const { rollDice, loading: rolling, error: rollError } = useRollDice();
  const {
    getRollSession,
    loading: loadingSession,
    error: sessionError,
  } = useGetRollSession();

  // Context should always be 'ability_scores' for ability score rolling
  // The server uses a fixed context and scopes by entityId (playerId)
  const context = 'ability_scores';

  // Load existing rolls on mount
  const loadExistingRolls = useCallback(async () => {
    try {
      const existingRolls = await getRollSession({
        entityId: playerId,
        context,
      });
      if (existingRolls && existingRolls.length > 0) {
        // Only set rolls if we don't already have them
        setRolls((prev) => {
          if (prev.length === 0) {
            return existingRolls;
          }

          // Merge with existing rolls, avoiding duplicates by checking full equality
          const merged = [...prev];
          existingRolls.forEach((newRoll) => {
            const isDuplicate = merged.some((existingRoll) =>
              areDiceRollsEqual(existingRoll, newRoll)
            );
            if (!isDuplicate) {
              merged.push(newRoll);
            }
          });

          return merged;
        });
      }
    } catch (err) {
      // No existing session is fine - this is expected on first load
      // Only log if it's not a "not found" error
      if (
        err instanceof Error &&
        !err.message.toLowerCase().includes('not_found') &&
        !err.message.toLowerCase().includes('not found')
      ) {
        console.error('Error loading roll session:', err);
      }
    }
  }, [playerId, context, getRollSession]);

  // Roll ability scores
  const rollAbilityScores = useCallback(
    async (count: number = 1) => {
      const newRolls = await rollDice({
        entityId: playerId,
        context,
        notation: '4d6',
        count,
      });
      // Check for duplicates before adding
      setRolls((prev) => {
        const existingIds = new Set(prev.map((r) => r.rollId));
        const uniqueNewRolls = newRolls.filter(
          (r) => !existingIds.has(r.rollId)
        );
        return [...prev, ...uniqueNewRolls];
      });
      return newRolls;
    },
    [playerId, context, rollDice]
  );

  // Assign a roll to an ability
  const assignRoll = useCallback((ability: string, rollId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [ability]: rollId,
    }));
  }, []);

  // Unassign a roll from an ability
  const unassignRoll = useCallback((ability: string) => {
    setAssignments((prev) => {
      const newAssignments = { ...prev };
      delete newAssignments[ability];
      return newAssignments;
    });
  }, []);

  // Check if a roll is already assigned
  const isRollAssigned = useCallback(
    (rollId: string) => {
      return Object.values(assignments).includes(rollId);
    },
    [assignments]
  );

  // Get the roll ID assigned to a specific ability
  const getAssignedRoll = useCallback(
    (ability: string) => {
      return assignments[ability];
    },
    [assignments]
  );

  // Get unassigned rolls
  const getUnassignedRolls = useCallback(() => {
    return rolls.filter((roll) => !isRollAssigned(roll.rollId));
  }, [rolls, isRollAssigned]);

  // Check if all abilities have assignments
  const isComplete = useCallback(() => {
    const requiredAbilities = [
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ];
    return requiredAbilities.every((ability) => assignments[ability]);
  }, [assignments]);

  // Get roll assignments for API call
  const getRollAssignments = useCallback(() => {
    return {
      strengthRollId: assignments.strength || '',
      dexterityRollId: assignments.dexterity || '',
      constitutionRollId: assignments.constitution || '',
      intelligenceRollId: assignments.intelligence || '',
      wisdomRollId: assignments.wisdom || '',
      charismaRollId: assignments.charisma || '',
    };
  }, [assignments]);

  // Filter out expected "not found" errors from display
  const displayError =
    rollError ||
    (sessionError &&
    !sessionError.message.toLowerCase().includes('not_found') &&
    !sessionError.message.toLowerCase().includes('not found')
      ? sessionError
      : null);

  return {
    rolls,
    assignments,
    loading: rolling || loadingSession,
    error: displayError,
    loadExistingRolls,
    rollAbilityScores,
    assignRoll,
    unassignRoll,
    isRollAssigned,
    getAssignedRoll,
    getUnassignedRolls,
    isComplete,
    getRollAssignments,
  };
}
