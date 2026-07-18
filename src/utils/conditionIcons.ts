/**
 * Condition display information for D&D 5e conditions and character states.
 * Provides icons, labels, colors, and descriptions for condition badges in the UI.
 */

/**
 * Display information for a condition badge.
 */
export interface ConditionDisplay {
  /** Emoji icon representing the condition (always present — the fallback
   *  when no Synty PNG is mapped, or when the caller renders text-only). */
  icon: string;
  /** Display name (capitalized) shown in the UI */
  label: string;
  /** Optional color for styling (e.g., '#ef4444' for negative conditions) */
  color?: string;
  /** Brief description of the condition's effects */
  description?: string;
  /**
   * Optional path to a Synty HUD status icon PNG under
   * `public/models/synty/ui/status/` (#467). Visual badge surfaces should
   * prefer this over `icon` when present and fall back to the emoji
   * otherwise — unmapped/unknown conditions never get a broken image.
   */
  iconUrl?: string;
}

/**
 * Standard D&D 5e conditions.
 * These are the core conditions defined in the Player's Handbook.
 */
const STANDARD_CONDITIONS: Record<string, ConditionDisplay> = {
  blinded: {
    icon: '👁️',
    label: 'Blinded',
    color: '#ef4444', // red - negative
    description: 'Cannot see, fails ability checks requiring sight',
  },
  charmed: {
    icon: '💖',
    label: 'Charmed',
    color: '#ef4444', // red - negative
    description: "Can't attack charmer, charmer has advantage on social checks",
  },
  deafened: {
    icon: '🔇',
    label: 'Deafened',
    color: '#ef4444', // red - negative
    description: 'Cannot hear, fails ability checks requiring hearing',
  },
  exhaustion: {
    icon: '😴',
    label: 'Exhaustion',
    color: '#dc2626', // darker red - very negative
    description: 'Cumulative penalties, can be fatal at level 6',
  },
  frightened: {
    icon: '😱',
    label: 'Frightened',
    color: '#ef4444', // red - negative
    description: 'Disadvantage on checks/attacks while source is in sight',
  },
  grappled: {
    icon: '🤝',
    label: 'Grappled',
    color: '#f97316', // orange - moderate negative
    description: 'Speed becomes 0, cannot benefit from bonuses to speed',
  },
  incapacitated: {
    icon: '🚫',
    label: 'Incapacitated',
    color: '#dc2626', // darker red - very negative
    description: 'Cannot take actions or reactions',
  },
  invisible: {
    icon: '👻',
    label: 'Invisible',
    color: '#3b82f6', // blue - positive
    description: 'Cannot be seen, attacks have advantage',
  },
  paralyzed: {
    icon: '⚡',
    label: 'Paralyzed',
    color: '#dc2626', // darker red - very negative
    description:
      'Incapacitated, auto-fail STR/DEX saves, attacks have advantage',
  },
  petrified: {
    icon: '🗿',
    label: 'Petrified',
    color: '#dc2626', // darker red - very negative
    description: 'Turned to stone, incapacitated, resistant to all damage',
  },
  poisoned: {
    icon: '☠️',
    label: 'Poisoned',
    color: '#84cc16', // lime green - poison color
    description: 'Disadvantage on attack rolls and ability checks',
  },
  prone: {
    icon: '🔻',
    label: 'Prone',
    color: '#f97316', // orange - moderate negative
    description: 'Disadvantage on attacks, attacks against have advantage',
  },
  restrained: {
    icon: '⛓️',
    label: 'Restrained',
    color: '#ef4444', // red - negative
    description: 'Speed 0, disadvantage on attacks and DEX saves',
  },
  entangled: {
    icon: '🕸️',
    label: 'Entangled',
    color: '#84cc16', // lime green - matches restrained's speed-limiting theme
    description: 'Bound by webbing or vines, movement restricted',
  },
  bleeding: {
    icon: '🩸',
    label: 'Bleeding',
    color: '#dc2626', // darker red - damage over time
    description: 'Taking damage over time from an open wound',
  },
  cursed: {
    icon: '🌑',
    label: 'Cursed',
    color: '#7c3aed', // purple - curse color
    description: 'Afflicted by a curse with an ongoing negative effect',
  },
  stunned: {
    icon: '💫',
    label: 'Stunned',
    color: '#dc2626', // darker red - very negative
    description:
      'Incapacitated, auto-fail STR/DEX saves, attacks have advantage',
  },
  unconscious: {
    icon: '💤',
    label: 'Unconscious',
    color: '#dc2626', // darker red - very negative
    description: 'Incapacitated, prone, auto-fail STR/DEX saves',
  },
};

/**
 * Class ability and buff conditions.
 * These are positive effects from class features or spells.
 */
