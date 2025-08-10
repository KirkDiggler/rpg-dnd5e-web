import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';

export interface PlayerTurnInfo {
  /** Whether it's currently a player's turn */
  isPlayerTurn: boolean;
  /** The character whose turn it is (if it's a player turn) */
  currentCharacter: Character | null;
  /** The current turn state from combat */
  currentTurn: CombatState['currentTurn'];
  /** Turn resources and capabilities */
  resources: {
    hasAction: boolean;
    hasBonusAction: boolean;
    movementRemaining: number;
    movementMax: number;
  };
}

export interface UsePlayerTurnProps {
  combatState: CombatState | null;
  selectedCharacters: Character[];
}

/**
 * Hook to determine if it's a player's turn and extract relevant turn information.
 *
 * This hook encapsulates the logic for:
 * - Detecting when it's a player character's turn (vs NPC/monster)
 * - Extracting the current character from the turn order
 * - Calculating available resources (actions, movement, etc.)
 *
 * @param combatState - Current combat state from protobuf
 * @param selectedCharacters - Characters controlled by the player
 * @returns PlayerTurnInfo with turn status and resources
 */
export function usePlayerTurn({
  combatState,
  selectedCharacters,
}: UsePlayerTurnProps): PlayerTurnInfo {
  // Early exit if no combat or characters
  if (
    !combatState ||
    !combatState.currentTurn ||
    selectedCharacters.length === 0
  ) {
    return {
      isPlayerTurn: false,
      currentCharacter: null,
      currentTurn: undefined,
      resources: {
        hasAction: false,
        hasBonusAction: false,
        movementRemaining: 0,
        movementMax: 0,
      },
    };
  }

  const currentTurn = combatState.currentTurn;

  // For now, we'll use a simple heuristic: if we have selected characters and there's a current turn,
  // assume it's a player turn. In a more sophisticated implementation, we might:
  // - Match entity IDs from turn order to character IDs
  // - Check entity types (PLAYER vs NPC)
  // - Look up character ownership

  // Use the first selected character as the "current" character for now
  // This is a simplification - in reality we'd match the current turn entity
  // to the specific character, but that requires more complex entity mapping
  const currentCharacter =
    selectedCharacters.length > 0 ? selectedCharacters[0] : null;

  // Calculate resources from the current turn state
  const resources = {
    hasAction: !currentTurn.actionUsed,
    hasBonusAction: !currentTurn.bonusActionUsed,
    movementMax: currentTurn.movementMax || 30,
    movementRemaining:
      (currentTurn.movementMax || 30) - (currentTurn.movementUsed || 0),
  };

  // For this implementation, if we have a current turn and selected characters,
  // we assume it's a player turn. This matches the existing logic in the app.
  const isPlayerTurn = Boolean(currentCharacter && currentTurn);

  return {
    isPlayerTurn,
    currentCharacter,
    currentTurn,
    resources,
  };
}
