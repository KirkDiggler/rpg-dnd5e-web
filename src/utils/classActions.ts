import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { getClassDisplayName } from './displayNames';

/**
 * Represents a quick action button available to a character in combat.
 * Actions are displayed as clickable buttons in the combat panel.
 */
export interface ClassAction {
  /** Unique identifier for this action (e.g., 'attack', 'move', 'rage') */
  id: string;
  /** Display name shown on the button */
  label: string;
  /** Emoji icon displayed with the action */
  icon: string;
  /** Type of action economy this consumes */
  actionType: 'action' | 'bonus_action' | 'free' | 'special';
  /** Optional reference to character.features[].id for class-specific abilities */
  featureId?: string;
  /** Optional tooltip text describing the action */
  description?: string;
}

/**
 * Result of getClassActions containing the list of available actions
 * and the class name for display purposes.
 */
export interface ClassActionsResult {
  /** List of available actions for this class */
  actions: ClassAction[];
  /** Display name of the character class */
  className: string;
}

/**
 * Common actions available to all classes.
 * These are the baseline actions every character can perform in combat.
 */
const COMMON_ACTIONS: ClassAction[] = [
  {
    id: 'attack',
    label: 'Attack',
    icon: '⚔️',
    actionType: 'action',
    description: 'Make a weapon or unarmed attack',
  },
  {
    id: 'move',
    label: 'Move',
    icon: '🏃',
    actionType: 'free',
    description: 'Move up to your speed',
  },
  {
    id: 'backpack',
    label: 'Backpack',
    icon: '🎒',
    actionType: 'free',
    description: 'Access your inventory',
  },
  {
    id: 'end_turn',
    label: 'End Turn',
    icon: '⏭️',
    actionType: 'free',
    description: 'End your turn and pass to the next combatant',
  },
];

/**
 * Class-specific actions for Fighter.
 * Fighters have access to Second Wind (self-healing) and Action Surge (extra action).
 */
const FIGHTER_ACTIONS: ClassAction[] = [
  {
    id: 'second_wind',
    label: 'Second Wind',
    icon: '💚',
    actionType: 'bonus_action',
    featureId: 'second_wind',
    description: 'Regain hit points as a bonus action',
  },
  {
    id: 'action_surge',
    label: 'Action Surge',
    icon: '⚡',
    actionType: 'special',
    featureId: 'action_surge',
    description: 'Take an additional action on your turn',
  },
];

/**
 * Class-specific actions for Barbarian.
 * Barbarians can enter Rage (bonus damage, resistance) and use Reckless Attack.
 */
const BARBARIAN_ACTIONS: ClassAction[] = [
  {
    id: 'rage',
    label: 'Rage',
    icon: '🔥',
    actionType: 'bonus_action',
    featureId: 'rage',
    description: 'Enter a rage, gaining bonus damage and damage resistance',
  },
  {
    id: 'reckless_attack',
    label: 'Reckless Attack',
    icon: '💥',
    actionType: 'special',
    featureId: 'reckless_attack',
    description:
      'Attack with advantage, but enemies have advantage against you',
  },
];

/**
 * Class-specific actions for Rogue.
 * Rogues have Cunning Action for bonus action mobility.
 */
const ROGUE_ACTIONS: ClassAction[] = [
  {
    id: 'cunning_action',
    label: 'Cunning Action',
    icon: '🎭',
    actionType: 'bonus_action',
    featureId: 'cunning_action',
    description: 'Dash, Disengage, or Hide as a bonus action',
  },
];

/**
 * Spell action for spellcasting classes.
 * This opens a spell list modal for spell selection.
 */
const SPELL_ACTION: ClassAction = {
  id: 'spell',
  label: 'Spell',
  icon: '📜',
  actionType: 'action',
  description: 'Cast a spell from your spell list',
};

/**
 * Generic ability action for classes without specific quick actions.
 */
const ABILITY_ACTION: ClassAction = {
  id: 'ability',
  label: 'Ability',
  icon: '✨',
  actionType: 'action',
  description: 'Use a class ability',
};

/**
 * Spellcasting classes that get the Spell quick action button.
 * These classes primarily use spells in combat.
 */
const SPELLCASTING_CLASSES = [
  Class.WIZARD,
  Class.SORCERER,
  Class.WARLOCK,
  Class.BARD,
  Class.CLERIC,
  Class.DRUID,
  Class.PALADIN,
];

/**
 * Get the list of quick actions available to a character based on their class.
 *
 * Different classes get different action buttons:
 * - Fighter: Attack, Move, Second Wind, Action Surge, Backpack
 * - Barbarian: Attack, Move, Rage, Reckless Attack, Backpack
 * - Rogue: Attack, Move, Cunning Action, Backpack
 * - Spellcasters: Attack, Move, Spell, Backpack
 * - Default: Attack, Move, Ability, Backpack
 *
 * @param characterClass - The Class enum value from the character
 * @returns ClassActionsResult containing actions array and class name
 */
export function getClassActions(characterClass: Class): ClassActionsResult {
  const className = getClassDisplayName(characterClass);
  let classSpecificActions: ClassAction[] = [];

  // Determine class-specific actions based on the character's class
  switch (characterClass) {
    case Class.FIGHTER:
      classSpecificActions = FIGHTER_ACTIONS;
      break;

    case Class.BARBARIAN:
      classSpecificActions = BARBARIAN_ACTIONS;
      break;

    case Class.ROGUE:
      classSpecificActions = ROGUE_ACTIONS;
      break;

    case Class.WIZARD:
    case Class.SORCERER:
    case Class.WARLOCK:
    case Class.BARD:
    case Class.CLERIC:
    case Class.DRUID:
    case Class.PALADIN:
      classSpecificActions = [SPELL_ACTION];
      break;

    // Default case for classes without specific quick actions
    // This includes Monk and Ranger, and handles UNSPECIFIED
    default:
      classSpecificActions = [ABILITY_ACTION];
      break;
  }

  // Combine common actions with class-specific actions
  // Order: Attack, Move, [Class-Specific], Backpack, End Turn
  const actions: ClassAction[] = [
    COMMON_ACTIONS[0], // Attack
    COMMON_ACTIONS[1], // Move
    ...classSpecificActions, // Class-specific actions in the middle
    COMMON_ACTIONS[2], // Backpack
    COMMON_ACTIONS[3], // End Turn (always last)
  ];

  return {
    actions,
    className,
  };
}

/**
 * Check if a class is a spellcasting class.
 * Useful for conditional UI logic.
 *
 * @param characterClass - The Class enum value
 * @returns true if the class is a primary spellcaster
 */
export function isSpellcaster(characterClass: Class): boolean {
  return SPELLCASTING_CLASSES.includes(characterClass);
}

/**
 * Get a specific action by ID from a class's available actions.
 * Useful for looking up action details when handling button clicks.
 *
 * @param characterClass - The Class enum value
 * @param actionId - The unique ID of the action to find
 * @returns The ClassAction if found, undefined otherwise
 */
export function getActionById(
  characterClass: Class,
  actionId: string
): ClassAction | undefined {
  const { actions } = getClassActions(characterClass);
  return actions.find((action) => action.id === actionId);
}