const BUFF_CONDITIONS: Record<string, ConditionDisplay> = {
  raging: {
    icon: '🔥',
    label: 'Raging',
    color: '#f97316', // orange - barbarian rage color
    description: 'Bonus damage, resistance to physical damage',
  },
  rage: {
    icon: '🔥',
    label: 'Rage',
    color: '#f97316', // orange - barbarian rage color
    description: 'Bonus damage, resistance to physical damage',
  },
  blessed: {
    icon: '✨',
    label: 'Blessed',
    color: '#fbbf24', // amber - divine color
    description: 'Bonus to attack rolls and saving throws',
  },
  bless: {
    icon: '✨',
    label: 'Bless',
    color: '#fbbf24', // amber - divine color
    description: 'Bonus to attack rolls and saving throws',
  },
  concentrating: {
    icon: '🧠',
    label: 'Concentrating',
    color: '#8b5cf6', // purple - magic/focus color
    description: 'Maintaining a spell, can break on damage',
  },
  hasted: {
    icon: '⚡',
    label: 'Hasted',
    color: '#10b981', // green - positive
    description: 'Extra action, doubled speed, bonus to AC and DEX saves',
  },
  slowed: {
    icon: '🐌',
    label: 'Slowed',
    color: '#ef4444', // red - negative
    description: 'Reduced speed and AC, disadvantage on DEX saves',
  },
  inspired: {
    icon: '🎵',
    label: 'Inspired',
    color: '#ec4899', // pink - bardic inspiration
    description:
      'Can add Bardic Inspiration die to ability check, attack, or save',
  },
};

/**
 * Combat-ability action states.
 * Temporary conditions granted by taking a combat action (Dodge/Hide/Help),
 * as opposed to a class feature or spell. Beat 2 (#430) is the first wave
 * to populate real StatusApplied data for these three refs on the v1alpha2
 * encounter stream.
 */
const ACTION_STATE_CONDITIONS: Record<string, ConditionDisplay> = {
  dodging: {
    icon: '🏃',
    label: 'Dodging',
    color: '#3b82f6', // blue - positive (for the holder)
    description:
      'Attacks against you have disadvantage; advantage on DEX saves',
  },
  hidden: {
    icon: '🫥',
    label: 'Hidden',
    color: '#3b82f6', // blue - positive (for the holder)
    description:
      'Your attacks have advantage; attacks against you have disadvantage',
  },
  helped: {
    icon: '🙌',
    label: 'Helped',
    color: '#3b82f6', // blue - positive (for the holder)
    description: 'Advantage on your next attack roll',
  },
};

/**
 * Combat state conditions.
 * These represent special combat states like dying or dead.
 */
const COMBAT_STATE_CONDITIONS: Record<string, ConditionDisplay> = {
  dying: {
    icon: '💀',
    label: 'Dying',
    color: '#dc2626', // dark red - critical
    description: 'Making death saving throws, stabilizes at 3 successes',
  },
  stable: {
    icon: '🩹',
    label: 'Stable',
    color: '#6b7280', // gray - neutral
    description: 'Unconscious but not dying, will regain 1 HP in 1d4 hours',
  },
  dead: {
    icon: '☠️',
    label: 'Dead',
    color: '#1f2937', // dark gray - final
    description: 'Character has died, requires resurrection magic',
  },
};

/**
 * Default condition display for unknown conditions.
 */
const DEFAULT_CONDITION: ConditionDisplay = {
  icon: '❓',
  label: 'Unknown',
  color: '#6b7280', // gray - neutral
  description: 'Unknown condition',
};

/**
 * Synty HUD status icon pack (rpg-game-assets:harness/models/synty/ui/status,
 * synced into `public/models/synty/ui/status/` by `npm run assets:sync`,
 * #467). File names follow `ICON_FantasyWarrior_Status_<Name>_Clean.png`;
 * this table only needs the `<Name>` part.
 *
 * Conditions with a direct entry here get their specific icon. Everything
 * else falls through `resolveIconUrl` to the generic buff (Up01) or debuff
 * (Cursed01) icon based on `isPositiveCondition`/`isNegativeCondition`, and
 * conditions that are neither (or entirely unknown, e.g. custom server
 * strings) get no `iconUrl` at all — callers must fall back to `icon`
 * (emoji) rather than render a broken image.
 */
const SYNTY_STATUS_ICON_BASE = '/models/synty/ui/status';

const CONDITION_ICON_NAMES: Record<string, string> = {
  raging: 'AttackUp01',
  rage: 'AttackUp01', // alias of raging
  dodging: 'Defense01',
  unconscious: 'Down01',
  dying: 'Down01',
  dead: 'Dead01',
  helped: 'Up01',
  cursed: 'Cursed01',
  bleeding: 'Bleeding01',
  poisoned: 'Poisoned01',
  entangled: 'Entangled01',
  restrained: 'Entangled01',
  charmed: 'Charmed01',
};

const GENERIC_BUFF_ICON_NAME = 'Up01';
const GENERIC_DEBUFF_ICON_NAME = 'Cursed01';

