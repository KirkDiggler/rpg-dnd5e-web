/**
 * @deprecated This file is deprecated and should not be used for new code.
 *
 * MIGRATION:
 * - For damage source display: Use DamageSourceBadge component (src/components/combat/DamageSourceBadge.tsx)
 * - For type-safe enum displays: Use enumDisplays.ts and display components in src/components/enums/
 *
 * This file provided string-based damage source display before the introduction of
 * type-safe SourceRef in proto v0.1.55. All usage has been migrated to the new
 * DamageSourceBadge component which handles both legacy string sources and new
 * type-safe SourceRef fields.
 *
 * The dice roll utility functions (isNatural1, isMaxRoll, getDiceRollStyle) are
 * also unused - dice roll highlighting is now handled inline where needed.
 *
 * This file will be removed in a future cleanup.
 */

/**
 * @deprecated Use DamageSourceBadge component instead
 */
export interface DamageSourceDisplay {
  icon: string;
  label: string;
  description?: string;
}

/**
 * Get display info for a damage source.
 * Handles core sources (weapon, ability) and fighting styles.
 *
 * @deprecated Use DamageSourceBadge component instead
 */
export function getDamageSourceDisplay(source: string): DamageSourceDisplay {
  // Core sources
  if (source === 'weapon') {
    return { icon: '⚔️', label: 'Weapon', description: 'Base weapon damage' };
  }
  if (source === 'ability') {
    return {
      icon: '💪',
      label: 'Ability',
      description: 'Ability modifier bonus',
    };
  }

  // Fighting styles (dnd5e:conditions:fighting_style_*)
  if (source.includes('fighting_style_dueling')) {
    return {
      icon: '🤺',
      label: 'Dueling',
      description: '+2 damage when wielding a one-handed weapon',
    };
  }
  if (source.includes('fighting_style_great_weapon')) {
    return {
      icon: '🗡️',
      label: 'Great Weapon Fighting',
      description: 'Reroll 1s and 2s on damage dice',
    };
  }
  if (source.includes('fighting_style_defense')) {
    return {
      icon: '🛡️',
      label: 'Defense',
      description: '+1 AC when wearing armor',
    };
  }
  if (source.includes('fighting_style_two_weapon')) {
    return {
      icon: '⚔️',
      label: 'Two-Weapon Fighting',
      description: 'Add ability modifier to off-hand damage',
    };
  }
  if (source.includes('fighting_style_archery')) {
    return {
      icon: '🏹',
      label: 'Archery',
      description: '+2 bonus to ranged attack rolls',
    };
  }
  if (source.includes('fighting_style_protection')) {
    return {
      icon: '🛡️',
      label: 'Protection',
      description: 'Impose disadvantage on attacks against allies',
    };
  }

  // Fallback - extract readable name from source string
  return {
    icon: '✨',
    label: formatSourceName(source),
    description: source,
  };
}

/**
 * Format a source string into a readable label.
 * Handles patterns like "dnd5e:conditions:some_effect" -> "Some Effect"
 *
 * @deprecated Use DamageSourceBadge component instead
 */
function formatSourceName(source: string): string {
  // Extract the last segment after colons
  const parts = source.split(':');
  const name = parts[parts.length - 1];

  // Convert snake_case to Title Case
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Check if a dice roll is a natural 1 (fumble).
 *
 * @deprecated Inline this simple check where needed instead
 */
export function isNatural1(roll: number): boolean {
  return roll === 1;
}

/**
 * Check if a dice roll is max for its die type.
 * We infer die type from common D&D dice.
 *
 * @deprecated Inline this check where needed instead
 */
export function isMaxRoll(roll: number, dieMax?: number): boolean {
  if (dieMax) {
    return roll === dieMax;
  }
  // Common max values for D&D dice
  return [4, 6, 8, 10, 12, 20].includes(roll);
}

/**
 * Get CSS class for dice roll styling.
 *
 * @deprecated Inline dice roll styling logic where needed instead
 */
export function getDiceRollStyle(
  roll: number,
  dieMax?: number
): 'natural-1' | 'max-roll' | 'normal' {
  if (isNatural1(roll)) {
    return 'natural-1';
  }
  if (isMaxRoll(roll, dieMax)) {
    return 'max-roll';
  }
  return 'normal';
}
