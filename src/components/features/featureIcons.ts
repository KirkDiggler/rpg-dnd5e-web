/**
 * Icon lookup map for character features and conditions.
 * Icons are keyed by feature/condition id.
 *
 * This is pure presentation data - the API is the source of truth
 * for what features a character has access to.
 */

/** Icons for activatable features */
export const FEATURE_ICONS: Record<string, string> = {
  // Barbarian
  rage: '🔥',
  reckless_attack: '💥',
  danger_sense: '⚠️',

  // Fighter
  second_wind: '💚',
  action_surge: '⚡',

  // Rogue
  sneak_attack: '🗡️',
  cunning_action: '🎭',

  // Monk
  flurry_of_blows: '👊',
  patient_defense: '🛡️',
  step_of_the_wind: '💨',

  // Common
  attack: '⚔️',
  move: '🏃',
  spell: '📜',
  ability: '✨',
};

/** Icons for active conditions */
export const CONDITION_ICONS: Record<string, string> = {
  // Class conditions (from features)
  raging: '🔥',

  // Fighting styles
  dueling: '⚔️',
  defense: '🛡️',
  great_weapon_fighting: '💪',
  two_weapon_fighting: '🗡️',
  archery: '🏹',
  protection: '🛡️',

  // Standard D&D conditions (debuffs)
  blinded: '👁️',
  charmed: '💕',
  deafened: '🔇',
  frightened: '😨',
  grappled: '🤼',
  incapacitated: '😵',
  invisible: '👻',
  paralyzed: '⚡',
  petrified: '🪨',
  poisoned: '☠️',
  prone: '🔽',
  restrained: '⛓️',
  stunned: '💫',
  unconscious: '😴',
  exhaustion: '😓',
};

/**
 * Get the icon for a feature by name.
 * Returns a default icon if not found.
 */
export function getFeatureIcon(featureName: string): string {
  // Normalize to lowercase snake_case for lookup
  const normalized = featureName.toLowerCase().replace(/\s+/g, '_');
  return FEATURE_ICONS[normalized] || FEATURE_ICONS[featureName] || '✨';
}

/**
 * Get the icon for a condition by id or name.
 * Returns a default icon if not found.
 */
export function getConditionIcon(conditionId: string): string {
  // Try direct lookup first
  if (CONDITION_ICONS[conditionId]) {
    return CONDITION_ICONS[conditionId];
  }

  // Try lowercase
  const lowerId = conditionId.toLowerCase();
  if (CONDITION_ICONS[lowerId]) {
    return CONDITION_ICONS[lowerId];
  }

  // Default
  return '⭐';
}

/**
 * Parse a source ref string to extract the category.
 * e.g., "dnd5e:classes:barbarian" -> "classes"
 *       "dnd5e:conditions:frightened" -> "conditions"
 */
export function parseSourceCategory(sourceRef: string): string | null {
  const parts = sourceRef.split(':');
  if (parts.length >= 2) {
    return parts[1];
  }
  return null;
}

/**
 * Get styling category based on source ref.
 * Used to determine visual styling for conditions.
 */
export type ConditionCategory =
  | 'class'
  | 'fighting-style'
  | 'racial'
  | 'debuff'
  | 'buff'
  | 'unknown';

export function getConditionCategory(sourceRef: string): ConditionCategory {
  const category = parseSourceCategory(sourceRef);

  switch (category) {
    case 'classes':
      return 'class';
    case 'fighting-styles':
      return 'fighting-style';
    case 'races':
      return 'racial';
    case 'conditions':
      return 'debuff';
    default:
      return 'unknown';
  }
}