function iconNameToUrl(name: string): string {
  return `${SYNTY_STATUS_ICON_BASE}/ICON_FantasyWarrior_Status_${name}_Clean.png`;
}

/**
 * Resolve a Synty status icon URL for a normalized condition id, if any.
 * Direct mappings win; otherwise positive/negative conditions fall back to
 * the generic buff/debuff icon. Returns undefined (no icon) for anything
 * neither directly mapped nor classifiable as a buff/debuff — callers must
 * use the emoji `icon` in that case.
 */
function resolveIconUrl(normalized: string): string | undefined {
  const direct = CONDITION_ICON_NAMES[normalized];
  if (direct) {
    return iconNameToUrl(direct);
  }
  if (isPositiveCondition(normalized)) {
    return iconNameToUrl(GENERIC_BUFF_ICON_NAME);
  }
  if (isNegativeCondition(normalized)) {
    return iconNameToUrl(GENERIC_DEBUFF_ICON_NAME);
  }
  return undefined;
}

/**
 * Get display information for a condition.
 * Handles case-insensitive matching and provides sensible defaults.
 *
 * @param conditionName - The name of the condition (case-insensitive)
 * @returns ConditionDisplay with icon, label, color, description, and
 *   (when a Synty PNG is mapped) iconUrl
 *
 * @example
 * ```typescript
 * const display = getConditionDisplay('Raging');
 * // Returns: { icon: '🔥', label: 'Raging', color: '#f97316', description: '...',
 * //            iconUrl: '/models/synty/ui/status/ICON_FantasyWarrior_Status_AttackUp01_Clean.png' }
 *
 * const display2 = getConditionDisplay('POISONED');
 * // Returns: { icon: '☠️', label: 'Poisoned', color: '#84cc16', description: '...', iconUrl: '...' }
 * ```
 */
export function getConditionDisplay(conditionName: string): ConditionDisplay {
  // Normalize input: trim whitespace and convert to lowercase
  const normalized = conditionName.trim().toLowerCase();

  const base = resolveBaseDisplay(normalized, conditionName);
  const iconUrl = resolveIconUrl(normalized);
  return iconUrl ? { ...base, iconUrl } : base;
}

/**
 * Look up the base (emoji-only) display info for a normalized condition id,
 * without the Synty iconUrl attached. Split out so `getConditionDisplay` can
 * layer `iconUrl` on top in one place.
 */
function resolveBaseDisplay(
  normalized: string,
  originalName: string
): ConditionDisplay {
  // Check standard D&D conditions first
  if (STANDARD_CONDITIONS[normalized]) {
    return STANDARD_CONDITIONS[normalized];
  }

  // Check buff/class ability conditions
  if (BUFF_CONDITIONS[normalized]) {
    return BUFF_CONDITIONS[normalized];
  }

  // Check combat state conditions
  if (COMBAT_STATE_CONDITIONS[normalized]) {
    return COMBAT_STATE_CONDITIONS[normalized];
  }

  // Check combat-ability action states (Dodge/Hide/Help)
  if (ACTION_STATE_CONDITIONS[normalized]) {
    return ACTION_STATE_CONDITIONS[normalized];
  }

  // Return default for unknown conditions
  // Use the original (non-normalized) name for the label, but capitalize it
  return {
    ...DEFAULT_CONDITION,
    label: originalName.charAt(0).toUpperCase() + originalName.slice(1),
  };
}

/**
 * Get all available condition displays.
 * Useful for displaying condition lists or autocomplete.
 *
 * Routed through `getConditionDisplay` (rather than reading the maps
 * directly) so each entry carries `iconUrl` when one is mapped.
 *
 * @returns Array of all known condition displays
 */
export function getAllConditions(): ConditionDisplay[] {
  const keys = [
    ...Object.keys(STANDARD_CONDITIONS),
    ...Object.keys(BUFF_CONDITIONS),
    ...Object.keys(COMBAT_STATE_CONDITIONS),
    ...Object.keys(ACTION_STATE_CONDITIONS),
  ];
  return keys.map((key) => getConditionDisplay(key));
}

/**
 * Check if a condition is a negative debuff.
 * Useful for conditional styling or filtering.
 *
 * @param conditionName - The name of the condition
 * @returns true if the condition is generally negative
 */
export function isNegativeCondition(conditionName: string): boolean {
  const normalized = conditionName.trim().toLowerCase();
  return (
    normalized in STANDARD_CONDITIONS ||
    normalized === 'slowed' ||
    normalized in COMBAT_STATE_CONDITIONS
  );
}

/**
 * Check if a condition is a positive buff.
 * Useful for conditional styling or filtering.
 *
 * @param conditionName - The name of the condition
 * @returns true if the condition is generally positive
 */
export function isPositiveCondition(conditionName: string): boolean {
  const normalized = conditionName.trim().toLowerCase();
  return (
    normalized in BUFF_CONDITIONS &&
    normalized !== 'slowed' &&
    normalized !== 'concentrating'
  );
}
