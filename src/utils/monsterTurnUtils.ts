import type {
  CombatLogEntry,
  DiceRoll,
} from '@/components/combat-v2/panels/CombatHistorySidebar';
import type {
  MonsterExecutedAction,
  MonsterTurnResult,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { MonsterActionType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Format an entity ID into a display name
 * e.g., "skeleton-1" -> "Skeleton 1", "giant-spider-2" -> "Giant Spider 2"
 *
 * Handles format: type[-subtype]-instanceNumber
 * The last part (if numeric) is the instance number
 *
 * @param entityId - The entity ID to format
 * @returns A human-readable name with type and instance number
 */
export function formatEntityId(entityId: string): string {
  const parts = entityId.split('-');
  if (parts.length === 0) return entityId;

  // Check if last part is a number (instance ID)
  const lastPart = parts[parts.length - 1];
  const isLastPartNumeric = /^\d+$/.test(lastPart);

  if (isLastPartNumeric && parts.length > 1) {
    // Format type parts (everything except the number)
    const typeParts = parts.slice(0, -1);
    const formattedType = typeParts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return `${formattedType} ${lastPart}`;
  }

  // No instance number, just capitalize first part
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

/**
 * Extract damage numbers from monster turn results
 * Used to display floating damage numbers on the battle map
 *
 * @param turns - Monster turns from EndTurn or DungeonStart response
 * @returns Array of damage info to display
 */
export function extractDamageFromMonsterTurns(
  turns: MonsterTurnResult[]
): Array<{ targetId: string; damage: number; isCritical: boolean }> {
  const damages: Array<{
    targetId: string;
    damage: number;
    isCritical: boolean;
  }> = [];

  for (const turn of turns) {
    for (const action of turn.actions) {
      // Only process attack actions that hit
      if (
        (action.actionType === MonsterActionType.MELEE_ATTACK ||
          action.actionType === MonsterActionType.RANGED_ATTACK) &&
        action.success &&
        action.details.case === 'attackResult'
      ) {
        const attackResult = action.details.value;
        // Only add if we have a target and damage
        if (action.targetId && attackResult.damage > 0) {
          damages.push({
            targetId: action.targetId,
            damage: attackResult.damage,
            isCritical: attackResult.critical,
          });
        }
      }
    }
  }

  return damages;
}

/**
 * Convert MonsterTurnResult[] to CombatLogEntry[]
 *
 * Takes the proto monster turn results and converts them to
 * combat log entries for display in the UI.
 *
 * @param turns - Array of monster turn results from the API
 * @param round - Current combat round number
 * @param getTargetName - Function to resolve target ID to name
 * @returns Array of combat log entries
 */
export function monsterTurnsToLogEntries(
  turns: MonsterTurnResult[],
  round: number,
  getTargetName: (id: string) => string
): CombatLogEntry[] {
  const entries: CombatLogEntry[] = [];

  for (const turn of turns) {
    // Add movement entry if monster moved
    if (turn.movementPath.length > 0) {
      entries.push({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        round,
        actorName: turn.monsterName,
        action: 'Moved',
        description: `${turn.monsterName} moved`,
        type: 'move',
      });
    }

    // Add entries for each action
    for (const action of turn.actions) {
      const entry = convertActionToLogEntry(
        action,
        turn.monsterName,
        round,
        getTargetName
      );
      if (entry) {
        entries.push(entry);
      }
    }
  }

  return entries;
}

/**
 * Convert a single MonsterExecutedAction to a CombatLogEntry
 */
function convertActionToLogEntry(
  action: MonsterExecutedAction,
  monsterName: string,
  round: number,
  getTargetName: (id: string) => string
): CombatLogEntry | null {
  const targetName = action.targetId
    ? getTargetName(action.targetId)
    : undefined;

  // Handle attacks (melee and ranged)
  if (
    action.actionType === MonsterActionType.MELEE_ATTACK ||
    action.actionType === MonsterActionType.RANGED_ATTACK
  ) {
    return createAttackLogEntry(action, monsterName, targetName, round);
  }

  // Handle healing
  if (action.actionType === MonsterActionType.HEAL) {
    return createHealLogEntry(action, monsterName, targetName, round);
  }

  // Handle spells
  if (action.actionType === MonsterActionType.SPELL) {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      round,
      actorName: monsterName,
      targetName,
      action: action.success ? 'Cast Spell' : 'Spell Failed',
      description: `${monsterName} cast a spell${targetName ? ` on ${targetName}` : ''}`,
      type: 'spell',
    };
  }

  // Handle other action types generically
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    round,
    actorName: monsterName,
    targetName,
    action: getActionTypeName(action.actionType),
    description: `${monsterName} used ${getActionTypeName(action.actionType)}`,
    type: 'info',
  };
}

/**
 * Create a combat log entry for an attack action
 */
function createAttackLogEntry(
  action: MonsterExecutedAction,
  monsterName: string,
  targetName: string | undefined,
  round: number
): CombatLogEntry {
  const attackResult =
    action.details.case === 'attackResult' ? action.details.value : undefined;

  // Determine if the attack hit:
  // Use attackResult.hit directly if available, otherwise fall back to action.success
  // Note: In protobuf-es, boolean fields default to false, so we can use them directly
  const hit = attackResult?.hit ?? action.success;

  // Extract dice rolls if we have attack result
  const diceRolls: DiceRoll[] | undefined = attackResult
    ? [
        {
          value: attackResult.attackRoll,
          sides: 20,
          isNatural1: attackResult.attackRoll === 1,
          isNatural20: attackResult.attackRoll === 20,
          isCritical: attackResult.critical,
        },
      ]
    : undefined;

  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    round,
    actorName: monsterName,
    targetName,
    action: hit ? 'Attack Hit' : 'Attack Miss',
    description: hit
      ? attackResult
        ? `${monsterName} hits ${targetName || 'target'} for ${attackResult.damage} damage`
        : `${monsterName} hits ${targetName || 'target'}`
      : `${monsterName} misses ${targetName || 'target'}`,
    type: 'attack',
    diceRolls,
    details: attackResult
      ? {
          attackRoll: attackResult.attackRoll,
          attackTotal: attackResult.attackTotal,
          targetAc: attackResult.targetAc,
          damage: hit ? attackResult.damage : undefined,
          damageType: hit ? attackResult.damageType : undefined,
          critical: attackResult.critical,
          damageBreakdown: attackResult.damageBreakdown,
        }
      : undefined,
  };
}

