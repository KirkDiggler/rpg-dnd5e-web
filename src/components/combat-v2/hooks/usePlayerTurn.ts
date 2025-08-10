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

  // Match current turn entity to selected characters
  // Note: Entity IDs in combat may have suffixes, so we check for partial matches
  let currentCharacter: Character | null = null;
  let isPlayerTurn = false;

  if (currentTurn && currentTurn.entityId) {
    // Try exact match first
    currentCharacter =
      selectedCharacters.find((char) => char.id === currentTurn.entityId) ||
      null;

    // If no exact match, try prefix match (entity IDs may have combat suffixes)
    if (!currentCharacter) {
      currentCharacter =
        selectedCharacters.find((char) => {
          // Check if the turn entity ID starts with the character ID
          return currentTurn.entityId.startsWith(char.id.split('-')[0]);
        }) || null;
    }

    // Also check entity type if available from turn order
    // For now, we consider it a player turn if we found a matching character
    isPlayerTurn = Boolean(currentCharacter);
  }

  // Calculate resources from the current turn state
  const resources = {
    hasAction: currentTurn ? !currentTurn.actionUsed : false,
    hasBonusAction: currentTurn ? !currentTurn.bonusActionUsed : false,
    movementMax: currentTurn?.movementMax || 30,
    movementRemaining: currentTurn
      ? (currentTurn.movementMax || 30) - (currentTurn.movementUsed || 0)
      : 0,
  };

  return {
    isPlayerTurn,
    currentCharacter,
    currentTurn,
    resources,
  };
}
