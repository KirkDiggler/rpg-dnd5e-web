/**
 * Damage source icon mapping for combat log display.
 * Maps source strings from DamageComponent to emoji icons with labels.
 */

export interface DamageSourceDisplay {
  icon: string;
  label: string;
  description?: string;
}

/**
 * Get display info for a damage source.
 * Handles core sources (weapon, ability) and fighting styles.
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
 */
export function isNatural1(roll: number): boolean {
  return roll === 1;
}

/**
 * Check if a dice roll is max for its die type.
 * We infer die type from common D&D dice.
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