/**
 * Create a combat log entry for a heal action
 */
function createHealLogEntry(
  action: MonsterExecutedAction,
  monsterName: string,
  targetName: string | undefined,
  round: number
): CombatLogEntry {
  const healResult =
    action.details.case === 'healResult' ? action.details.value : undefined;

  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    round,
    actorName: monsterName,
    targetName,
    action: 'Healed',
    description: `${monsterName} healed${targetName ? ` ${targetName}` : ''}${
      healResult ? ` for ${healResult.amountHealed} HP` : ''
    }`,
    type: 'heal',
    details: healResult
      ? {
          damage: healResult.amountHealed, // Use 'damage' field for heal amount
        }
      : undefined,
  };
}

/**
 * Get a human-readable name for a MonsterActionType
 */
function getActionTypeName(actionType: MonsterActionType): string {
  switch (actionType) {
    case MonsterActionType.MELEE_ATTACK:
      return 'Melee Attack';
    case MonsterActionType.RANGED_ATTACK:
      return 'Ranged Attack';
    case MonsterActionType.SPELL:
      return 'Spell';
    case MonsterActionType.HEAL:
      return 'Heal';
    case MonsterActionType.MOVEMENT:
      return 'Movement';
    case MonsterActionType.STEALTH:
      return 'Stealth';
    case MonsterActionType.DEFEND:
      return 'Defend';
    default:
      return 'Action';
  }
}
